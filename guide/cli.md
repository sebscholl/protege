# CLI Reference

Protege commands are run through:

```bash
protege <command> ...
```

Top-level flags:

```bash
protege --help
protege -h
protege --version
protege -v
```

## Install

Global install:

```bash
npm install -g protege
```

Initialize a project:

```bash
mkdir my-protege
cd my-protege
protege init
```

## Gateway

1. Start:
```bash
protege gateway start
```
2. Start in dev mode:
```bash
protege gateway start --dev
```
3. Stop:
```bash
protege gateway stop
```
4. Restart:
```bash
protege gateway restart
```

## Persona

1. Create persona:
```bash
protege persona create --name "Primary" --set-active
```
2. List personas:
```bash
protege persona list
```
3. Show persona info:
```bash
protege persona info <persona_id>
```
4. Set active persona:
```bash
protege persona use <persona_id>
```
5. Delete persona:
```bash
protege persona delete <persona_id>
```

## Relay

1. Bootstrap local relay client config:
```bash
protege relay bootstrap --relay-ws-url wss://relay.example.com/ws
```

## Init

1. Initialize in current directory:
```bash
protege init
```
2. Initialize another directory:
```bash
protege init --path ./my-protege
```
3. Overwrite scaffold files:
```bash
protege init --force
```

## Status

1. Human-readable status:
```bash
protege status
```
2. JSON status:
```bash
protege status --json
```

## Logs

1. Show latest logs:
```bash
protege logs
```
2. Tail latest N lines:
```bash
protege logs --tail 200
```
3. Filter by scope:
```bash
protege logs --scope gateway
```
4. Stream logs:
```bash
protege logs --follow
```
5. Keep raw JSON:
```bash
protege logs --json
```

## Doctor

1. Human-readable diagnostic checks:
```bash
protege doctor
```
2. JSON diagnostic report:
```bash
protege doctor --json
```

`doctor` returns process exit code:

1. `0`: healthy or degraded (warnings only).
2. `1`: unhealthy (one or more failing checks).
