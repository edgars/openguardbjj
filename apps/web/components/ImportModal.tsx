'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { ImportStatus } from './ImportStatus';

type Tab = 'url' | 'file';

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [quality, setQuality] = useState(720);
  const [authorized, setAuthorized] = useState(false);
  const [transcribe, setTranscribe] = useState(true);
  const [analyze, setAnalyze] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const reset = () => {
    setUrl('');
    setFile(null);
    setTitle('');
    setAuthorized(false);
    setError(null);
    setVideoId(null);
    setNotice(null);
    setUploadPct(null);
  };

  const onFinished = useCallback(() => router.refresh(), [router]);

  async function submitUrl() {
    const r = await fetch('/api/imports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, quality, authorized, transcribe, analyze }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
    if (data.existing) setNotice('Este vídeo já está na biblioteca — exibindo o status existente.');
    return data.videoId as string;
  }

  async function submitFile() {
    if (!file) throw new Error('Selecione um arquivo de vídeo.');
    const safe = file.name.normalize('NFD').replace(/[^\w.\- ]+/g, '_').slice(-120) || 'video.mp4';
    const blob = await upload(`uploads/${crypto.randomUUID()}/${safe}`, file, {
      access: 'private',
      handleUploadUrl: '/api/uploads',
      multipart: file.size > 50 * 1024 * 1024,
      contentType: file.type || 'video/mp4',
      onUploadProgress: (e) => setUploadPct(Math.round(e.percentage)),
    });
    const r = await fetch('/api/uploads/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pathname: blob.pathname, title: title || file.name, quality, authorized, transcribe, analyze }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
    return data.videoId as string;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const id = tab === 'url' ? await submitUrl() : await submitFile();
      setVideoId(id);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-black/70 sm:items-start sm:px-4 sm:py-10" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="card max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-none sm:overflow-visible sm:rounded-b-lg sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="import-title" className="text-lg font-semibold">Importar vídeo</h2>
          <button className="-m-2 p-2 text-zinc-400 hover:text-zinc-100" onClick={() => { if (!busy) { reset(); onClose(); } }} aria-label="Fechar">✕</button>
        </div>

        {videoId ? (
          <div className="space-y-4">
            {notice && <p className="text-sm text-amber-300">{notice}</p>}
            <ImportStatus videoId={videoId} onFinished={onFinished} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-mat-700 pt-3">
              <button className="btn-ghost" onClick={reset}>Importar outro</button>
              <button className="btn-ghost" onClick={() => { reset(); onClose(); }}>Fechar<span className="hidden sm:inline">&nbsp;(continua em segundo plano)</span></button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex gap-1 rounded-md bg-mat-800 p-1 text-sm">
              {(['url', 'file'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`flex-1 rounded px-3 py-1.5 ${tab === t ? 'bg-mat-600 text-zinc-100' : 'text-zinc-400'}`}>
                  {t === 'url' ? <>URL<span className="hidden sm:inline"> (YouTube / Instagram)</span></> : 'Enviar arquivo'}
                </button>
              ))}
            </div>

            {tab === 'url' ? (
              <div>
                <label className="label" htmlFor="url">URL do vídeo</label>
                <input id="url" className="input" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" required placeholder="Link do YouTube, Shorts ou Instagram"
                  value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="file">Arquivo de vídeo</label>
                  <input id="file" type="file" accept="video/*" required className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-mat-600 file:px-3 file:py-1.5 file:text-zinc-100"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>
                <div>
                  <label className="label" htmlFor="title">Título</label>
                  <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Opcional" />
                </div>
              </>
            )}

            <div>
              <span className="label">Qualidade</span>
              <div className="flex gap-2">
                {[480, 720, 1080].map((q) => (
                  <label key={q} className={`flex-1 cursor-pointer rounded-md border px-3 py-2 sm:py-1.5 text-center text-sm ${quality === q ? 'border-belt text-belt' : 'border-mat-600 text-zinc-300'}`}>
                    <input type="radio" name="quality" className="sr-only" checked={quality === q} onChange={() => setQuality(q)} />
                    {q}p
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} required />
                <span>
                  Confirmo que tenho autorização para <b>baixar e armazenar</b> este vídeo (conteúdo próprio, licenciado ou com permissão do autor e
                  compatível com os termos da plataforma).
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={transcribe} onChange={(e) => setTranscribe(e.target.checked)} />
                Transcrever automaticamente (Whisper local)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={analyze} onChange={(e) => setAnalyze(e.target.checked)} />
                Analisar técnicas com IA
              </label>
            </div>

            {uploadPct != null && busy && (
              <div>
                <div className="mb-1 text-xs text-zinc-400">Enviando ao Vercel Blob: {uploadPct}%</div>
                <div className="h-1.5 rounded bg-mat-700"><div className="h-full rounded bg-belt" style={{ width: `${uploadPct}%` }} /></div>
              </div>
            )}
            {error && <p className="whitespace-pre-wrap rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}

            <div className="flex justify-end gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
              <button type="button" className="btn-ghost" onClick={() => { reset(); onClose(); }} disabled={busy}>Cancelar</button>
              <button className="btn-primary" disabled={busy || !authorized}>{busy ? 'Enviando…' : 'Importar'}</button>
            </div>
            <p className="text-xs text-zinc-500">
              O download é feito pelo bjj-media-worker (yt-dlp + FFmpeg) e o MP4 é salvo no Vercel Blob. Se a plataforma não permitir a extração,
              o erro real é exibido e você pode enviar um arquivo autorizado.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
