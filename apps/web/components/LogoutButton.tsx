'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="text-sm text-zinc-400 hover:text-zinc-100"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/login');
      }}
    >
      Sair
    </button>
  );
}
