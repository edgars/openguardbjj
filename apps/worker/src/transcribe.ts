import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Segment } from '@bjj/core/classifier';
import { config } from './config.ts';
import { lastLines, run } from './proc.ts';

export interface TranscriptResult {
  language: string | null;
  model: string;
  segments: Segment[];
}

export async function transcribe(
  audioPath: string,
  workDir: string,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<TranscriptResult> {
  const out = path.join(workDir, 'transcript.json');
  const args = [config.whisperScript, audioPath, '--out', out, '--model', config.whisperModel, '--compute-type', config.whisperComputeType];
  if (config.whisperLanguage) args.push('--language', config.whisperLanguage);

  const res = await run(config.whisperPython, args, {
    signal,
    onStderrLine: (line) => {
      const m = line.match(/^PROGRESS ([\d.]+) ([\d.]+)/);
      if (m && Number(m[2]) > 0) onProgress(Math.min(100, (Number(m[1]) / Number(m[2])) * 100));
    },
  });
  if (res.code !== 0) throw new Error(`Whisper falhou (code ${res.code}): ${lastLines(res.stderr, 4)}`);

  const data = JSON.parse(await readFile(out, 'utf8')) as {
    language?: string;
    model?: string;
    segments: Array<{ start: number; end: number; text: string }>;
  };
  return { language: data.language ?? null, model: `faster-whisper/${data.model ?? config.whisperModel}`, segments: data.segments };
}
