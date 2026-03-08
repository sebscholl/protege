# Relay Operations

This page covers how the relay works under the hood and how to deploy your own relay server. If you're using a hosted relay (like `relay.protege.bot`), you only need the [bootstrap section](#bootstrapping-your-local-gateway).

## Bootstrapping Your Local Gateway

Connect your local Protege instance to a relay server:

```bash
protege relay bootstrap --relay-ws-url wss://relay.protege.bot/ws
```

This command does three things:

1. **Enables relay mode** in `configs/gateway.json` (`relay.enabled: true`)
2. **Sets your mail domain** — replaces `localhost` with the relay's domain (e.g., `mail.protege.bot`)
3. **Updates persona addresses** — reconciles all persona email addresses to use the new domain

After bootstrapping, start the gateway:

```bash
protege gateway start
```

Your gateway connects to the relay over WebSocket. You can verify the connection:

```bash
protege status
protege logs --scope gateway --tail 50
```

Look for `gateway.relay.authenticated` and `gateway.relay.clients_started` events in the logs.

## How the Relay Bridge Works

The relay bridges public SMTP and your local gateway using WebSocket tunneling:

**Inbound flow:**
1. Someone sends email to `your-agent@mail.protege.bot`
2. The relay's SMTP server accepts the message
3. The relay looks up which WebSocket connection owns that address
4. The raw SMTP data is streamed to your gateway as tunnel frames (`smtp_start` → `smtp_chunk` → `smtp_end`)
5. Your gateway reassembles the email and processes it normally

**Outbound flow:**
1. Your agent calls the `send_email` tool during an inference run
2. The gateway sends the outbound email payload to the relay over the WebSocket tunnel
3. The relay assembles the MIME message and delivers it to the recipient's mail server via SMTP
4. The relay sends a `relay_delivery_result` control message back to confirm delivery

**Authentication:**
- Each persona authenticates independently using an Ed25519 challenge-response signature
- The relay has no user accounts or tenant model — identity is the public key
- Persona keys are stored locally in `personas/{persona_id}/passport.key`

## Tuning Connection Parameters

You can adjust relay connection behavior during bootstrap:

```bash
protege relay bootstrap \
  --relay-ws-url wss://relay.protege.bot/ws \
  --reconnect-base-delay-ms 500 \
  --reconnect-max-delay-ms 16000 \
  --heartbeat-timeout-ms 45000
```

Or edit `configs/gateway.json` directly:

```json
{
  "relay": {
    "enabled": true,
    "relayWsUrl": "wss://relay.protege.bot/ws",
    "reconnectBaseDelayMs": 500,
    "reconnectMaxDelayMs": 16000,
    "heartbeatTimeoutMs": 45000
  }
}
```

The gateway uses exponential backoff for reconnection — starting at `reconnectBaseDelayMs` and capping at `reconnectMaxDelayMs`.

## Deploying Your Own Relay

The relay server is a standalone Node.js service under `relay/` in the Protege repository. Deployment uses `rsync` + `systemd` + `nginx`.

```
relay/deploy/
├── nginx/         # Reverse proxy config (TLS termination + WebSocket upgrade)
├── systemd/       # Service unit files
├── scripts/       # Deploy, sync, restart, status, health check scripts
└── README.md      # Detailed deployment guide
```

