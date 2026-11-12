/**
 * Executa download → conversão → áudio → thumbnail → transcrição → análise LOCALMENTE,
 * sem banco e sem Blob. Serve para validar a cadeia de ferramentas no seu Mac.
 *
 *   npm run worker:dry-run -- <url-autorizada> [480|720|1080] [--no-transcribe]
 *
 * Os arquivos ficam em WORKER_TMP_DIR/dry-run-<timestamp>/ para inspeção.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseVideoUrl } from '@bjj/core/url';
import { analyzeTechniques } from './analyze.ts';
import { config } from './config.ts';
import { describe } from './errors.ts';
import { extractAudio, makeThumbnail, normalizeToMp4, probe } from './ffmpeg.ts';
import { transcribe } from './transcribe.ts';
import { downloadVideo, fetchMetadata } from './ytdlp.ts';

const [url, q = '720', ...flags] = process.argv.slice(2);
if (!url) {
  console.error('Uso: npm run worker:dry-run -- <url> [480|720|1080] [--no-transcribe]');
  process.exit(2);
}
const parsed = parseVideoUrl(url);
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(2);
}
const quality = Number(q);
const dir = path.join(config.tmpRoot, `dry-run-${Date.now()}`);
await mkdir(dir, { recursive: true });
const t0 = Date.now();
const step = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

try {
  step(`plataforma ${parsed.platform}, id ${parsed.externalId}`);
  const meta = await fetchMetadata(parsed.normalizedUrl, quality);
  step(`metadados: "${meta.title}" — ${meta.duration}s — ${meta.uploader ?? meta.channel}`);
  let lastPct = -10;
  const src = await downloadVideo(parsed.normalizedUrl, quality, dir, Math.max(1, meta.requested_formats?.length ?? 1), (p) => {
    if (p.percent - lastPct >= 10 || p.percent === 100) {
      lastPct = p.percent;
      step(`download ${p.percent.toFixed(0)}% (${(p.downloadedBytes / 1048576).toFixed(1)} MB)`);
    }
  });
  const srcInfo = await probe(src);
  step(`baixado: ${path.basename(src)} ${srcInfo.videoCodec}/${srcInfo.audioCodec} ${srcInfo.width}x${srcInfo.height}`);
  const mp4 = path.join(dir, 'original.mp4');
  const mode = await normalizeToMp4(src, mp4, quality, srcInfo);
  const info = await probe(mp4);
  step(`MP4 (${mode}): ${info.videoCodec}/${info.audioCodec} ${info.width}x${info.height} ${(info.sizeBytes / 1048576).toFixed(1)} MB`);
  const audio = info.audioCodec ? await extractAudio(mp4, path.join(dir, 'audio.mp3')) : null;
  const thumb = await makeThumbnail(mp4, dir, info.durationSeconds, meta.thumbnail);
  step(`áudio: ${audio ?? 'sem faixa'}; thumbnail: ${thumb ?? 'falhou'}`);
  if (audio && !flags.includes('--no-transcribe')) {
    const tr = await transcribe(audio, dir, () => {});
    step(`transcrição (${tr.language}, ${tr.model}): ${tr.segments.length} segmentos`);
    for (const s of tr.segments.slice(0, 5)) console.log(`   [${s.start.toFixed(1)}] ${s.text}`);
    const hits = await analyzeTechniques(tr.segments);
    step(`técnicas: ${hits.map((h) => `${h.slug}@${h.start.toFixed(0)}s`).join(', ') || 'nenhuma'}`);
  }
  step(`OK — arquivos em ${dir}`);
} catch (err) {
  console.error(`✖ ${describe(err)}`);
  process.exit(1);
}
