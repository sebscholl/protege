#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-env.sh"

SSH_HOST="${RELAY_SSH_HOST:?RELAY_SSH_HOST is required}"
SSH_USER="${RELAY_SSH_USER:-root}"

ssh "${SSH_USER}@${SSH_HOST}" "curl -fsS http://127.0.0.1:8080/health"
