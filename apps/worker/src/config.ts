import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const workerRoot = fileURLToPath(new URL('..', import.meta.url));
loadEnv({ path: path.join(workerRoot, '.env'), quiet: true });
loadEnv({ quiet: true }); // fallback: .env no diretório atual

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

export const config = {
  workerId: process.env.WORKER_ID || `${hostname()}-${process.pid}-${randomBytes(2).toString('hex')}`,
  version: '0.1.0',
  concurrency: num(process.env.WORKER_CONCURRENCY, 1),
  pollIntervalMs: num(process.env.WORKER_POLL_INTERVAL_MS, 5000),
  leaseSeconds: num(process.env.WORKER_LEASE_SECONDS, 120),
  heartbeatMs: 15_000,
  tmpRoot: process.env.WORKER_TMP_DIR || path.join(tmpdir(), 'bjj-media-worker'),

  ytdlpBin: process.env.YTDLP_BIN || 'yt-dlp',
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',

  maxDurationSeconds: num(process.env.MAX_DURATION_SECONDS, 3 * 3600),
  maxFileSizeBytes: num(process.env.MAX_FILE_SIZE_MB, 2048) * 1024 * 1024,
  storeAudio: bool(process.env.STORE_AUDIO, true),

  whisperPython: process.env.WHISPER_PYTHON || path.join(workerRoot, '.venv', 'bin', 'python'),
  whisperScript: path.join(workerRoot, 'transcriber', 'transcribe.py'),
  whisperModel: process.env.WHISPER_MODEL || 'small',
  whisperLanguage: process.env.WHISPER_LANGUAGE || '', // vazio = detecção automática
  whisperComputeType: process.env.WHISPER_COMPUTE_TYPE || 'int8',

  ollamaUrl: process.env.OLLAMA_URL || '',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1:8b',
};

export function assertRuntimeEnv() {
  const missing = ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Variáveis ausentes: ${missing.join(', ')}. Copie apps/worker/.env.example para apps/worker/.env.`);
  }
}
