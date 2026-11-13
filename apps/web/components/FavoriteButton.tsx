'use client';

import { useState } from 'react';

/** Estrela de favorito com atualização otimista (reverte se a API falhar). */
export function FavoriteButton({
  videoId,
  initial,
  onChange,
  className = '',
  withLabel = false,
}: {
  videoId: string;
  initial: boolean;
  onChange?: (fav: boolean) => void;
  className?: string;
  withLabel?: boolean;
}) {
  const [fav, setFav] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !fav;
    setFav(next);
    onChange?.(next);
    setBusy(true);
    const r = await fetch(`/api/videos/${videoId}/favorite`, { method: next ? 'POST' : 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      setFav(!next);
      onChange?.(!next);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={fav}
      aria-label={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      title={fav ? 'Remover dos favoritos' : 'Favoritar'}
      className={`${className} ${fav ? 'text-belt' : 'text-zinc-300 hover:text-belt'}`}
    >
      <span aria-hidden className="text-lg leading-none">{fav ? '★' : '☆'}</span>
      {withLabel && <span>{fav ? 'Favorito' : 'Favoritar'}</span>}
    </button>
  );
}
