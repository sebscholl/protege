#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-env.sh"

RELAY_DIR="${RELAY_DIR:-/opt/protege/relay}"
SERVICE_NAME="${SERVICE_NAME:-protege-relay}"

cd "${RELAY_DIR}"

npm ci
npm run typecheck
npm run test -- tests/index.test.ts tests/src/*.test.ts tests/src/auth/*.test.ts tests/scripts/*.test.ts

sudo systemctl daemon-reload
sudo systemctl restart "${SERVICE_NAME}"
sudo systemctl --no-pager --full status "${SERVICE_NAME}"

for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:8080/health" >/dev/null; then
    echo "healthcheck ok (attempt ${attempt})"
    echo "deploy complete"
    exit 0
  fi

  sleep 1
done

echo "healthcheck failed after 30 attempts"
sudo journalctl -u "${SERVICE_NAME}" -n 100 --no-pager || true
exit 1
