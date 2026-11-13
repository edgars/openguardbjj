import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getAppUser, isAdmin } from '@/lib/auth';
import { HttpError, json } from '@/lib/api';

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
        if (!isAdmin(await getAppUser())) throw new HttpError(403, 'Apenas o administrador pode enviar vídeos.');
        if (!/^uploads\/[0-9a-f-]{36}\/[\w.\- ]{1,200}$/i.test(pathname)) throw new HttpError(400, 'Pathname de upload inválido.');
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
    // Só mensagens próprias vão ao cliente; erros internos (banco, Clerk, Blob) ficam no log.
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('upload token:', err);
    return json({ error: 'Não foi possível autorizar o upload.' }, 400);
  }
}
