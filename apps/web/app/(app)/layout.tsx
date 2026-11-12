import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { WorkerBadge } from '@/components/WorkerBadge';
import { LogoutButton } from '@/components/LogoutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-mat-700 bg-mat-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            OpenGuard <span className="text-belt">BJJ</span>
          </Link>
          <nav className="flex gap-3 text-sm text-zinc-400">
            <Link href="/" className="hover:text-zinc-100">Biblioteca</Link>
            <Link href="/admin/storage" className="hover:text-zinc-100">Storage</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <WorkerBadge />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
