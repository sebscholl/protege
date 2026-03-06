# Personas and Memory

Protege is persona-scoped for identity and runtime data.

## Persona Layout

Per persona directory (`personas/{persona_id}/`) includes:

- `persona.json`
- `passport.key`
- optional `PERSONA.md`
- optional `responsibilities/`
- optional `knowledge/`

`persona.json` fields currently persisted by runtime include:

- `personaId`
- `publicKeyBase32`
- `emailLocalPart`
- `emailAddress`
- `createdAt`
- optional `label`
- optional `aliases` (additional local-parts or addresses for inbound routing)

Example:

```json
{
  "personaId": "5d5291bc3285362f",
  "publicKeyBase32": "cep6474yx3wwbr5xwxgrc2wr5tpsyfxuk2vshsvnf5ib4vause3a",
  "emailLocalPart": "cep6474yx3wwbr5xwxgrc2wr5tpsyfxuk2vshsvnf5ib4vause3a",
  "emailAddress": "cep6474yx3wwbr5xwxgrc2wr5tpsyfxuk2vshsvnf5ib4vause3a@mail.protege.bot",
  "createdAt": "2026-03-04T20:59:02.277Z",
  "aliases": [
    "charlie",
    "tech-support-charlie",
    "support@example.com"
  ]
}
```

Alias routing behavior:

- Non-qualified aliases (for example `charlie`) are interpreted as `charlie@<gateway.mailDomain>`.
- Recipient domain must match configured `gateway.mailDomain`; mismatched domains do not route.
- Fully-qualified aliases (for example `support@example.com`) are only valid when they exactly match the inbound recipient address and the recipient domain matches configured `gateway.mailDomain`.
- Alias matching is case-insensitive after normalization.
- Plus-addressed recipients (for example `charlie+123@...`) route to the same base alias/root mailbox (`charlie@...`).
- Domainless recipients (for example `charlie+123`) are interpreted against configured `gateway.mailDomain`.
- Aliases must be unique across personas; collisions are treated as configuration errors.

## Key Material

`passport.key` is raw private key material (PEM) for relay auth signature flow. If compromised/lost, the identity is rotated by creating a new persona.

## Memory Layout

Per persona memory namespace (`memory/{persona_id}/`) includes:

- `temporal.db`
- `active.md`
- `attachments/`
- `logs/`

## Temporal DB

SQLite stores:

- thread metadata (`threads`)
- inbound/outbound/synthetic messages (`messages`)
- tool trace events (`thread_tool_events`)
- scheduler responsibilities/run records (`responsibilities`, `responsibility_runs`)

## Active Memory

`active.md` is short-horizon editable memory loaded into context by resolver pipeline.

## Responsibilities

Responsibilities are file-first markdown definitions under:

`personas/{persona_id}/responsibilities/*.md`

Frontmatter required keys:

- `name`
- `schedule`
- `enabled`

Body content is prompt text for scheduled execution.

## Selector Behavior

CLI persona selector resolution supports:

- exact `personaId`
- unique `personaId` prefix
- exact `emailLocalPart`

## Commands

```bash
protege persona create "ops-assistant"
protege persona list
protege persona info <persona_id_or_prefix>
protege persona delete <persona_id_or_prefix>
```
