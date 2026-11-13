import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { ThemeToggle } from '@/components/ThemeToggle';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-mat-700 bg-mat-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Link href="/explorar" className="font-semibold tracking-tight">
            itaim<span className="text-belt">jj</span>
          </Link>
          <nav className="order-last -mx-1 flex w-full gap-1 text-sm sm:order-none sm:w-auto">
            <Link href="/explorar" className="rounded px-2 py-1 text-zinc-300 hover:text-zinc-100">Explorar</Link>
            <Link href="/explorar/tecnicas" className="rounded px-2 py-1 text-zinc-300 hover:text-zinc-100">Técnicas</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {userId ? (
              <Link href="/" className="btn-primary">Minha biblioteca</Link>
            ) : (
              <>
                <Link href="/sign-in" className="btn-ghost">Entrar</Link>
                <Link href="/sign-up" className="btn-primary">Criar conta</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-zinc-500">
        Vídeos e créditos pertencem aos seus autores; cada página traz o link do post original.
      </footer>
    </div>
  );
}
