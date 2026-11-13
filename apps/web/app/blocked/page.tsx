import { SignOutButton } from '@clerk/nextjs';
import { AuthShell } from '../auth-shell';

export default function BlockedPage() {
  return (
    <AuthShell>
      <div className="card max-w-sm p-6 text-center text-sm text-zinc-300">
        <p className="mb-4">Sua conta foi bloqueada pelo administrador.</p>
        <SignOutButton>
          <button className="btn-ghost">Sair</button>
        </SignOutButton>
      </div>
    </AuthShell>
  );
}
