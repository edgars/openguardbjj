import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.ts';
import { PermanentError } from './errors.ts';
import { lastLines, run } from './proc.ts';

export interface ProbeInfo {
  durationSeconds: number;
  formatName: string;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export async function probe(file: string, signal?: AbortSignal): Promise<ProbeInfo> {
  const res = await run(config.ffprobeBin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { signal });
  if (res.code !== 0) throw new PermanentError('Arquivo de mídia inválido ou corrompido.', lastLines(res.stderr));
  const data = JSON.parse(res.stdout) as {
    format?: { duration?: string; format_name?: string; size?: string };
    streams?: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; duration?: string }>;
  };
  const v = data.streams?.find((s) => s.codec_type === 'video');
  const a = data.streams?.find((s) => s.codec_type === 'audio');
  const { size } = await stat(file);
  return {
    durationSeconds: Number(data.format?.duration ?? v?.duration ?? 0) || 0,
    formatName: data.format?.format_name ?? '',
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    width: v?.width ?? null,
    height: v?.height ?? null,
    sizeBytes: size,
  };
}

/** Lê "-progress pipe:1" do ffmpeg e reporta 0–100 com base na duração. */
function progressReader(durationSeconds: number, onProgress?: (pct: number) => void) {
  return (line: string) => {
    const m = line.match(/^out_time_(?:us|ms)=(\d+)/);
    if (m && durationSeconds > 0 && onProgress) {
      onProgress(Math.min(100, (Number(m[1]) / 1e6 / durationSeconds) * 100));
    }
  };
}

/**
 * Garante MP4 H.264/AAC com faststart (moov no início → streaming/seek imediato no player).
 * Remux sem perdas se já compatível; caso contrário, transcodifica limitando a altura.
 */
export async function normalizeToMp4(
  input: string,
  output: string,
  maxHeight: number,
  info: ProbeInfo,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<'remux' | 'transcode'> {
  if (!info.videoCodec) throw new PermanentError('O arquivo não contém faixa de vídeo.');
  const compatible =
    info.videoCodec === 'h264' &&
    (info.audioCodec === null || info.audioCodec === 'aac') &&
    /mp4|mov/.test(info.formatName) &&
    (info.height ?? 0) <= maxHeight + 8;

  const base = ['-y', '-hide_banner', '-nostats', '-progress', 'pipe:1', '-i', input, '-map', '0:v:0', '-map', '0:a:0?'];
  const args = compatible
    ? [...base, '-c', 'copy', '-movflags', '+faststart', output]
    : [
        ...base,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
        '-vf', `scale=-2:'trunc(min(${maxHeight},ih)/2)*2'`,
        '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
        '-movflags', '+faststart',
        output,
      ];
  const res = await run(config.ffmpegBin, args, { signal, onStdoutLine: progressReader(info.durationSeconds, onProgress) });
  if (res.code !== 0) throw new PermanentError('Falha na conversão FFmpeg.', lastLines(res.stderr));
  return compatible ? 'remux' : 'transcode';
}

/** Áudio mono 16 kHz MP3 — leve para armazenar e ideal para Whisper. */
export async function extractAudio(input: string, output: string, signal?: AbortSignal): Promise<string> {
  const res = await run(
    config.ffmpegBin,
    ['-y', '-hide_banner', '-nostats', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', output],
    { signal },
  );
  if (res.code !== 0) throw new PermanentError('Falha ao extrair áudio.', lastLines(res.stderr));
  return output;
}

/** Thumbnail JPG 640px: usa a imagem da origem se houver, senão captura um frame do vídeo. */
export async function makeThumbnail(
  video: string,
  dir: string,
  durationSeconds: number,
  sourceUrl?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const out = path.join(dir, 'thumbnail.jpg');
  if (sourceUrl) {
    try {
      const resp = await fetch(sourceUrl, { signal });
      if (resp.ok) {
        const src = path.join(dir, 'thumbnail.src');
        await writeFile(src, Buffer.from(await resp.arrayBuffer()));
        const r = await run(config.ffmpegBin, ['-y', '-hide_banner', '-i', src, '-vf', 'scale=640:-2', '-frames:v', '1', '-q:v', '3', out], { signal });
        if (r.code === 0) return out;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }
  const at = Math.max(0, Math.min(durationSeconds * 0.1, 10));
  const r = await run(
    config.ffmpegBin,
    ['-y', '-hide_banner', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', out],
    { signal },
  );
  return r.code === 0 ? out : null;
}
