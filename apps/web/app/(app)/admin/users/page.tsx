import { requireAdmin } from '@/lib/auth';
import { listUsers } from '@/lib/data';
import { UsersTable } from '@/components/UsersTable';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await listUsers();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="text-sm text-zinc-400">
          Qualquer pessoa pode criar conta (Clerk) e entra como <b>user</b>: assiste à biblioteca e organiza favoritos, playlists e notas próprias.
          Só o super admin importa, apaga e gerencia storage.
        </p>
      </div>
      <UsersTable users={users} meId={admin.id} />
    </div>
  );
}
