export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <p className="text-xl font-semibold tracking-tight">OpenGuard <span className="text-belt">BJJ</span></p>
        <p className="text-sm text-zinc-400">Biblioteca de Jiu-Jitsu — favoritos, playlists e notas.</p>
      </div>
      {children}
    </main>
  );
}
