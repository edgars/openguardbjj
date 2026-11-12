import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { del, get, head, issueSignedToken, presignUrl, put, type IssuedSignedToken } from '@vercel/blob';

/**
 * Asset armazenado no Vercel Blob. `assetId` é o pathname do blob
 * (ex.: videos/{videoId}/original-AbC123.mp4) — estável e suficiente para get/head/del.
 */
export interface StoredAsset {
  assetId: string;
  pathname: string;
  url: string;
  sizeBytes: number;
  contentType: string;
}

export interface UploadOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

export interface VideoStorageService {
  uploadVideo(filePath: string, videoId: string, opts?: UploadOptions): Promise<StoredAsset>;
  uploadAudio(filePath: string, videoId: string, opts?: UploadOptions): Promise<StoredAsset>;
  uploadThumbnail(filePath: string, videoId: string, opts?: UploadOptions): Promise<StoredAsset>;
  deleteAsset(assetId: string): Promise<void>;
  getPlaybackUrl(assetId: string): Promise<string>;
}

export type BlobAccess = 'private' | 'public';

export function blobAccess(): BlobAccess {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
}

/** Caminho lógico: videos/{videoId}/original.mp4 | audio.mp3 | thumbnail.jpg (+ sufixo aleatório para cache-busting). */
export function assetPathname(videoId: string, kind: 'original' | 'audio' | 'thumbnail' | 'upload', ext: string) {
  return `videos/${videoId}/${kind}.${ext}`;
}

const MULTIPART_THRESHOLD = 50 * 1024 * 1024;

/**
 * Implementação com @vercel/blob. Usa BLOB_READ_WRITE_TOKEN (servidor/worker apenas —
 * nunca exposto ao navegador). Reprodução de blobs privados via URL pré-assinada de curta
 * duração: o navegador busca direto do CDN do Blob, com suporte nativo a HTTP Range.
 */
export class VercelBlobStorageService implements VideoStorageService {
  private signed: IssuedSignedToken | null = null;

  constructor(
    private readonly access: BlobAccess = blobAccess(),
    private readonly playbackTtlSeconds = Number(process.env.PLAYBACK_URL_TTL_SECONDS ?? 4 * 3600),
  ) {}

  uploadVideo(filePath: string, videoId: string, opts?: UploadOptions) {
    return this.upload(filePath, assetPathname(videoId, 'original', 'mp4'), 'video/mp4', opts);
  }

  uploadAudio(filePath: string, videoId: string, opts?: UploadOptions) {
    return this.upload(filePath, assetPathname(videoId, 'audio', 'mp3'), 'audio/mpeg', opts);
  }

  uploadThumbnail(filePath: string, videoId: string, opts?: UploadOptions) {
    return this.upload(filePath, assetPathname(videoId, 'thumbnail', 'jpg'), 'image/jpeg', opts);
  }

  async deleteAsset(assetId: string): Promise<void> {
    if (!assetId) return;
    await del(assetId);
  }

  /** Worker: baixa um asset do Blob para disco (reprocessar transcrição sem novo download da origem). */
  async downloadToFile(assetId: string, destPath: string, signal?: AbortSignal): Promise<void> {
    const res = await get(assetId, { access: this.access, abortSignal: signal, useCache: false });
    if (!res || res.statusCode !== 200) {
      const err = new Error(`Asset não encontrado no Blob: ${assetId}`);
      err.name = 'AssetNotFoundError';
      throw err;
    }
    await pipeline(Readable.fromWeb(res.stream as any), createWriteStream(destPath));
  }

  async getPlaybackUrl(assetId: string): Promise<string> {
    if (this.access === 'public') {
      const meta = await head(assetId);
      return meta.url;
    }
    const token = await this.signingToken();
    const validUntil = Math.min(token.validUntil, Date.now() + this.playbackTtlSeconds * 1000);
    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      pathname: assetId,
      access: 'private',
      validUntil,
    });
    return presignedUrl;
  }

  /** Token de delegação somente-leitura (get), reaproveitado até ~15 min antes de expirar. */
  private async signingToken(): Promise<IssuedSignedToken> {
    const margin = 15 * 60 * 1000;
    // Reusa só enquanto o token ainda cobre um TTL inteiro de reprodução.
    if (this.signed && this.signed.validUntil - this.playbackTtlSeconds * 1000 > Date.now()) return this.signed;
    this.signed = await issueSignedToken({
      pathname: '*',
      operations: ['get'],
      validUntil: Date.now() + Math.max(this.playbackTtlSeconds, 3600) * 1000 + margin,
    });
    return this.signed;
  }

  private async upload(filePath: string, pathname: string, contentType: string, opts?: UploadOptions): Promise<StoredAsset> {
    const { size } = await stat(filePath);
    const result = await put(pathname, createReadStream(filePath), {
      access: this.access,
      contentType,
      addRandomSuffix: true,
      multipart: size > MULTIPART_THRESHOLD,
      abortSignal: opts?.signal,
      onUploadProgress: opts?.onProgress ? (e) => opts.onProgress!(e.loaded, size) : undefined,
    });
    return { assetId: result.pathname, pathname: result.pathname, url: result.url, sizeBytes: size, contentType };
  }
}

let singleton: VideoStorageService | null = null;
export function getStorage(): VideoStorageService {
  singleton ??= new VercelBlobStorageService();
  return singleton;
}
