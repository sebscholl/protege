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

## Environment Files

CLI commands load environment files from the current project directory in this order:

1. `.env`
2. `.env.local`

Existing exported shell variables take precedence and are not overridden by file values.

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
protege persona create --name "Primary"
```
2. List personas:
```bash
protege persona list
```
3. Show persona info:
```bash
protege persona info <persona_id>
```
4. Delete persona:
```bash
protege persona delete <persona_id>
```

## Relay

1. Bootstrap local relay client config:
```bash
protege relay bootstrap --relay-ws-url wss://relay.example.com/ws
```

## Chat

1. Start chat for one persona:
```bash
protege chat --persona <persona_id_or_prefix>
```
2. Start chat and open one specific thread:
```bash
protege chat --persona <persona_id_or_prefix> --thread <thread_id>
```

Chat v1 behavior:

1. Existing threads are read-only.
2. Create writable local chat threads from inbox using `Ctrl+N`.
3. Send in writable local threads using `Ctrl+S` (`Ctrl+Enter` remains accepted as a legacy fallback).
4. Toggle light/verbose display mode with `Ctrl+V`.

For full chat usage, modes, scroll behavior, and keybindings, see `guide/chat.md`.

## Scheduler

1. Reconcile all persona responsibility files into scheduler runtime index:
```bash
protege scheduler sync
```
2. Reconcile one specific persona:
```bash
protege scheduler sync --persona <persona_id_or_prefix>
```
3. Scheduler execution runtime is hosted by gateway:
```bash
protege gateway start
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
