import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { queryOne } from './db';

/**
 * Autenticação de biblioteca pessoal: um dono (OWNER_EMAIL) com senha (APP_PASSWORD).
 * Sessão = cookie httpOnly assinado com HMAC (AUTH_SECRET). Nenhum segredo vai ao navegador.
 */
const COOKIE = 'bjj_session';
const TTL_SECONDS = 30 * 24 * 3600;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET ausente ou curto (mínimo 32 caracteres).');
  return s;
}

const mac = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error('APP_PASSWORD não configurada.');
  return safeEqual(password, expected);
}

export async function ensureOwner(): Promise<string> {
  const email = (process.env.OWNER_EMAIL || 'owner@localhost').toLowerCase();
  const row = await queryOne<{ id: string }>(
    `insert into users (email, name) values ($1, $2)
     on conflict (email) do update set email = excluded.email returning id`,
    [email, process.env.OWNER_NAME || null],
  );
  return row!.id;
}

export async function startSession(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${mac(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUserId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, exp, sig] = raw.split('.');
  if (!userId || !exp || !sig) return null;
  if (!safeEqual(sig, mac(`${userId}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return userId;
}

/** Para Server Components/páginas: redireciona ao login. */
export async function requireUser(): Promise<string> {
  const id = await currentUserId();
  if (!id) redirect('/login');
  return id;
}
