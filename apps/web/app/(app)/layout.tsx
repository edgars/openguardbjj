import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { requireUser } from '@/lib/auth';
import { WorkerBadge } from '@/components/WorkerBadge';
import { NavLinks } from '@/components/NavLinks';
import { ThemeToggle } from '@/components/ThemeToggle';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const admin = user.role === 'admin';
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-mat-700 bg-mat-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/" className="font-semibold tracking-tight">
            itaim<span className="text-belt">jj</span>
          </Link>
          <NavLinks admin={admin} />
          <div className="ml-auto flex items-center gap-3">
            {admin && <WorkerBadge />}
            {admin && <span className="hidden rounded border border-belt/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-belt sm:inline">admin</span>}
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-6">{children}</main>
    </div>
  );
}
