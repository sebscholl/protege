#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-env.sh"

# Required environment variables:
#   RELAY_SSH_HOST=187.77.78.12
# Optional:
#   RELAY_SSH_USER=root
#   RELAY_REMOTE_DIR=/opt/protege
SSH_HOST="${RELAY_SSH_HOST:?RELAY_SSH_HOST is required}"
SSH_USER="${RELAY_SSH_USER:-root}"
REMOTE_DIR="${RELAY_REMOTE_DIR:-/opt/protege}"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

rsync -az --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "memory" \
  --exclude "tmp" \
  "${REPO_ROOT}/" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

echo "sync complete: ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
