import 'server-only';
import { cache } from 'react';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { notFound, redirect } from 'next/navigation';
import { queryOne } from './db';

/**
 * Autenticação via Clerk. Cada conta Clerk vira uma linha em `users` (clerk_id).
 * - Super admin: e-mail SUPER_ADMIN_EMAIL (padrão edgar@skalena.com), somente se VERIFICADO no Clerk.
 *   Gerencia a biblioteca (importa, apaga, storage, worker, usuários).
 * - Demais contas: role 'user' — assistem à biblioteca e organizam favoritos, playlists e notas próprias.
 */
export type Role = 'admin' | 'user';

export interface AppUser {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  imageUrl: string | null;
  role: Role;
  disabled: boolean;
}

export const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'edgar@skalena.com').trim().toLowerCase();

type Row = { id: string; clerk_id: string; email: string; name: string | null; image_url: string | null; role: Role; disabled: boolean };

const toUser = (r: Row): AppUser => ({
  id: r.id,
  clerkId: r.clerk_id,
  email: r.email,
  name: r.name,
  imageUrl: r.image_url,
  role: r.role,
  disabled: r.disabled,
});

const COLS = 'id, clerk_id, email, name, image_url, role, disabled';

const SYNTHETIC = /@(unverified|dup)\.clerk$/;

/** true se a conta Clerk ainda existe nesta instância (falso se apagada ou de outra instância, ex.: dev → prod). */
async function clerkAccountExists(clerkId: string): Promise<boolean> {
  try {
    await (await clerkClient()).users.getUser(clerkId);
    return true;
  } catch (err) {
    if (isClerkAPIResponseError(err) && err.status === 404) return false;
    throw err;
  }
}

/**
 * Cria/vincula o usuário local a partir do perfil Clerk (1º acesso, conta Clerk recriada,
 * ou e-mail que só foi verificado depois). O vínculo é sempre pelo clerk_id; o e-mail só
 * é usado para reaproveitar uma linha existente quando está VERIFICADO no Clerk.
 */
async function provision(clerkId: string, current: Row | null): Promise<AppUser | null> {
  const cu = await currentUser();
  if (!cu || cu.id !== clerkId) return current ? toUser(current) : null;
  const primary = cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId) ?? cu.emailAddresses[0];
  const email = primary?.emailAddress.trim().toLowerCase() ?? '';
  const verified = !!primary && primary.verification?.status === 'verified';
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') || cu.username || null;
  const image = cu.imageUrl ?? null;
  const isSuperAdmin = verified && email === SUPER_ADMIN_EMAIL;
  const role: Role = isSuperAdmin ? 'admin' : 'user';

  if (verified) {
    const byEmail = await queryOne<Row>(`select ${COLS} from users where lower(email) = $1`, [email]);
    if (byEmail && byEmail.clerk_id === clerkId) return toUser(byEmail);
    if (byEmail) {
      // Linha de outra conta Clerk com o mesmo e-mail verificado. O Clerk garante e-mail único por
      // instância, então a conta antiga foi apagada/recriada ou é de outra instância: a linha (e o
      // bloqueio, favoritos e playlists) passa para a conta nova. O super admin sempre retoma a sua.
      const stale = !byEmail.clerk_id || isSuperAdmin || !(await clerkAccountExists(byEmail.clerk_id));
      if (stale) {
        const moved = await queryOne<Row>(
          `update users set clerk_id = $2, name = coalesce(name, $3), image_url = $4, role = $5, last_seen_at = now()
            where id = $1 and clerk_id is not distinct from $6 returning ${COLS}`,
          [byEmail.id, clerkId, name, image, role, byEmail.clerk_id],
        );
        if (moved) {
          // Uma linha provisória desta mesma conta (antes de verificar o e-mail) deixa de ser usada.
          if (current && current.id !== moved.id) await queryOne('delete from users where id = $1', [current.id]);
          return toUser(moved);
        }
      }
    } else if (current) {
      // E-mail verificado depois do 1º acesso: corrige o e-mail provisório e o papel.
      const fixed = await queryOne<Row>(
        `update users set email = $2, name = coalesce(name, $3), image_url = $4, role = $5 where id = $1 returning ${COLS}`,
        [current.id, email, name, image, role],
      ).catch((err: any) => (err?.code === '23505' ? null : Promise.reject(err)));
      if (fixed) return toUser(fixed);
    }
  }
  if (current) return toUser(current);

  // Conta nova. E-mail não verificado (ou já em uso por uma conta Clerk ativa) recebe um e-mail
  // provisório único e herda o bloqueio da linha original, se houver.
  const inherited = verified
    ? await queryOne<{ disabled: boolean }>('select disabled from users where lower(email) = $1', [email])
    : null;
  const storedEmail = !verified ? `${clerkId}@unverified.clerk` : inherited ? `${clerkId}@dup.clerk` : email;
  try {
    const row = await queryOne<Row>(
      `insert into users (clerk_id, email, name, image_url, role, disabled, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (clerk_id) do update set last_seen_at = now()
       returning ${COLS}`,
      [clerkId, storedEmail, name, image, inherited ? 'user' : role, inherited?.disabled ?? false],
    );
    return row ? toUser(row) : null;
  } catch (err: any) {
    // Corrida entre duas requisições do 1º acesso: a outra já criou a linha.
    if (err?.code !== '23505') throw err;
    const row = await queryOne<Row>(`select ${COLS} from users where clerk_id = $1`, [clerkId]);
    if (!row) throw err;
    return toUser(row);
  }
}

/** Usuário atual (memoizado por request). null = não autenticado no Clerk. */
export const getAppUser = cache(async (): Promise<AppUser | null> => {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const row =
    (await queryOne<Row>(
      `update users set last_seen_at = now() where clerk_id = $1
         and (last_seen_at is null or last_seen_at < now() - interval '10 minutes')
       returning ${COLS}`,
      [clerkId],
    )) ?? (await queryOne<Row>(`select ${COLS} from users where clerk_id = $1`, [clerkId]));
  // Linha provisória (e-mail ainda não verificado) é reavaliada até o e-mail ser verificado.
  if (row && !SYNTHETIC.test(row.email)) return toUser(row);
  return provision(clerkId, row);
});

export const isAdmin = (u: AppUser | null | undefined) => !!u && !u.disabled && u.role === 'admin';

/** Páginas: exige login (redireciona ao /sign-in) e conta ativa. */
export async function requireUser(): Promise<AppUser> {
  const u = await getAppUser();
  if (!u) redirect('/sign-in');
  if (u.disabled) redirect('/blocked');
  return u;
}

/** Páginas exclusivas do super admin: para os demais, a rota não existe. */
export async function requireAdmin(): Promise<AppUser> {
  const u = await requireUser();
  if (u.role !== 'admin') notFound();
  return u;
}
