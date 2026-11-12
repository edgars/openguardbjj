# bjj-media-worker — mesma imagem para servidor/VPS/container. Build a partir da RAIZ do repo:
#   docker build -f apps/worker/Dockerfile -t bjj-media-worker .
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python: yt-dlp (sempre a versão mais recente no build) + faster-whisper
COPY apps/worker/transcriber/requirements.txt apps/worker/transcriber/requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
 && /opt/venv/bin/pip install --no-cache-dir -r apps/worker/transcriber/requirements.txt
ENV PATH="/opt/venv/bin:${PATH}" \
    WHISPER_PYTHON=/opt/venv/bin/python \
    WORKER_TMP_DIR=/tmp/bjj-media-worker \
    HF_HOME=/models

# Node: só os workspaces necessários
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace bjj-media-worker --omit=dev

COPY packages/core packages/core
COPY apps/worker apps/worker

RUN useradd -m -u 10001 worker && mkdir -p /tmp/bjj-media-worker /models && chown -R worker /tmp/bjj-media-worker /models
USER worker
WORKDIR /app/apps/worker

# tini repassa SIGTERM → o worker devolve o job à fila antes de sair
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "src/index.ts"]
