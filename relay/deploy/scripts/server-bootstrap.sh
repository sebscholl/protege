#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-env.sh"

SSH_HOST="${RELAY_SSH_HOST:?RELAY_SSH_HOST is required}"
SSH_USER="${RELAY_SSH_USER:-root}"
REMOTE_DIR="${RELAY_REMOTE_DIR:-/opt/protege}"
APP_DIR="${APP_DIR:-${REMOTE_DIR}}"
SERVICE_NAME="${SERVICE_NAME:-protege-relay}"
RELAY_DOMAIN="${RELAY_DOMAIN:-relay.protege.bot}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-false}"

"${SCRIPT_DIR}/sync-to-server.sh"

ssh "${SSH_USER}@${SSH_HOST}" \
  "cd ${REMOTE_DIR} && APP_DIR='${APP_DIR}' SERVICE_NAME='${SERVICE_NAME}' RELAY_DOMAIN='${RELAY_DOMAIN}' INSTALL_CERTBOT='${INSTALL_CERTBOT}' bash relay/deploy/scripts/host-setup-remote.sh"
