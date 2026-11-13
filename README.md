# OpenGuard BJJ — Video Intelligence

Biblioteca pessoal de vídeos de Jiu-Jitsu com **download real e persistência física** dos arquivos.
URLs do YouTube, YouTube Shorts e Instagram Reels são baixadas (quando autorizado), normalizadas para
MP4 H.264/AAC, armazenadas no **Vercel Blob (store privado)**, transcritas com **Whisper local** e
classificadas por técnica. O player toca o **arquivo armazenado** — não usa embed nem depende do vídeo original.

```
 Navegador ──► Next.js (Vercel) ──► Neon: videos + download_jobs (PENDING)
    ▲   polling 2s     │                         ▲
    │                  │ URL pré-assinada        │ reserva atômica (FOR UPDATE SKIP LOCKED) + lease
    │                  ▼                         │
    └──── <video> ◄── Vercel Blob (privado) ◄── bjj-media-worker (Mac / Docker)
          Range nativo do CDN                  yt-dlp → FFmpeg → upload direto → faster-whisper → técnicas
```

| Pasta | Conteúdo |
|---|---|
| `apps/web` | Next.js 16 (App Router), Tailwind 3.4 — UI, APIs, auth, player. Deploy na Vercel. |
| `apps/worker` | `bjj-media-worker` — Node + yt-dlp + FFmpeg/FFprobe + faster-whisper. **Nunca** roda em Vercel Function. |
| `packages/core` | Compartilhado: schema SQL/migrations, `VideoStorageService` (Vercel Blob), status, parser de URL, taxonomia de técnicas, classificador. |

## 1. Provisionar (uma vez)

