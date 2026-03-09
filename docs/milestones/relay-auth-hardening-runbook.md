# Relay Auth Hardening Runbook (mail.protege.bot)

This runbook configures the existing relay domain for stronger outbound mail authentication.

Scope:

1. DKIM key generation and DNS publishing.
2. DMARC tightening path.
3. SPF/PTR validation.
4. Relay signing configuration and verification.

## 1. Generate DKIM keys on relay host

```bash
mkdir -p /opt/protege/relay/keys
openssl genrsa -out /opt/protege/relay/keys/dkim-private.pem 2048
openssl rsa -in /opt/protege/relay/keys/dkim-private.pem -pubout -out /opt/protege/relay/keys/dkim-public.pem
```

## 2. Build DKIM DNS key payload

```bash
awk 'NR>1{print prev} {prev=$0} END{print prev}' /opt/protege/relay/keys/dkim-public.pem \
| tr -d '\n' \
| sed 's/-----BEGIN PUBLIC KEY-----//; s/-----END PUBLIC KEY-----//'
```

Publish TXT record:

1. Host: `default._domainkey.mail`
2. Type: `TXT`
3. Value: `v=DKIM1; k=rsa; p=<PUBLIC_KEY_PAYLOAD>`

## 3. Confirm SPF record

Expected TXT at `mail.protege.bot`:

```txt
v=spf1 ip4:187.77.78.12 ip6:2a02:4780:79:de6b::1 -all
```

If server IPs change, update this record before enforcement.

## 4. Tighten DMARC in stages

Current mode should start from monitor-only and then tighten.

Stage A:

1. Host: `_dmarc.mail`
2. Type: `TXT`
3. Value:

```txt
v=DMARC1; p=quarantine; rua=mailto:postmaster@protege.bot; adkim=s; aspf=s; pct=100
```

Stage B (after stable delivery confidence):

```txt
v=DMARC1; p=reject; rua=mailto:postmaster@protege.bot; adkim=s; aspf=s; pct=100
```

## 5. Configure relay for DKIM signing

Add relay signing settings (using existing config/env shape):

1. `dkim.enabled=true`
2. `dkim.selector=default`
3. `dkim.domain=mail.protege.bot`
4. `dkim.privateKeyPath=/opt/protege/relay/keys/dkim-private.pem`

If relay config does not yet support these fields, implement support before enforcing gateway auth policy.

## 6. Restart relay service

```bash
npm run relay:server:restart
npm run relay:server:status
```

## 7. Fix IPv6 reverse DNS (or disable IPv6 sending temporarily)

Set PTR for:

1. `2a02:4780:79:de6b::1 -> mail.protege.bot`

If provider cannot set IPv6 PTR:

1. Temporarily remove `AAAA mail.protege.bot`.
2. Remove `ip6:` entry from SPF.

## 8. Verify DNS propagation

```bash
dig +short TXT default._domainkey.mail.protege.bot
dig +short TXT _dmarc.mail.protege.bot
dig +short TXT mail.protege.bot
dig +short -x 187.77.78.12
dig +short -x 2a02:4780:79:de6b::1
```

## 9. Validate with real delivery

Send from Protege relay to Gmail and inspect Gmail original headers:

1. `DKIM: PASS`
2. `SPF: PASS`
3. `DMARC: PASS`

## 10. Post-hardening next step

After auth is consistently passing, implement gateway-level enforcement with policy modes:

1. `off`
2. `warn`
3. `enforce`
