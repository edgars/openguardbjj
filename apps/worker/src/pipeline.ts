import { rm } from 'node:fs/promises';
import path from 'node:path';
import { query, queryOne, withTransaction } from '@bjj/core/db';
import type { Segment } from '@bjj/core/classifier';
import type { Quality, VideoStage } from '@bjj/core/status';
import { VercelBlobStorageService, type StoredAsset } from '@bjj/core/storage';
import { analyzeTechniques } from './analyze.ts';
import { config } from './config.ts';
import { PermanentError } from './errors.ts';
import { extractAudio, makeThumbnail, normalizeToMp4, probe, type ProbeInfo } from './ffmpeg.ts';
import { setStage, type JobRow } from './jobs.ts';
import { transcribe } from './transcribe.ts';
import { downloadVideo, fetchMetadata } from './ytdlp.ts';

export interface VideoRow {
  id: string;
  platform: string;
  source_url: string | null;
  title: string | null;
  description: string | null;
  duration_seconds: number | null;
  blob_pathname: string | null;
  audio_pathname: string | null;
  thumbnail_pathname: string | null;
  requested_quality: Quality;
  download_authorized: boolean;
  auto_transcribe: boolean;
  auto_analyze: boolean;
  transcription_status: string;
  analysis_status: string;
}

export interface PipelineContext {
  job: JobRow;
  video: VideoRow;
  dir: string;
  signal: AbortSignal;
  storage: VercelBlobStorageService;
  /** Blobs enviados neste job — apagados se o usuário cancelar. */
  uploaded: string[];
  log: (msg: string) => void;
}

/** Limita escritas de progresso no banco (~1 a cada 1,5 s por etapa). */
function throttledStage(ctx: PipelineContext, stage: VideoStage) {
  let last = 0;
  return (pct: number, extra?: { bytesDownloaded?: number | null; bytesTotal?: number | null }) => {
    const now = Date.now();
    if (now - last < 1500 && pct < 100) return;
    last = now;
    setStage(ctx.job, stage, pct, extra).catch((e) => ctx.log(`progresso não gravado: ${e.message}`));
  };
}

export async function loadVideo(id: string): Promise<VideoRow> {
  const v = await queryOne<VideoRow>('select * from videos where id = $1', [id]);
  if (!v) throw new PermanentError('Vídeo não encontrado (pode ter sido apagado).');
  return v;
}

export async function runPipeline(ctx: PipelineContext): Promise<void> {
  switch (ctx.job.kind) {
    case 'INGEST':
      return ingestFromUrl(ctx);
    case 'PROCESS_UPLOAD':
      return processUpload(ctx);
    case 'RETRANSCRIBE':
      return reprocess(ctx, { transcribe: true, analyze: ctx.job.options.analyze ?? true });
    case 'REANALYZE':
      return reprocess(ctx, { transcribe: false, analyze: true });
  }
}

// ---------------------------------------------------------------- INGEST (URL)