1. Crie o projeto na Vercel com **Root Directory = `apps/web`** (npm workspaces são detectados automaticamente).
2. Em **Storage**, conecte **Neon** (Marketplace) e crie um **Blob Store privado**, ambos ligados ao projeto.
3. Variáveis do projeto (veja `apps/web/.env.example`): chaves do Clerk (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`), `SUPER_ADMIN_EMAIL`, `BLOB_ACCESS=private`.

### Vitrine pública (`/explorar`)

Sem login: busca (título, autor, descrição, transcrição e técnicas, sem acentos), filtros por **tipo de posição** (Guarda, Posição) e **ação** (Raspagem, Passagem, Finalização, Pegada de costas, Queda, Saída), por técnica e origem, taxonomia em `/explorar/tecnicas` e página de vídeo com player, técnicas com timestamp e transcrição. `/` sem login redireciona para `/explorar`. Só vídeos concluídos aparecem.

> O player público serve o MP4 do seu Blob a qualquer visitante: isso republica vídeos de terceiros (risco de direitos autorais/termos das plataformas) e a transferência do Blob passa a ser consumida por anônimos. Cada página credita o autor e linka o post original.

### Usuários e papéis (Clerk)

- **Super admin** — a conta Clerk cujo e-mail *verificado* é `SUPER_ADMIN_EMAIL`. Importa/envia/apaga vídeos, reprocessa, vê Storage, status do worker e a página **Usuários** (bloquear/desbloquear contas).
- **User** — qualquer pessoa pode criar conta. Vê os vídeos *concluídos* da biblioteca e organiza **favoritos**, **playlists** (criar, renomear, reordenar, remover) e **notas** — tudo privado por usuário.
- O papel é lido do Neon a cada requisição (bloqueio vale na hora). Se a conta Clerk for recriada (ou ao migrar da instância de desenvolvimento para a de produção do Clerk), a linha do usuário é reassociada pelo e-mail verificado.
- Em `*.vercel.app` use as chaves de **Development** do Clerk; a instância de produção do Clerk exige domínio próprio. No painel do Clerk, mantenha apenas provedores que verificam e-mail (e-mail/senha, Google, GitHub).
4. Localmente: `vercel link` → `vercel env pull apps/web/.env.local`.
5. Migrations: `DATABASE_URL=... npm run db:migrate` (idempotente; também sincroniza as 82 técnicas).

## 2. Worker no Mac

```bash
npm install
npm run setup:mac -w bjj-media-worker   # brew yt-dlp/ffmpeg + venv faster-whisper + cria apps/worker/.env
# edite apps/worker/.env: DATABASE_URL (Neon) e BLOB_READ_WRITE_TOKEN (token read-write do MESMO store)
npm run worker:doctor                    # confere binários, Whisper, Neon e Blob
npm run worker                           # Ctrl+C devolve o job atual à fila
```

Testar a cadeia sem banco/Blob: `npm run worker:dry-run -- <url-autorizada> 720`.

## 3. Worker em servidor / container

```bash
docker compose -f docker-compose.worker.yml up -d --build
```
Mesma imagem, mesmo `.env`, nenhuma mudança no frontend. Escale com `WORKER_CONCURRENCY` ou mais réplicas
(a reserva atômica impede processamento duplicado).

## Pipeline do job

`PENDING → EXTRACTING_METADATA → DOWNLOADING → CONVERTING → UPLOADING → TRANSCRIBING → ANALYZING → COMPLETED` (ou `FAILED`/`CANCELLED`)

- **Formato**: até 480/720/1080p preferindo H.264+AAC; se não houver, FFmpeg transcodifica. Sempre `+faststart`.
- **Validação**: duração (`MAX_DURATION_SECONDS`), tamanho (`MAX_FILE_SIZE_MB`), lives recusadas.
- **Upload**: multipart direto do worker para o Blob (`videos/{id}/original-<sufixo>.mp4`, `audio-…mp3`, `thumbnail-…jpg`). O arquivo nunca passa pela API do Next.js.
- **Idempotência**: o pathname do MP4 é gravado no Neon logo após o upload; retries/reinícios não baixam de novo.
- **Lease**: 120 s renovado a cada 10 s. Worker morto (kill -9) → lease expira → outro worker reassume. `SIGINT/SIGTERM` devolve o job sem gastar tentativa.
- **Retry**: falhas transitórias (rede, 5xx, 429) com backoff exponencial (30 s, 60 s, 120 s…, até 4 tentativas). Falhas definitivas (privado, login, DRM, anti-bot, limite, config do Blob) não são repetidas.
- **Cancelamento**: `PENDING` cancela na hora; `RUNNING` é interrompido em ≤10 s (mata yt-dlp/ffmpeg e apaga blobs parciais).
- **Worker desligado**: o job permanece `PENDING`; a UI mostra "Worker offline" e nunca marca como concluído.

**Limites éticos/técnicos**: o worker não usa cookies, contas, proxies nem contorna DRM, paywall, login, verificação anti-bot ou restrições de idade. Quando a plataforma bloqueia, o erro real é mostrado e a UI oferece **Enviar arquivo** (Client Upload direto ao Blob, com autorização no servidor). Baixar conteúdo de terceiros pode violar os termos do YouTube/Instagram — use apenas conteúdo próprio, licenciado ou com permissão.

## Reprodução

Blob privado → o servidor emite **URL pré-assinada de curta duração** (`issueSignedToken` + `presignUrl`, só leitura). O `<video>` busca direto do CDN do Blob com **HTTP Range nativo** (seek instantâneo, sem limite de 4,5 MB das Functions). Se a URL expirar, o player renova via `/api/videos/:id/playback`; como última alternativa usa `/api/videos/:id/stream`, um proxy autenticado que responde `206` em blocos de ~4 MB. O `BLOB_READ_WRITE_TOKEN` nunca chega ao navegador.

Player: play/pause, ±5/10 s, velocidade 0,25×–2×, tela cheia, timeline com marcadores de técnicas, transcrição sincronizada e clicável, busca, notas com timestamp, e `?t=SEGUNDOS` para abrir no momento exato.

## IA sem custo

- **Transcrição**: faster-whisper local (`WHISPER_MODEL=small` padrão; `medium` melhora PT).
- **Técnicas**: classificador por taxonomia PT/EN (82 técnicas, aliases, agrupamento temporal, confiança). Também lê título/descrição/hashtags do post (fonte `metadata`). Opcional: LLM em qualquer API compatível com OpenAI (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` — ex.: Groq grátis ou Ollama local), que deduz técnicas pelo movimento descrito (fonte `llm`, marcada "IA" na UI). Falha/limite do LLM não quebra a análise: fica a classificação lexical.

## Storage

`/admin/storage`: total de vídeos, GB ocupados (vídeo/áudio/thumbs), tamanho por vídeo, estimativa mensal configurável, crescimento em 30 dias, apagar vídeo/áudio/ambos, retranscrever sem novo download e conferência do uso real no Blob (detecta órfãos).

## Testes

```bash
npm test            # parser de URL, classificador, progresso
npm run typecheck
npm run build
```
