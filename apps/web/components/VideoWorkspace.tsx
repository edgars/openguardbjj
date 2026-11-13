'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatTimestamp } from '@bjj/core/format';
import { CATEGORY_LABEL_PT, type TechniqueCategory } from '@bjj/core/techniques';

interface Segment { start: number; end: number; text: string }
interface TechniqueRow {
  id: number; slug: string; name_pt: string; name_en: string; category: string;
  start_seconds: number | null; end_seconds: number | null; confidence: number; mentions: number; source: string; evidence: string | null;
}
interface Note { id: string; timestamp_seconds: number | null; body: string; created_at: string }

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * Player nativo HTML5 sobre o MP4 armazenado no Vercel Blob (URL pré-assinada; Range nativo do CDN).
 * Se a URL expirar, renova via /playback; se ainda falhar, cai para o proxy autenticado /stream.
 */
export function VideoWorkspace(props: {
  videoId: string;
  src: string;
  poster: string | null;
  initialTime: number;
  segments: Segment[];
  transcriptMeta: { language: string | null; model: string | null } | null;
  transcriptionStatus: string;
  techniques: TechniqueRow[];
  notes: Note[];
  /** Visão pública (sem login): sem notas; URL renovada pela rota pública, sem o proxy autenticado. */
  publicMode?: boolean;
}) {
  const { videoId, segments, techniques } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState(props.src);
  const [usingProxy, setUsingProxy] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState('');
  const [notes, setNotes] = useState(props.notes);
  const [noteText, setNoteText] = useState('');
  const [playerError, setPlayerError] = useState<string | null>(null);
  const resumeAt = useRef<number | null>(props.initialTime || null);

  const seek = useCallback((t: number, play = true) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration || t));
    if (play) v.play().catch(() => {});
  }, []);

  const skip = (d: number) => videoRef.current && seek(videoRef.current.currentTime + d, !videoRef.current.paused);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => videoRef.current?.requestFullscreen?.());
  };

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, src]);

  // Atalhos de teclado: espaço, ←/→ (5 s), j/l (10 s), f (tela cheia).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft') skip(-5);
      else if (e.key === 'ArrowRight') skip(5);
      else if (e.key === 'j') skip(-10);
      else if (e.key === 'l') skip(10);
      else if (e.key === 'f') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function onError() {
    const v = videoRef.current;
    resumeAt.current = v?.currentTime || resumeAt.current;
    if (usingProxy) return setPlayerError('Não foi possível reproduzir o arquivo armazenado.');
    // 1ª tentativa: renovar URL pré-assinada; 2ª: proxy autenticado com Range (só com login).
    const base = props.publicMode ? '/api/public/videos' : '/api/videos';
    const r = await fetch(`${base}/${videoId}/playback`, { cache: 'no-store' }).catch(() => null);
    const data = r?.ok ? await r.json() : null;
    if (data?.video && data.video !== src) setSrc(data.video);
    else if (props.publicMode) setPlayerError('Não foi possível reproduzir o vídeo agora. Recarregue a página.');
    else {
      setUsingProxy(true);
      setSrc(`/api/videos/${videoId}/stream`);
    }
  }

  const activeIdx = useMemo(() => {
    let lo = 0, hi = segments.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid]!.start <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 && time <= segments[ans]!.end + 1.5 ? ans : -1;
  }, [segments, time]);

  useEffect(() => {
    if (!follow || activeIdx < 0 || filter) return;
    const el = transcriptRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    const box = transcriptRef.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: 'smooth' });
  }, [activeIdx, follow, filter]);

  const shown = filter
    ? segments.map((s, i) => ({ s, i })).filter(({ s }) => s.text.toLowerCase().includes(filter.toLowerCase()))
    : segments.map((s, i) => ({ s, i }));

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    const r = await fetch(`/api/videos/${videoId}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: noteText, timestamp: videoRef.current?.currentTime ?? null }),
    });
    if (r.ok) {
      const n = (await r.json()) as Note;
      setNotes((prev) => [...prev, n].sort((a, b) => (a.timestamp_seconds ?? 1e9) - (b.timestamp_seconds ?? 1e9)));
      setNoteText('');
    }
  }

  const byCategory = useMemo(() => {
    const m = new Map<string, TechniqueRow[]>();
    for (const t of techniques) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [techniques]);

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-3">
        <div ref={containerRef} className="-mx-4 overflow-hidden bg-black sm:mx-0 sm:rounded-lg">
          <video
            ref={videoRef}
            src={src}
            poster={props.poster ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="mx-auto block max-h-[75vh] min-h-[200px] w-full bg-black object-contain"
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration);
              e.currentTarget.playbackRate = speed;
              if (resumeAt.current) { e.currentTarget.currentTime = resumeAt.current; resumeAt.current = null; }
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={onError}
          />
        </div>

        <div className="card flex flex-wrap items-center gap-2 p-2 text-sm">
          <button className="btn-ghost flex-1 sm:flex-none" onClick={() => skip(-10)} title="Voltar 10 s (j)">⟲ 10s</button>
          <button className="btn-ghost hidden sm:inline-flex" onClick={() => skip(-5)} title="Voltar 5 s (←)">−5s</button>
          <button className="btn-primary min-w-20 flex-1 sm:flex-none" onClick={togglePlay} title="Play/pause (espaço)">{playing ? 'Pausar' : 'Play'}</button>
          <button className="btn-ghost hidden sm:inline-flex" onClick={() => skip(5)} title="Avançar 5 s (→)">+5s</button>
          <button className="btn-ghost flex-1 sm:flex-none" onClick={() => skip(10)} title="Avançar 10 s (l)">10s ⟳</button>
          <div className="flex w-full items-center gap-2 sm:contents">
          <span className="font-mono text-xs tabular-nums text-zinc-400 sm:mx-2">{formatTimestamp(time)} / {formatTimestamp(duration)}</span>
          <label className="ml-auto flex items-center gap-1 text-xs text-zinc-400">
            <span className="hidden sm:inline">Velocidade</span>
            <select aria-label="Velocidade" className="rounded border border-mat-600 bg-mat-900 px-1.5 py-1.5 text-base text-zinc-100 sm:py-1 sm:text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>
          <button className="btn-ghost" onClick={fullscreen} title="Tela cheia (f)" aria-label="Tela cheia">⛶</button>
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          onChange={(e) => seek(Number(e.target.value), !videoRef.current?.paused)}
          className="h-6 w-full accent-[#c8a24a]"
          aria-label="Linha do tempo"
        />
        {/* Marcadores de técnicas na linha do tempo */}
        {duration > 0 && techniques.some((t) => t.start_seconds != null) && (
          <div className="relative mx-1.5 h-5">
            {techniques.filter((t) => t.start_seconds != null).map((t) => (
              <button key={t.id} title={`${t.name_pt} — ${formatTimestamp(t.start_seconds)}`}
                onClick={() => seek(Math.max(0, t.start_seconds! - 2))}
                className="absolute top-0 h-5 w-2 -translate-x-1/2 rounded-sm bg-belt/80 hover:bg-belt sm:h-4 sm:w-1.5"
                style={{ left: `${(t.start_seconds! / duration) * 100}%` }} />
            ))}
          </div>
        )}
        {usingProxy && <p className="text-xs text-zinc-500">Reproduzindo via proxy autenticado (Range).</p>}
        {playerError && <p className="text-sm text-red-400">{playerError}</p>}

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Técnicas identificadas</h2>
          {!techniques.length ? (
            <p className="text-sm text-zinc-400">Nenhuma técnica identificada{props.transcriptionStatus !== 'COMPLETED' ? ' (sem transcrição)' : ''}.</p>
          ) : (
            <div className="space-y-3">
              {byCategory.map(([cat, list]) => (
                <div key={cat}>
                  <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{CATEGORY_LABEL_PT[cat as TechniqueCategory] ?? cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((t) => (
                      <button key={t.id} onClick={() => t.start_seconds != null && seek(Math.max(0, t.start_seconds - 2))}
                        title={t.evidence ?? undefined}
                        className="rounded-md border border-mat-600 px-2.5 py-1.5 text-left text-xs hover:border-belt sm:px-2 sm:py-1">
                        <span className="font-medium">{t.name_pt}</span>
                        {t.start_seconds != null && <span className="ml-1.5 font-mono text-belt">{formatTimestamp(t.start_seconds)}</span>}
                        <span className="ml-1.5 text-zinc-500">{Math.round(t.confidence * 100)}%{t.source === 'llm' ? ' · IA' : t.source === 'metadata' ? ' · descrição' : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card flex max-h-[60vh] flex-col lg:max-h-[70vh]">
          <div className="flex items-center gap-2 border-b border-mat-700 p-3">
            <h2 className="text-sm font-semibold">Transcrição</h2>
            {props.transcriptMeta && <span className="text-xs text-zinc-500">{props.transcriptMeta.language} · {props.transcriptMeta.model}</span>}
            <label className="ml-auto flex items-center gap-1 text-xs text-zinc-400">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> seguir
            </label>
          </div>
          {segments.length > 0 && (
            <div className="border-b border-mat-700 p-2">
              <input className="input py-1.5" placeholder="Buscar na transcrição" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          )}
          <div ref={transcriptRef} className="relative flex-1 overflow-y-auto p-2 text-sm">
            {!segments.length ? (
              <p className="p-2 text-zinc-400">
                {props.transcriptionStatus === 'FAILED' ? 'A transcrição falhou.'
                  : props.transcriptionStatus === 'NOT_REQUESTED' ? 'Transcrição não solicitada.'
                  : 'Transcrição pendente.'}
              </p>
            ) : (
              shown.map(({ s, i }) => (
                <button key={i} data-idx={i} onClick={() => seek(s.start)}
                  className={`block w-full rounded px-2 py-1.5 text-left sm:py-1 ${i === activeIdx ? 'bg-belt/15 text-zinc-50' : 'text-zinc-300 hover:bg-mat-800'}`}>
                  <span className="mr-2 font-mono text-xs text-belt">{formatTimestamp(s.start)}</span>
                  {s.text}
                </button>
              ))
            )}
          </div>
        </section>

        {props.publicMode ? (
          <section className="card p-4 text-sm text-zinc-300">
            <p className="mb-3">Entre para favoritar, montar playlists e anotar momentos deste vídeo.</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-primary" href={`/sign-in?redirect_url=${encodeURIComponent(`/videos/${videoId}`)}`}>Entrar</a>
              <a className="btn-ghost" href={`/sign-up?redirect_url=${encodeURIComponent(`/videos/${videoId}`)}`}>Criar conta grátis</a>
            </div>
          </section>
        ) : (
        <section className="card p-3">
          <h2 className="mb-2 text-sm font-semibold">Minhas notas <span className="font-normal text-zinc-500">· privadas</span></h2>
          <form onSubmit={addNote} className="mb-2 flex gap-2">
            <input className="input min-w-0 py-1.5" placeholder={`Nota em ${formatTimestamp(time)}`} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            <button className="btn-ghost">Salvar</button>
          </form>
          <ul className="space-y-1 text-sm">
            {notes.map((n) => (
              <li key={n.id}>
                {n.timestamp_seconds != null && (
                  <button className="mr-2 font-mono text-xs text-belt" onClick={() => seek(n.timestamp_seconds!)}>{formatTimestamp(n.timestamp_seconds)}</button>
                )}
                <span className="text-zinc-300">{n.body}</span>
              </li>
            ))}
          </ul>
        </section>
        )}
      </aside>
    </div>
  );
}
