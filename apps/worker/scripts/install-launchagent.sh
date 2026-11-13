#!/usr/bin/env bash
# Instala o bjj-media-worker como LaunchAgent do macOS: sobe no login e reinicia se cair.
#   bash apps/worker/scripts/install-launchagent.sh            # instala/atualiza e inicia
#   bash apps/worker/scripts/install-launchagent.sh uninstall  # para e remove
set -euo pipefail

LABEL="com.skalena.bjj-media-worker"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/bjj-media-worker.log"
DOMAIN="gui/$(id -u)"
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "removido: $LABEL"
  exit 0
fi

NODE_BIN="${NODE_BIN:-$(command -v node)}"
[[ -x "$NODE_BIN" ]] || { echo "node não encontrado; defina NODE_BIN"; exit 1; }
[[ -f "$WORKER_DIR/.env" ]] || { echo "falta $WORKER_DIR/.env (copie de .env.example)"; exit 1; }
BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"

mkdir -p "$HOME/Library/LaunchAgents" "$(dirname "$LOG")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>--import</string><string>tsx</string>
    <string>src/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$WORKER_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):$BREW_PREFIX/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>WORKER_ID</key><string>$(scutil --get LocalHostName 2>/dev/null || hostname -s)-launchd</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ExitTimeOut</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL"
echo "instalado: $PLIST"
echo "log: $LOG"