**Requirements:**
- A VPS with a public IP and port 25 open (for SMTP)
- A domain with DNS records pointing to the server (see [Email Deliverability](#email-deliverability) below)
- Node.js 18+
- nginx (for TLS termination and WebSocket proxying)

### Step 1: Configure your local environment

Create a `.relay.env` file in the Protege repository root with your server's connection details:

```bash
# .relay.env
RELAY_SSH_HOST=200.0.100.10       # Your server's public IP
RELAY_SSH_USER=root               # SSH user (default: root)
RELAY_REMOTE_DIR=/opt/protege     # Where code lives on the server
APP_DIR=/opt/protege
SERVICE_NAME=protege-relay
```

The deploy scripts load this file automatically.

### Step 2: One-time server setup

Create a dedicated deploy user and app directory (one-time):

```bash
sudo adduser --disabled-password --gecos "" protege
sudo mkdir -p /opt/protege
sudo chown -R protege:protege /opt/protege
```

### Step 2.1: Allow non-interactive host setup (passwordless sudo)

To run host-setup scripts from npm/SSH without interactive sudo prompts, grant the deploy user scoped `NOPASSWD` access for required commands:

```bash
sudo tee /etc/sudoers.d/protege-relay >/dev/null <<'EOF'
protege ALL=(root) NOPASSWD: /usr/bin/cp, /usr/bin/systemctl, /usr/sbin/nginx, /usr/bin/ln, /usr/bin/apt, /usr/bin/apt-get, /usr/bin/certbot
EOF
sudo chmod 440 /etc/sudoers.d/protege-relay
sudo visudo -cf /etc/sudoers.d/protege-relay
```

Then use `RELAY_SSH_USER=protege` in `.relay.env` so deploy commands can execute the privileged setup flow non-interactively.

Also set your relay domain in `.relay.env`:

```bash
RELAY_DOMAIN=relay.yourdomain.com
```

### Step 3: Sync and deploy

From your **local machine**, sync the codebase and deploy in one command:

```bash
npm run relay:deploy
```

This does two things:
1. **Syncs** the repo to your server via `rsync` (excluding `.git`, `node_modules`, secrets, and local data)
2. **SSHs into the server** and runs the remote deploy script, which installs dependencies, runs tests, and restarts the systemd service

### Step 4: Run host bootstrap script (first deploy only)

Use the npm wrapper to run remote host setup non-interactively:

```bash
npm run relay:server:bootstrap
```

This command:
1. Syncs repo files to the server
2. Installs required packages (`nginx`, `nodejs`, `npm`, `rsync`)
3. Installs/enables the relay `systemd` unit
4. Installs/reloads nginx config for `RELAY_DOMAIN`

Issue TLS certificate once host bootstrap completes:

```bash
ssh "${RELAY_SSH_USER}@${RELAY_SSH_HOST}" "sudo certbot --nginx -d ${RELAY_DOMAIN}"
```

::: tip Subsequent deploys
After the initial setup, you only need `npm run relay:deploy` from your local machine. It syncs code, installs deps, runs tests, and restarts the service automatically.
:::

### Managing the relay

These commands run from your **local machine** and operate on the remote server via SSH:

```bash
npm run relay:server:status    # systemd service status
npm run relay:server:health    # HTTP health check
npm run relay:server:restart   # restart the service
npm run relay:server:logs      # tail journalctl logs
npm run relay:server:bootstrap # first-time host setup (sudo-capable)
```

### Pointing your gateway at your relay

Once your relay is running, bootstrap your local gateway to use it:

```bash
protege relay bootstrap --relay-ws-url wss://relay.yourdomain.com/ws
```

## Email Deliverability

For your relay to deliver outbound email reliably, configure these DNS records (replacing with your relay's IP and domain):

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| **MX** | `mail.yourdomain.com` | `10 relay.yourdomain.com` | Routes inbound email to your relay |
| **A** | `relay.yourdomain.com` | `200.0.100.10` | Points the relay subdomain to your server |
| **AAAA** | `relay.yourdomain.com` | *(your IPv6, if applicable)* | IPv6 resolution |
| **A** | `mail.yourdomain.com` | `200.0.100.10` | Points the mail subdomain to your server |
| **TXT** | `mail.yourdomain.com` | `v=spf1 ip4:200.0.100.10 -all` | Authorizes your IP to send mail |
| **TXT** | `_dmarc.mail.yourdomain.com` | `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain.com; adkim=s; aspf=s` | Email authentication policy |
| **PTR** | *(set via hosting provider)* | `relay.yourdomain.com` | Reverse DNS — required for deliverability |

Without these, recipient mail servers may reject or spam-folder your agent's outbound emails.
