# Relay Deployment

Production deployment assets for running the optional Relay service on a VPS with Nginx and systemd.

## Recommended Runtime Pattern

1. `systemd` manages the relay process (`npm run relay:start`).
2. `nginx` terminates TLS and proxies WebSocket/HTTP traffic to local relay HTTP (`127.0.0.1:8080`).
3. Relay SMTP ingress listens directly on `0.0.0.0:25`.
4. Code is synchronized over SSH with `rsync`.

## Files

1. `nginx/relay.protege.bot.conf`: Nginx site config for `relay.protege.bot`.
2. `systemd/protege-relay.service`: systemd unit file for relay runtime.
3. `scripts/sync-to-server.sh`: pushes only the local `relay/` package files to VPS with `rsync`.
4. `scripts/deploy-remote.sh`: runs on VPS to install deps, run checks, and restart systemd.
5. `scripts/host-setup-remote.sh`: runs on VPS to install host packages and wire systemd/nginx.
6. `scripts/server-bootstrap.sh`: local wrapper that syncs and executes host setup over SSH.

## One-Time Server Setup

1. Create deploy user and app directory (example):

```bash
sudo adduser --disabled-password --gecos "" protege
sudo mkdir -p /opt/protege/relay
sudo chown -R protege:protege /opt/protege
```

2. Install required packages:

```bash
sudo apt update
sudo apt install -y nginx nodejs npm rsync
```

3. Configure scoped passwordless sudo for non-interactive deploy/setup commands:

```bash
sudo tee /etc/sudoers.d/protege-relay >/dev/null <<'EOF'
protege ALL=(root) NOPASSWD: /usr/bin/cp, /usr/bin/systemctl, /usr/sbin/nginx, /usr/bin/ln, /usr/bin/apt, /usr/bin/apt-get, /usr/bin/certbot
EOF
sudo chmod 440 /etc/sudoers.d/protege-relay
sudo visudo -cf /etc/sudoers.d/protege-relay
```

4. Set relay domain in `.relay.env`:

```bash
RELAY_DOMAIN=relay.protege.bot
```

## Deploy Flow

Environment variables are loaded from repository `.relay.env` automatically by deploy scripts.
You can still export variables in your shell to override defaults.

Sync behavior (`sync-to-server.sh`) copies only the local `relay/` directory into the remote relay directory.
The script creates the remote relay directory automatically before running `rsync`.

Excluded from sync:

1. VCS/CI internals (`.git`, `.github`).
2. Local dependency/runtime folders (`node_modules`, `/tmp`, `/memory`).
3. Local secret/env files (`.env*`, `.secrets*`, `.relay.env`).

Suggested `.relay.env` keys:

```bash
RELAY_SSH_HOST=187.77.78.12
RELAY_SSH_USER=root
RELAY_REMOTE_DIR=/opt/protege/relay
SERVICE_NAME=protege-relay
RELAY_DOMAIN=relay.protege.bot
```

From local machine:

```bash
cd relay && npm run relay:deploy:sync
```

On VPS (or via SSH command from local):

```bash
cd /opt/protege/relay
npm run relay:deploy:remote
```

Full sync + remote deploy in one command:

```bash
cd relay && npm run relay:deploy
```

First-time host bootstrap (sync + package install + systemd/nginx wiring):

```bash
cd relay && npm run relay:server:bootstrap
```

TLS certificate is still one-time manual:

```bash
ssh "${RELAY_SSH_USER}@${RELAY_SSH_HOST}" "sudo certbot --nginx -d ${RELAY_DOMAIN}"
```

Server operation wrappers (from local, via SSH):

```bash
cd relay && npm run relay:server:restart
cd relay && npm run relay:server:status
cd relay && npm run relay:server:health
cd relay && npm run relay:server:logs
```

## Notes

1. For this project stage, `rsync + systemd + nginx` is simple and production-viable.
2. Common Node alternatives at larger scale are CI/CD (GitHub Actions), Docker, and orchestration platforms.
3. Relay outbound is direct-to-MX SMTP. Configure SPF + PTR/rDNS for your relay mail domain before testing Gmail/major providers.
