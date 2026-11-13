import { ThemeToggle } from '@/components/ThemeToggle';

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 py-10">
      <ThemeToggle className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))]" />
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight">itaim<span className="text-belt">jj</span></p>
        <p className="text-sm text-zinc-400">Biblioteca de Jiu-Jitsu — favoritos, playlists e notas.</p>
      </div>
      {children}
    </main>
  );
}
