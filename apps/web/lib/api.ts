import 'server-only';
import { NextResponse } from 'next/server';
import { currentUserId } from './auth';

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });

type Ctx<P> = { params: Promise<P> };

/** Envolve um handler de rota: exige sessão e converte HttpError em JSON. */
export function withUser<P = Record<string, string>>(
  handler: (req: Request, userId: string, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const userId = await currentUserId();
      if (!userId) return json({ error: 'Não autenticado.' }, 401);
      return await handler(req, userId, await ctx.params);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Erro interno. Veja os logs do servidor.' }, 500);
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertUuid(id: string) {
  if (!UUID.test(id)) throw new HttpError(404, 'Vídeo não encontrado.');
}
