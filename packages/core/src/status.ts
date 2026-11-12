export const VIDEO_STAGES = [
  'PENDING',
  'EXTRACTING_METADATA',
  'DOWNLOADING',
  'CONVERTING',
  'UPLOADING',
  'TRANSCRIBING',
  'ANALYZING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type VideoStage = (typeof VIDEO_STAGES)[number];

/** Sequência exibida no modal de importação (ordem do pipeline). */
export const PIPELINE_SEQUENCE: VideoStage[] = [
  'PENDING',
  'EXTRACTING_METADATA',
  'DOWNLOADING',
  'CONVERTING',
  'UPLOADING',
  'TRANSCRIBING',
  'ANALYZING',
  'COMPLETED',
];

export const TERMINAL_STAGES: ReadonlySet<VideoStage> = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
export const isTerminal = (s: string) => TERMINAL_STAGES.has(s as VideoStage);

export const STAGE_LABEL_PT: Record<VideoStage, string> = {
  PENDING: 'Na fila (aguardando worker)',
  EXTRACTING_METADATA: 'Extraindo metadados',
  DOWNLOADING: 'Baixando vídeo',
  CONVERTING: 'Convertendo / extraindo áudio',
  UPLOADING: 'Enviando ao Vercel Blob',
  TRANSCRIBING: 'Transcrevendo (Whisper)',
  ANALYZING: 'Identificando técnicas',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
};

/** Faixa do progresso global (0–100) ocupada por cada etapa. */
const STAGE_RANGE: Record<VideoStage, [number, number]> = {
  PENDING: [0, 0],
  EXTRACTING_METADATA: [0, 5],
  DOWNLOADING: [5, 45],
  CONVERTING: [45, 60],
  UPLOADING: [60, 75],
  TRANSCRIBING: [75, 95],
  ANALYZING: [95, 99],
  COMPLETED: [100, 100],
  FAILED: [0, 0],
  CANCELLED: [0, 0],
};

export function overallProgress(stage: VideoStage, stagePercent: number): number {
  const [a, b] = STAGE_RANGE[stage];
  const p = Math.max(0, Math.min(100, stagePercent));
  return Math.round(a + ((b - a) * p) / 100);
}

export type JobKind = 'INGEST' | 'PROCESS_UPLOAD' | 'RETRANSCRIBE' | 'REANALYZE';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type SubStatus = 'NOT_REQUESTED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export const QUALITIES = [480, 720, 1080] as const;
export type Quality = (typeof QUALITIES)[number];

export interface JobOptions {
  quality?: Quality;
  transcribe?: boolean;
  analyze?: boolean;
  /** PROCESS_UPLOAD: pathname do arquivo enviado pelo usuário. */
  uploadPathname?: string;
}

/** Considera o worker online se enviou heartbeat nos últimos N segundos. */
export const WORKER_ONLINE_WINDOW_SECONDS = 60;
