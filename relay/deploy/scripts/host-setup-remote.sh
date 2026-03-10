#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-env.sh"

RELAY_DIR="${RELAY_DIR:-/opt/protege/relay}"
SERVICE_NAME="${SERVICE_NAME:-protege-relay}"
RELAY_DOMAIN="${RELAY_DOMAIN:-relay.protege.bot}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-false}"

if [[ ! -d "${RELAY_DIR}" ]]; then
  echo "RELAY_DIR does not exist: ${RELAY_DIR}"
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for host setup."
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get is required for host setup."
  exit 1
fi

sudo apt-get update
sudo apt-get install -y nginx nodejs npm rsync

if [[ "${INSTALL_CERTBOT}" == "true" ]]; then
  sudo apt-get install -y certbot python3-certbot-nginx
fi

sudo cp "${RELAY_DIR}/deploy/systemd/protege-relay.service" "/etc/systemd/system/${SERVICE_NAME}.service"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"

TMP_NGINX_PATH="$(mktemp)"
cp "${RELAY_DIR}/deploy/nginx/relay.protege.bot.conf" "${TMP_NGINX_PATH}"
ESCAPED_RELAY_DOMAIN="$(printf '%s\n' "${RELAY_DOMAIN}" | sed 's/[\\/&]/\\&/g')"
sed -i "s/relay\\.protege\\.bot/${ESCAPED_RELAY_DOMAIN}/g" "${TMP_NGINX_PATH}"
sudo cp "${TMP_NGINX_PATH}" "/etc/nginx/sites-available/${RELAY_DOMAIN}.conf"
rm -f "${TMP_NGINX_PATH}"

sudo ln -sfn "/etc/nginx/sites-available/${RELAY_DOMAIN}.conf" "/etc/nginx/sites-enabled/${RELAY_DOMAIN}.conf"
sudo nginx -t
sudo systemctl reload nginx

echo "host setup complete: service=${SERVICE_NAME} relayDomain=${RELAY_DOMAIN} relayDir=${RELAY_DIR}"
