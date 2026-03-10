#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-env.sh"

# Required environment variables:
#   RELAY_SSH_HOST=187.77.78.12
# Optional:
#   RELAY_SSH_USER=root
#   RELAY_REMOTE_DIR=/opt/protege/relay

SSH_HOST="${RELAY_SSH_HOST:?RELAY_SSH_HOST is required}"
SSH_USER="${RELAY_SSH_USER:-root}"
REMOTE_DIR="${RELAY_REMOTE_DIR:-/opt/protege/relay}"

REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOCAL_RELAY_DIR="${REPO_ROOT}/relay"

if [[ ! -d "${LOCAL_RELAY_DIR}" ]]; then
  echo "Local relay directory does not exist: ${LOCAL_RELAY_DIR}"
  exit 1
fi

ssh "${SSH_USER}@${SSH_HOST}" "mkdir -p '${REMOTE_DIR}'"

rsync -az --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude "node_modules" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude ".secrets" \
  --exclude ".secrets.*" \
  --exclude ".relay.env" \
  --exclude "/tmp" \
  "${LOCAL_RELAY_DIR}/" \
  "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

echo "sync complete: ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}"
