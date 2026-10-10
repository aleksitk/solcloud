#!/usr/bin/env bash
# Start one listener per keypair and restart any that exits.
#   ./start-nodes.sh                       every ~/.config/solana/solcloud-node*.json
#   ./start-nodes.sh a.json b.json         the keypairs named
# Runs in the foreground. Stop it with Ctrl+C.

cd "$(dirname "$0")" || exit 1
# A non-interactive shell does not load nvm on its own.
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
command -v node >/dev/null || { echo "node is not on PATH"; exit 1; }

if [ "$#" -eq 0 ]; then
  set -- "$HOME"/.config/solana/solcloud-node*.json
fi

# A private RPC endpoint, one line in ~/.solcloud-rpc, is used when that file exists.
# The public devnet RPC limits requests per IP and refuses them when the network is busy.
if [ -z "$SOLCLOUD_RPC" ] && [ -s "$HOME/.solcloud-rpc" ]; then
  export SOLCLOUD_RPC="$(tr -d '[:space:]' < "$HOME/.solcloud-rpc")"
  echo "using the RPC from ~/.solcloud-rpc"
fi

# Three listeners on one machine share one IP, and the public RPC limits requests per IP.
# A slower poll keeps them under it. Set SOLCLOUD_RPC to a private endpoint to poll faster.
export SOLCLOUD_POLL_MS="${SOLCLOUD_POLL_MS:-8000}"

keep() {
  while true; do
    node --no-warnings listener.mjs "$1"
    echo "listener for $1 exited, restarting in 5s"
    sleep 5
  done
}

trap 'kill 0' INT TERM
for key in "$@"; do
  [ -f "$key" ] || { echo "no keypair at $key"; continue; }
  # One listener per key. A second copy would race the first for the same task.
  if pgrep -f "listener.mjs $key" >/dev/null; then
    echo "already running: $key"
    continue
  fi
  keep "$key" &
  sleep 3
done
wait
