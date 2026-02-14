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
3. `scripts/sync-to-server.sh`: pushes local repo files to VPS with `rsync`.
4. `scripts/deploy-remote.sh`: runs on VPS to install deps, run checks, and restart systemd.

## One-Time Server Setup

1. Create deploy user and app directory (example):

```bash
sudo adduser --disabled-password --gecos "" protege
sudo mkdir -p /opt/protege
sudo chown -R protege:protege /opt/protege
```

2. Install required packages:

```bash
sudo apt update
sudo apt install -y nginx nodejs npm rsync
```

3. Install and enable systemd unit:

```bash
sudo cp /opt/protege/relay/deploy/systemd/protege-relay.service /etc/systemd/system/protege-relay.service
sudo systemctl daemon-reload
sudo systemctl enable protege-relay
```

4. Install Nginx site config:

```bash
sudo cp /opt/protege/relay/deploy/nginx/relay.protege.bot.conf /etc/nginx/sites-available/relay.protege.bot.conf
sudo ln -s /etc/nginx/sites-available/relay.protege.bot.conf /etc/nginx/sites-enabled/relay.protege.bot.conf
sudo nginx -t
sudo systemctl reload nginx
```

5. Issue TLS cert (example with certbot):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d relay.protege.bot
```

## Deploy Flow

Environment variables are loaded from repository `.env` automatically by deploy scripts.
You can still export variables in your shell to override defaults.

Suggested `.env` keys:

```bash
RELAY_SSH_HOST=187.77.78.12
RELAY_SSH_USER=root
RELAY_REMOTE_DIR=/opt/protege
APP_DIR=/opt/protege
SERVICE_NAME=protege-relay
```

From local machine:

```bash
npm run relay:deploy:sync
```

On VPS (or via SSH command from local):

```bash
cd /opt/protege
npm run relay:deploy:remote
```

Full sync + remote deploy in one command:

```bash
npm run relay:deploy
```

Server operation wrappers (from local, via SSH):

```bash
npm run relay:server:restart
npm run relay:server:status
npm run relay:server:health
npm run relay:server:logs
```

## Notes

1. For this project stage, `rsync + systemd + nginx` is simple and production-viable.
2. Common Node alternatives at larger scale are CI/CD (GitHub Actions), Docker, and orchestration platforms.
3. Relay outbound is direct-to-MX SMTP. Configure SPF + PTR/rDNS for your relay mail domain before testing Gmail/major providers.