async function ingestFromUrl(ctx: PipelineContext) {
  const { job, video, dir, signal } = ctx;
  if (!video.download_authorized) throw new PermanentError('Download não autorizado pelo usuário para este vídeo.');
  if (!video.source_url) throw new PermanentError('Vídeo sem URL de origem.');

  // Idempotência: se uma tentativa anterior já enviou o MP4, não baixa de novo.
  if (video.blob_pathname) {
    ctx.log('MP4 já está no Blob — pulando download, seguindo para pós-processamento.');
    return reprocess(ctx, pendingWork(video));
  }

  const quality = (job.options.quality ?? video.requested_quality ?? 720) as Quality;

  await setStage(job, 'EXTRACTING_METADATA', 0);
  const meta = await fetchMetadata(video.source_url, quality, signal);
  if (meta.is_live || meta.live_status === 'is_live' || meta.live_status === 'is_upcoming') {
    throw new PermanentError('Transmissões ao vivo/agendadas não são suportadas.');
  }
  if (meta.duration && meta.duration > config.maxDurationSeconds) {
    throw new PermanentError(`Vídeo com ${Math.round(meta.duration / 60)} min excede o limite (MAX_DURATION_SECONDS=${config.maxDurationSeconds}).`);
  }
  const estimated = meta.filesize_approx ?? meta.requested_formats?.reduce((s, f) => s + (f.filesize ?? f.filesize_approx ?? 0), 0) ?? null;
  if (estimated && estimated > config.maxFileSizeBytes * 1.5) {
    throw new PermanentError(`Tamanho estimado (${Math.round(estimated / 1048576)} MB) excede o limite configurado.`);
  }
  await query(
    `update videos set title = coalesce($2, title), description = $3, author = $4, duration_seconds = $5, external_id = coalesce($6, external_id)
      where id = $1`,
    [video.id, meta.title ?? null, meta.description ?? null, meta.uploader ?? meta.channel ?? null, meta.duration ?? null, meta.id ?? null],
  );
  await setStage(job, 'EXTRACTING_METADATA', 100);

  const dlProgress = throttledStage(ctx, 'DOWNLOADING');
  await setStage(job, 'DOWNLOADING', 0, { bytesTotal: estimated || null });
  const streams = Math.max(1, meta.requested_formats?.length ?? 1);
  const source = await downloadVideo(video.source_url, quality, dir, streams, (p) => dlProgress(p.percent, { bytesDownloaded: p.downloadedBytes, bytesTotal: estimated || p.totalBytes }), signal);
  await setStage(job, 'DOWNLOADING', 100);

  await convertUploadAndFinish(ctx, source, quality, meta.thumbnail);
}

// ---------------------------------------------------------------- PROCESS_UPLOAD (arquivo enviado pelo usuário)

async function processUpload(ctx: PipelineContext) {
  const { job, video, dir, signal, storage } = ctx;
  if (video.blob_pathname) {
    await deleteRawUpload(ctx);
    return reprocess(ctx, pendingWork(video));
  }
  const uploadPathname = job.options.uploadPathname;
  if (!uploadPathname) throw new PermanentError('Upload sem pathname associado.');

  await setStage(job, 'DOWNLOADING', 0);
  const source = path.join(dir, `upload${path.extname(uploadPathname) || '.bin'}`);
  await fetchAsset(ctx, uploadPathname, source, 'O arquivo enviado não está mais no Blob — envie-o novamente.');
  await setStage(job, 'DOWNLOADING', 100);

  const quality = (job.options.quality ?? video.requested_quality ?? 1080) as Quality;
  await convertUploadAndFinish(ctx, source, quality, undefined);
}

/** Só refaz o que ainda não foi concluído (retry após upload já feito). */
function pendingWork(video: VideoRow) {
  return {
    transcribe: video.auto_transcribe && video.transcription_status !== 'COMPLETED',
    analyze: video.auto_analyze && video.analysis_status !== 'COMPLETED',
  };
}

/** O MP4 normalizado já está no Blob: remove o upload bruto para não pagar storage em dobro. */
async function deleteRawUpload(ctx: PipelineContext) {
  const raw = ctx.job.kind === 'PROCESS_UPLOAD' ? ctx.job.options.uploadPathname : undefined;
  if (raw) await ctx.storage.deleteAsset(raw).catch((e) => ctx.log(`não removeu upload bruto: ${e.message}`));
}

/** Baixa um asset do Blob; inexistente vira falha definitiva (não adianta retry). */
async function fetchAsset(ctx: PipelineContext, assetId: string, dest: string, missingMessage: string) {
  try {
    await ctx.storage.downloadToFile(assetId, dest, ctx.signal);
  } catch (err) {
    if ((err as Error).name === 'AssetNotFoundError') throw new PermanentError(missingMessage);
    throw err;
  }
}

// ---------------------------------------------------------------- etapas compartilhadas

