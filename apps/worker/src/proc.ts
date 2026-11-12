import { spawn } from 'node:child_process';
import { CancelledError } from './errors.ts';

export interface RunOptions {
  signal?: AbortSignal;
  cwd?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const TAIL = 64 * 1024;

/** Executa um binário sem shell (argumentos nunca são interpolados), com abort e leitura linha a linha. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new CancelledError(String(opts.signal.reason ?? 'aborted')));
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let killTimer: NodeJS.Timeout | undefined;

    const onAbort = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    const lineReader = (cb?: (l: string) => void) => {
      let buf = '';
      return (chunk: Buffer) => {
        if (!cb) return;
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n|\r/);
        buf = lines.pop() ?? '';
        for (const l of lines) if (l) cb(l);
      };
    };
    const outLines = lineReader(opts.onStdoutLine);
    const errLines = lineReader(opts.onStderrLine);

    child.stdout.on('data', (c: Buffer) => {
      stdout = (stdout + c.toString('utf8')).slice(-TAIL * 16);
      outLines(c);
    });
    child.stderr.on('data', (c: Buffer) => {
      stderr = (stderr + c.toString('utf8')).slice(-TAIL);
      errLines(c);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (err.code === 'ENOENT') reject(new Error(`Binário não encontrado: ${cmd}. Rode "npm run worker:doctor".`));
      else reject(err);
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (killTimer) clearTimeout(killTimer);
      if (opts.signal?.aborted) return reject(new CancelledError(String(opts.signal.reason ?? 'aborted')));
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export function lastLines(text: string, n = 6): string {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-n).join('\n');
}
