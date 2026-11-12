'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.replace('/');
    else setError((await res.json().catch(() => ({}))).error ?? 'Falha no login.');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="label" htmlFor="pw">Senha</label>
      <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
