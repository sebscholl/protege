# Relay vs Local SMTP

Protege needs a way to send and receive email. There are two modes, and you choose one during setup.

## The Problem: Port 25

Email delivery relies on SMTP, which uses port 25 for inbound mail. Most home and office networks block inbound port 25, which means your local machine can't receive email directly from the internet.

Protege solves this with **relay mode**.

## Relay Mode (Recommended)

In relay mode, a remote relay server handles the public-facing SMTP:

```
Inbound email    Outbound Email
   │                   ▲
   ▼                   │
   ┌─────────────────────┐
   │  Relay Server       │  ← Public SMTP on port 25
   │  (relay.protege.bot)│
   └─────────────────────┘
   │  WebSocket tunnel ▲
   ▼                   │
   ┌─────────────────────┐
   │  Your Local Gateway │  ← No public ports needed
   │  (your machine)     │
   └─────────────────────┘
    Agent replies go back
    through the relay to
    the recipient's inbox
```

**How it works:**

1. Inbound emails arrive at the relay server's public SMTP endpoint
2. The relay tunnels the raw email to your local gateway over a WebSocket connection
3. Your gateway processes the message locally (inference, tool calls, etc.)
4. Outbound replies are sent back through the relay, which delivers them to the recipient's mail server

**When to use relay mode:**

- You're behind a NAT, firewall, or ISP that blocks port 25
- You want to get started quickly without configuring DNS or SMTP infrastructure
- You're running Protege on a laptop, home server, or development machine

**Setup:**

```bash
protege setup --outbound relay --relay-ws-url wss://relay.protege.bot/ws
```

Or bootstrap relay on an existing project:

```bash
protege relay bootstrap --relay-ws-url wss://relay.protege.bot/ws
```

This command:
- Enables relay mode in `configs/gateway.json`
- Updates `mailDomain` from `localhost` to the relay's mail domain
- Reconciles all persona email addresses to use the new domain

## Local SMTP Mode (Direct)

In local mode, your gateway acts as its own SMTP server:

```
Inbound email    Outbound email
   │                   ▲
   ▼                   │
   ┌─────────────────────┐
   │  Your Local Gateway │  ← Public SMTP on port 25
   │  (your machine)     │
   └─────────────────────┘
```

**When to use local mode:**

- You're running on a VPS or server with a public IP and port 25 open
- You want full control over email delivery without a relay intermediary
- You're comfortable configuring DNS (MX records, SPF, PTR) for your domain

**Setup:**

Configure the transport block in `configs/gateway.json`:

```json
{
  "mode": "default",
  "host": "0.0.0.0",
  "port": 25,
  "mailDomain": "agent.yourdomain.com",
  "transport": {
    "host": "smtp.yourdomain.com",
    "port": 587,
    "secure": true,
    "auth": {
      "user": "agent@yourdomain.com",
      "pass": "your-smtp-password"
    }
  }
}
```

Keep `relay.enabled` as `false` (the default).

**Required DNS records:**

Assuming your server's IPv4 is `200.0.100.10` and you want your agents at `mail.yourdomain.com`:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| **MX** | `mail.yourdomain.com` | `10 mail.yourdomain.com` | Routes inbound email to your server |
| **A** | `mail.yourdomain.com` | `200.0.100.10` | Points the subdomain to your server |
| **AAAA** | `mail.yourdomain.com` | *(your IPv6, if applicable)* | IPv6 resolution |
| **TXT** | `mail.yourdomain.com` | `v=spf1 ip4:200.0.100.10 -all` | Authorizes your IP to send mail for this domain |
| **TXT** | `_dmarc.mail.yourdomain.com` | `v=DMARC1; p=none; rua=mailto:postmaster@yourdomain.com; adkim=s; aspf=s` | Email authentication policy |
| **PTR** | *(set via hosting provider)* | `mail.yourdomain.com` | Reverse DNS — required for deliverability |

::: tip PTR records
PTR (reverse DNS) records are configured through your hosting provider's control panel, not your DNS registrar. Most VPS providers (DigitalOcean, Hetzner, Vultr, etc.) support this.
:::

## Which Should I Choose?

| | Relay | Local SMTP |
|---|---|---|
| **Requires port 25** | No | Yes |
| **Requires DNS config** | No | Yes (MX records, SPF, etc.) |
| **Setup difficulty** | One command | Moderate |
| **Agent logic runs** | Locally | Locally |
| **Relies on external server** | Yes (relay) | No |
| **Best for** | Getting started, home use | Production, full control |

Both modes run all agent logic and memory locally. The relay never sees your prompts, tools, memory, or inference data.

## About the Relay

By default, Protege connects to the public relay at `relay.protege.bot`. This is provided as a convenience so you can get started without running your own infrastructure. You can also [deploy your own relay server](/getting-started/relay-operations) for full control.

**What the relay does and doesn't see:**

Your agent's inference, tool calls, memory, and all local data stay on your machine — the relay never has access to any of that. However, inbound and outbound **email content does pass through the relay** as part of SMTP delivery. The relay does not store email content — it forwards messages in transit and discards them — but this is a trust relationship. If your use case involves sensitive data and you aren't comfortable with that, either deploy your own relay or use local SMTP mode.

## Email Deliverability (Self-Hosted Relay)

If you deploy your own relay server, configure these DNS records for reliable outbound delivery:

- **SPF** record for the relay's mail domain
- **PTR / rDNS** for the relay server's IP address
- **DMARC** policy (recommended)

Without these, outbound emails from your agent may land in spam folders.

## Next Steps

- [Relay Operations](/getting-started/relay-operations) — deploying and managing a relay server
- [Config Files](/developer-experience/configuration) — full gateway configuration reference
