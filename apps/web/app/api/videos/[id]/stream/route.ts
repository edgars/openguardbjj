import { head } from '@vercel/blob';
import { getStorage } from '@bjj/core/storage';
import { getAppUser } from '@/lib/auth';
import { isUuid } from '@/lib/api';
import { queryOne } from '@/lib/db';

/**
 * Streaming autenticado com HTTP Range (alternativa às URLs pré-assinadas).
 * Cada resposta é limitada a CHUNK bytes (206 Partial Content) para respeitar o limite
 * de corpo de resposta das Vercel Functions; o <video> pede os próximos trechos sozinho.
 */
const CHUNK = 4 * 1024 * 1024 - 64 * 1024;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getAppUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  if (user.disabled) return new Response('Conta bloqueada', { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response('Não encontrado', { status: 404 });
  const v = await queryOne<{ blob_pathname: string | null; file_size_bytes: number | null }>(
    `select blob_pathname, file_size_bytes from videos where id = $1 and ($2 or download_status = 'COMPLETED')`,
    [id, user.role === 'admin'],
  );
  if (!v?.blob_pathname) return new Response('Não encontrado', { status: 404 });

  const size = v.file_size_bytes || (await head(v.blob_pathname).catch(() => null))?.size || 0;
  if (!size) return new Response('Tamanho do arquivo desconhecido', { status: 502 });
  const unsatisfiable = () => new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });

  let start = 0;
  let end = size - 1;
  const range = req.headers.get('range');
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (m[1] === '' && m[2] === '')) return unsatisfiable();
    if (m[1] === '') {
      start = Math.max(0, size - Number(m[2])); // sufixo: últimos N bytes
    } else {
      start = Number(m[1]);
      if (m[2] !== '') end = Number(m[2]);
    }
  }
  end = Math.min(end, size - 1, start + CHUNK - 1);
  if (start >= size || start > end) return unsatisfiable();

  const url = await getStorage().getPlaybackUrl(v.blob_pathname);
  const upstream = await fetch(url, { headers: { range: `bytes=${start}-${end}` } });
  if (upstream.status === 416) return unsatisfiable();
  // Exige 206: um 200 com o corpo inteiro estouraria o limite de resposta da Function.
  if (upstream.status !== 206 || !upstream.body) {
    await upstream.body?.cancel();
    return new Response('Falha ao ler o Blob', { status: 502 });
  }
  return new Response(upstream.body, {
    status: 206,
    headers: {
      'content-type': 'video/mp4',
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-store',
      'content-range': upstream.headers.get('content-range') ?? `bytes ${start}-${end}/${size}`,
      'content-length': upstream.headers.get('content-length') ?? String(end - start + 1),
    },
  });
}