async function convertUploadAndFinish(ctx: PipelineContext, source: string, quality: Quality, thumbnailUrl?: string) {
  const { job, video, dir, signal, storage } = ctx;

  await setStage(job, 'CONVERTING', 0);
  const srcInfo = await probe(source, signal);
  if (srcInfo.durationSeconds > config.maxDurationSeconds) {
    throw new PermanentError(`Duração (${Math.round(srcInfo.durationSeconds / 60)} min) excede o limite configurado.`);
  }
  const mp4 = path.join(dir, 'original.mp4');
  const convProgress = throttledStage(ctx, 'CONVERTING');
  const mode = await normalizeToMp4(source, mp4, quality, srcInfo, (p) => convProgress(p * 0.8), signal);
  ctx.log(`FFmpeg: ${mode}`);
  await rm(source, { force: true });

  const info: ProbeInfo = await probe(mp4, signal);
  if (info.sizeBytes > config.maxFileSizeBytes) {
    throw new PermanentError(`MP4 final (${Math.round(info.sizeBytes / 1048576)} MB) excede MAX_FILE_SIZE_MB.`);
  }
  const audio = info.audioCodec ? await extractAudio(mp4, path.join(dir, 'audio.mp3'), signal) : null;
  const thumb = await makeThumbnail(mp4, dir, info.durationSeconds, thumbnailUrl, signal);
  await setStage(job, 'CONVERTING', 100);

  // UPLOADING — direto do worker para o Vercel Blob (nunca passa pela API do Next.js).
  const upProgress = throttledStage(ctx, 'UPLOADING');
  await setStage(job, 'UPLOADING', 0, { bytesTotal: info.sizeBytes });
  const videoAsset = await storage.uploadVideo(mp4, video.id, {
    signal,
    onProgress: (loaded, total) => upProgress((loaded / total) * 90, { bytesDownloaded: loaded, bytesTotal: total }),
  });
  ctx.uploaded.push(videoAsset.assetId);
  // Grava imediatamente: a partir daqui um retry nunca baixa de novo.
  await query(
    `update videos set video_blob_url = $2, blob_pathname = $3, file_size_bytes = $4, mime_type = 'video/mp4',
        resolution = $5, video_codec = $6, audio_codec = $7, duration_seconds = coalesce($8, duration_seconds)
      where id = $1`,
    [video.id, videoAsset.url, videoAsset.pathname, videoAsset.sizeBytes, info.width && info.height ? `${info.width}x${info.height}` : null,
     info.videoCodec, info.audioCodec, info.durationSeconds || null],
  );
  video.blob_pathname = videoAsset.pathname;
  await deleteRawUpload(ctx);

  let thumbAsset: StoredAsset | null = null;
  if (thumb) {
    thumbAsset = await storage.uploadThumbnail(thumb, video.id, { signal });
    ctx.uploaded.push(thumbAsset.assetId);
    await query('update videos set thumbnail_blob_url = $2, thumbnail_pathname = $3, thumbnail_size_bytes = $4 where id = $1', [
      video.id, thumbAsset.url, thumbAsset.pathname, thumbAsset.sizeBytes,
    ]);
  }
  if (audio && config.storeAudio) {
    const audioAsset = await storage.uploadAudio(audio, video.id, { signal });
    ctx.uploaded.push(audioAsset.assetId);
    await query('update videos set audio_blob_url = $2, audio_pathname = $3, audio_size_bytes = $4 where id = $1', [
      video.id, audioAsset.url, audioAsset.pathname, audioAsset.sizeBytes,
    ]);
    video.audio_pathname = audioAsset.pathname;
  }
  await setStage(job, 'UPLOADING', 100);
  await rm(mp4, { force: true });

  await postProcess(ctx, audio, { transcribe: video.auto_transcribe, analyze: video.auto_analyze });
}

/** Reprocessa a partir do que já está no Blob — sem baixar da origem. */
async function reprocess(ctx: PipelineContext, what: { transcribe: boolean; analyze: boolean }) {
  const { video, dir, signal, storage } = ctx;
  let audio: string | null = null;
  if (what.transcribe) {
    if (video.audio_pathname) {
      audio = path.join(dir, 'audio.mp3');
      await fetchAsset(ctx, video.audio_pathname, audio, 'Áudio armazenado não encontrado no Blob.');
    } else if (video.blob_pathname) {
      const mp4 = path.join(dir, 'original.mp4');
      await fetchAsset(ctx, video.blob_pathname, mp4, 'MP4 armazenado não encontrado no Blob.');
      const info = await probe(mp4, signal);
      audio = info.audioCodec ? await extractAudio(mp4, path.join(dir, 'audio.mp3'), signal) : null;
      await rm(mp4, { force: true });
    } else {
      throw new PermanentError('Não há vídeo nem áudio armazenado para transcrever. Importe o vídeo novamente.');
    }
  }
  await postProcess(ctx, audio, what);
}

