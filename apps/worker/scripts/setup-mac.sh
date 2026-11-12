#!/usr/bin/env bash
# Instala as dependências nativas do bjj-media-worker no macOS (Homebrew).
set -euo pipefail
cd "$(dirname "$0")/.."

command -v brew >/dev/null || { echo "Instale o Homebrew: https://brew.sh"; exit 1; }

echo "→ yt-dlp e FFmpeg (Homebrew)"
brew install yt-dlp ffmpeg python@3.12 >/dev/null || true
brew upgrade yt-dlp >/dev/null 2>&1 || true   # extratores mudam com frequência: mantenha atualizado

PY="$(brew --prefix)/bin/python3.12"
[ -x "$PY" ] || PY="python3"
echo "→ venv Python para faster-whisper ($PY)"
"$PY" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r transcriber/requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ criado apps/worker/.env — preencha DATABASE_URL e BLOB_READ_WRITE_TOKEN"
fi

echo "→ diagnóstico"
npx tsx src/doctor.ts || true
