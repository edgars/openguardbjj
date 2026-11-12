/** Falha definitiva: não adianta tentar de novo (vídeo privado, URL não suportada, muito longo...). */
export class PermanentError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

/** Falha transitória: rede, 5xx, rate-limit — reprocessar com backoff. */
export class TransientError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'TransientError';
  }
}

export class CancelledError extends Error {
  constructor(readonly reason: string) {
    super(`Processo interrompido (${reason})`);
    this.name = 'CancelledError';
  }
}

const PERMANENT: Array<[RegExp, string]> = [
  [/Unsupported URL/i, 'URL não suportada pelo extrator.'],
  [/Private video|This video is private/i, 'O vídeo é privado.'],
  [/members-only|Join this channel/i, 'Vídeo exclusivo para membros — não é baixado.'],
  [/Sign in to confirm your age|age-restricted|inappropriate for some users/i, 'Vídeo com restrição de idade exige login — não é contornado.'],
  [/Sign in to confirm you.?re not a bot/i, 'A plataforma exigiu verificação anti-bot/login. O sistema não contorna essa restrição; use a importação de arquivo autorizado.'],
  [/login required|requires login|rate-limit reached or login required|Requested content is not available|empty media response/i, 'A plataforma exige autenticação para este conteúdo. O sistema não contorna login; use a importação de arquivo autorizado.'],
  [/Video unavailable|This video is not available|has been removed|does not exist|404: Not Found/i, 'Vídeo indisponível ou removido na origem.'],
  [/DRM|protected by/i, 'Conteúdo protegido por DRM — download não permitido.'],
  [/This live event|is_live|live stream/i, 'Transmissões ao vivo não são suportadas.'],
  [/Requested format is not available/i, 'Nenhum formato disponível na qualidade solicitada.'],
  [/larger than max-filesize/i, 'Arquivo excede o tamanho máximo configurado.'],
  [/requires payment|purchase this video|rental/i, 'Conteúdo pago — não é baixado.'],
  [/geo.?restrict|not available in your country/i, 'Vídeo bloqueado por região.'],
];

const TRANSIENT = /HTTP Error 5\d\d|HTTP Error 429|timed out|Timeout|ECONNRESET|Connection reset|Temporary failure|Name or service not known|getaddrinfo|IncompleteRead|Unable to download webpage|Unable to extract|ETIMEDOUT|socket hang up|EAI_AGAIN/i;

/** Converte stderr do yt-dlp em erro tipado com mensagem compreensível em PT. */
export function classifyYtDlpError(stderr: string): PermanentError | TransientError {
  const detail = stderr.trim().split(/\r?\n/).filter((l) => /ERROR|WARNING/.test(l)).slice(-3).join('\n') || stderr.trim().slice(-500);
  for (const [re, msg] of PERMANENT) if (re.test(stderr)) return new PermanentError(msg, detail);
  if (TRANSIENT.test(stderr)) return new TransientError('Falha temporária de rede/plataforma.', detail);
  return new TransientError('Falha na extração.', detail);
}

export function describe(err: unknown): string {
  if (err instanceof PermanentError || err instanceof TransientError) {
    return err.detail ? `${err.message}\nDetalhe: ${err.detail}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
