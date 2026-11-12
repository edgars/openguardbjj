import { checkPassword, ensureOwner, startSession } from '@/lib/auth';
import { json } from '@/lib/api';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 400)); // desacelera força bruta
    return json({ error: 'Senha incorreta.' }, 401);
  }
  const userId = await ensureOwner();
  await startSession(userId);
  return json({ ok: true });
}
