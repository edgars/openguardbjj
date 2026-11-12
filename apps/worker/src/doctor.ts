/** Diagnóstico do ambiente do worker: binários, Python/Whisper, banco e Blob. */
import { config } from './config.ts';
import { run } from './proc.ts';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

async function bin(name: string, cmd: string, args: string[]) {
  try {
    const r = await run(cmd, args);
    checks.push({ name, ok: r.code === 0, detail: (r.stdout || r.stderr).split('\n')[0]!.trim() });
  } catch (e) {
    checks.push({ name, ok: false, detail: (e as Error).message });
  }
}

await bin('yt-dlp', config.ytdlpBin, ['--version']);
await bin('ffmpeg', config.ffmpegBin, ['-version']);
await bin('ffprobe', config.ffprobeBin, ['-version']);
await bin('ffmpeg libmp3lame', config.ffmpegBin, ['-hide_banner', '-h', 'encoder=libmp3lame']);
await bin('ffmpeg libx264', config.ffmpegBin, ['-hide_banner', '-h', 'encoder=libx264']);
await bin('faster-whisper', config.whisperPython, ['-c', 'import faster_whisper; print("faster-whisper", faster_whisper.__version__)']);

if (process.env.DATABASE_URL) {
  try {
    const { query } = await import('@bjj/core/db');
    const r = await query<{ n: number }>('select count(*)::int as n from download_jobs where status = $1', ['PENDING']);
    checks.push({ name: 'Neon/Postgres', ok: true, detail: `conectado — ${r[0]?.n ?? 0} job(s) pendente(s)` });
  } catch (e) {
    checks.push({ name: 'Neon/Postgres', ok: false, detail: (e as Error).message });
  }
} else checks.push({ name: 'Neon/Postgres', ok: false, detail: 'DATABASE_URL ausente' });

if (process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    const { list } = await import('@vercel/blob');
    const r = await list({ limit: 1, prefix: 'videos/' });
    checks.push({ name: 'Vercel Blob', ok: true, detail: `token válido (${r.blobs.length ? 'store com vídeos' : 'store vazio'})` });
  } catch (e) {
    checks.push({ name: 'Vercel Blob', ok: false, detail: (e as Error).message });
  }
} else checks.push({ name: 'Vercel Blob', ok: false, detail: 'BLOB_READ_WRITE_TOKEN ausente' });

for (const c of checks) console.log(`${c.ok ? '✔' : '✖'} ${c.name.padEnd(18)} ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} problema(s). Veja README.md (seção "Worker no Mac").` : '\nTudo pronto.');
process.exit(failed.length ? 1 : 0);
