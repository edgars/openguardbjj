import { redirect } from 'next/navigation';
import { currentUserId } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';

export default async function LoginPage() {
  if (await currentUserId()) redirect('/');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">OpenGuard BJJ</h1>
        <p className="mb-5 text-sm text-zinc-400">Biblioteca pessoal — entre com a senha do app.</p>
        <LoginForm />
      </div>
    </main>
  );
}
