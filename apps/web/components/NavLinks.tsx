'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ admin }: { admin: boolean }) {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Biblioteca', active: path === '/' || path.startsWith('/videos') },
    { href: '/playlists', label: 'Playlists', active: path.startsWith('/playlists') },
    ...(admin
      ? [
          { href: '/admin/storage', label: 'Storage', active: path.startsWith('/admin/storage') },
          { href: '/admin/users', label: 'Usuários', active: path.startsWith('/admin/users') },
        ]
      : []),
  ];
  return (
    <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className={`whitespace-nowrap rounded px-2 py-1 ${l.active ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