async function postProcess(ctx: PipelineContext, audio: string | null, what: { transcribe: boolean; analyze: boolean }) {
  const { job, video, dir, signal } = ctx;
  let segments: Segment[] | null = null;

  if (what.transcribe) {
    await setStage(job, 'TRANSCRIBING', 0);
    await query(`update videos set transcription_status = 'PROCESSING' where id = $1`, [video.id]);
    try {
      if (!audio) throw new Error('O vídeo não possui faixa de áudio.');
      const tProgress = throttledStage(ctx, 'TRANSCRIBING');
      const result = await transcribe(audio, dir, (p) => tProgress(p), signal);
      segments = result.segments;
      await saveTranscript(video.id, result.language, result.model, result.segments);
      await query(`update videos set transcription_status = 'COMPLETED' where id = $1`, [video.id]);
    } catch (err) {
      if (signal.aborted) throw err;
      // Falha na transcrição não invalida o vídeo já armazenado: registra e segue.
      const msg = (err as Error).message;
      ctx.log(`transcrição falhou: ${msg}`);
      await query(`update videos set transcription_status = 'FAILED' where id = $1`, [video.id]);
      await query(`update download_jobs set error_message = $2 where id = $1`, [job.id, `Transcrição: ${msg}`]);
    }
  }

  if (what.analyze) {
    await setStage(job, 'ANALYZING', 0);
    await query(`update videos set analysis_status = 'PROCESSING' where id = $1`, [video.id]);
    segments ??= await loadSegments(video.id);
    if (!segments.length) {
      // Sem transcrição: analisa ao menos título e descrição (sem timestamp preciso).
      const fresh = await queryOne<{ title: string | null; description: string | null }>('select title, description from videos where id = $1', [video.id]);
      const text = [fresh?.title, fresh?.description].filter(Boolean).join('. ');
      if (text) segments = [{ start: 0, end: 0, text }];
    }
    const hits = await analyzeTechniques(segments, signal);
    await withTransaction(async (c) => {
      await c.query(`delete from video_techniques where video_id = $1 and source in ('keyword','llm')`, [video.id]);
      for (const h of hits) {
        await c.query(
          `insert into video_techniques (video_id, technique_id, start_seconds, end_seconds, confidence, mentions, source, evidence)
           select $1, id, $3, $4, $5, $6, $7, $8 from techniques where slug = $2`,
          [video.id, h.slug, h.start, h.end, h.confidence, h.mentions, h.source, h.evidence],
        );
      }
    });
    await query(`update videos set analysis_status = 'COMPLETED' where id = $1`, [video.id]);
    ctx.log(`${hits.length} técnica(s) identificada(s)`);
  }
}

async function saveTranscript(videoId: string, language: string | null, model: string, segments: Segment[]) {
  await withTransaction(async (c) => {
    await c.query('delete from transcripts where video_id = $1', [videoId]);
    const fullText = segments.map((s) => s.text).join(' ');
    const { rows } = await c.query<{ id: string }>(
      'insert into transcripts (video_id, language, model, full_text) values ($1,$2,$3,$4) returning id',
      [videoId, language, model, fullText],
    );
    const tid = rows[0]!.id;
    // Inserção em lotes para transcrições longas.
    for (let i = 0; i < segments.length; i += 200) {
      const batch = segments.slice(i, i + 200);
      const values: unknown[] = [];
      const tuples = batch.map((s, j) => {
        values.push(tid, videoId, i + j, s.start, s.end, s.text);
        const b = j * 6;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
      });
      await c.query(`insert into transcript_segments (transcript_id, video_id, idx, start_seconds, end_seconds, text) values ${tuples.join(',')}`, values);
    }
  });
}

async function loadSegments(videoId: string): Promise<Segment[]> {
  const rows = await query<{ start_seconds: number; end_seconds: number; text: string }>(
    'select start_seconds, end_seconds, text from transcript_segments where video_id = $1 order by idx',
    [videoId],
  );
  return rows.map((r) => ({ start: r.start_seconds, end: r.end_seconds, text: r.text }));
}
