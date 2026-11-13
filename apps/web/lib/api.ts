import 'server-only';
import { NextResponse } from 'next/server';
import { getAppUser, type AppUser } from './auth';

import { HttpError } from './errors';

export { HttpError };

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });

type Ctx<P> = { params: Promise<P> };

/** Envolve um handler de rota: exige sessão Clerk ativa e converte HttpError em JSON. */
export function withUser<P = Record<string, string>>(
  handler: (req: Request, user: AppUser, params: P) => Promise<Response>,
  opts: { admin?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const user = await getAppUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      if (user.disabled) return json({ error: 'Conta bloqueada.' }, 403);
      if (opts.admin && user.role !== 'admin') return json({ error: 'Apenas o administrador pode fazer isso.' }, 403);
      return await handler(req, user, await ctx.params);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Erro interno. Veja os logs do servidor.' }, 500);
    }
  };
}

/** Rotas que alteram a biblioteca, o storage ou o worker: só o super admin. */
export const withAdmin = <P = Record<string, string>>(handler: (req: Request, user: AppUser, params: P) => Promise<Response>) =>
  withUser<P>(handler, { admin: true });

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string, what = 'Vídeo') {
  if (!UUID.test(id)) throw new HttpError(404, `${what} não encontrado.`);
}
export const isUuid = (id: string) => UUID.test(id);
