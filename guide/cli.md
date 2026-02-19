# CLI Reference

Protege commands are run through:

```bash
tsx engine/cli/index.ts <command> ...
```

Or via npm scripts when provided in `package.json`.

## Gateway

1. Start:
```bash
tsx engine/cli/index.ts gateway start
```
2. Start in dev mode:
```bash
tsx engine/cli/index.ts gateway start --dev
```
3. Stop:
```bash
tsx engine/cli/index.ts gateway stop
```
4. Restart:
```bash
tsx engine/cli/index.ts gateway restart
```

## Persona

1. Create persona:
```bash
tsx engine/cli/index.ts persona create --name "Primary" --set-active
```
2. List personas:
```bash
tsx engine/cli/index.ts persona list
```
3. Show persona info:
```bash
tsx engine/cli/index.ts persona info <persona_id>
```
4. Set active persona:
```bash
tsx engine/cli/index.ts persona use <persona_id>
```
5. Delete persona:
```bash
tsx engine/cli/index.ts persona delete <persona_id>
```

## Relay

1. Bootstrap local relay client config:
```bash
tsx engine/cli/index.ts relay bootstrap --relay-ws-url wss://relay.example.com/ws
```

## Status

1. Human-readable status:
```bash
tsx engine/cli/index.ts status
```
2. JSON status:
```bash
tsx engine/cli/index.ts status --json
```

## Logs

1. Show latest logs:
```bash
tsx engine/cli/index.ts logs
```
2. Tail latest N lines:
```bash
tsx engine/cli/index.ts logs --tail 200
```
3. Filter by scope:
```bash
tsx engine/cli/index.ts logs --scope gateway
```
4. Stream logs:
```bash
tsx engine/cli/index.ts logs --follow
```
5. Keep raw JSON:
```bash
tsx engine/cli/index.ts logs --json
```

## Doctor

1. Human-readable diagnostic checks:
```bash
tsx engine/cli/index.ts doctor
```
2. JSON diagnostic report:
```bash
tsx engine/cli/index.ts doctor --json
```

`doctor` returns process exit code:

1. `0`: healthy or degraded (warnings only).
2. `1`: unhealthy (one or more failing checks).
