import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { currentUserId } from '@/lib/auth';
import { json } from '@/lib/api';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 4096) * 1024 * 1024;

/**
 * Client Upload: o navegador envia o arquivo DIRETO ao Vercel Blob usando um token
 * de curta duração gerado aqui (após checar a sessão). O arquivo não passa por esta Function.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!(await currentUserId())) throw new Error('Não autenticado.');
        if (!/^uploads\/[0-9a-f-]{36}\/[\w.\- ]{1,200}$/i.test(pathname)) throw new Error('Pathname de upload inválido.');
        return {
          allowedContentTypes: ['video/*'],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 60 * 60 * 1000,
        };
      },
    });
    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
}
