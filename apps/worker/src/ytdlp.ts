import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.ts';
import { classifyYtDlpError, PermanentError } from './errors.ts';
import { run } from './proc.ts';

export interface YtMetadata {
  id: string;
  title?: string;
  description?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  is_live?: boolean;
  live_status?: string;
  availability?: string;
  filesize_approx?: number;
  requested_formats?: Array<{ format_id: string; filesize?: number; filesize_approx?: number }>;
  [k: string]: unknown;
}

/**
 * Seleção de formato: até a altura pedida, preferindo H.264 + AAC em MP4.
 * Se H.264 não existir na resolução, baixa o melhor disponível e o FFmpeg converte depois.
 */
function formatArgs(quality: number): string[] {
  return [
    '-f', `bv*[height<=${quality}]+ba/b[height<=${quality}]/bv*+ba/b`,
    '-S', `res:${quality},vcodec:h264,acodec:aac,ext:mp4:m4a`,
    '--merge-output-format', 'mp4',
  ];
}

const COMMON = ['--no-playlist', '--no-warnings', '--no-colors', '--no-cache-dir', '--socket-timeout', '30'];

export async function fetchMetadata(url: string, quality: number, signal?: AbortSignal): Promise<YtMetadata> {
  const res = await run(config.ytdlpBin, [...COMMON, ...formatArgs(quality), '-J', url], { signal });
  if (res.code !== 0) throw classifyYtDlpError(res.stderr);
  try {
    return JSON.parse(res.stdout) as YtMetadata;
  } catch {
    throw new PermanentError('Resposta de metadados inválida do yt-dlp.', res.stdout.slice(0, 300));
  }
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number;
}

/** Baixa o vídeo para `dir` e retorna o caminho do arquivo final. */
export async function downloadVideo(
  url: string,
  quality: number,
  dir: string,
  streams: number,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  let finished = 0;
  let doneBytes = 0;
  const maxMb = Math.floor(config.maxFileSizeBytes / (1024 * 1024));
  const args = [
    ...COMMON,
    ...formatArgs(quality),
    '--max-filesize', `${maxMb}M`,
    '--newline', '--progress',
    '--progress-template', 'download:BJJPROG %(progress.status)s %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
    '-o', path.join(dir, 'source.%(ext)s'),
    url,
  ];
  const handle = (line: string) => {
    const m = line.match(/BJJPROG (\S+) (\S+) (\S+) (\S+)/);
    if (!m) return;
    const [, status, dl, total, est] = m;
    const downloaded = Number(dl) || 0;
    const t = Number(total) || Number(est) || 0;
    if (status === 'finished') {
      finished++;
      doneBytes += t || downloaded;
    }
    const current = status === 'finished' ? 0 : t ? downloaded / t : 0;
    const percent = Math.min(100, ((finished + current) / Math.max(1, streams)) * 100);
    onProgress({ downloadedBytes: doneBytes + (status === 'finished' ? 0 : downloaded), totalBytes: t || null, percent });
  };
  const res = await run(config.ytdlpBin, args, { signal, onStdoutLine: handle, onStderrLine: handle });
  if (res.code !== 0) throw classifyYtDlpError(res.stderr);
  if (/larger than max-filesize/i.test(res.stdout + res.stderr)) {
    throw new PermanentError(`Arquivo excede o limite de ${maxMb} MB (MAX_FILE_SIZE_MB).`);
  }
  const files = (await readdir(dir)).filter((f) => f.startsWith('source.') && !f.endsWith('.part') && !f.endsWith('.ytdl'));
  const mp4 = files.find((f) => f.endsWith('.mp4')) ?? files[0];
  if (!mp4) throw new PermanentError('yt-dlp terminou sem gerar arquivo de vídeo.', res.stderr.slice(-500));
  return path.join(dir, mp4);
}
