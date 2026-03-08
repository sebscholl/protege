# Personas and Memory

Every Protege agent has at least one **persona** — an identity with its own email address, personality, memory, and responsibilities (scheduled tasks). You can run multiple personas from a single Protege instance, each acting as an independent agent.

## Creating a Persona

```bash
protege persona create "Research Assistant"
```

This generates:
- A unique persona ID (e.g., `5d5291bc3285362f`)
- An Ed25519 key pair for relay authentication
- An email address derived from the public key

```bash
protege persona list
```

```
┌──────────────────┬──────────────────────┬────────────────────────────────────┐
│ Persona ID       │ Display Name         │ Email Address                      │
├──────────────────┼──────────────────────┼────────────────────────────────────┤
│ 5d5291bc3285362f │ Research Assistant   │ cep647...@mail.protege.bot         │
└──────────────────┴──────────────────────┴────────────────────────────────────┘
```

## Persona Directory Structure

Each persona lives in `personas/{persona_id}/`:

```
personas/5d5291bc3285362f/
├── persona.json                  # Identity metadata
├── passport.key                  # Private key (never share this)
├── PERSONA.md                    # Persona-specific instructions
├── responsibilities/             # Scheduled tasks
│   └── daily-summary.md
└── knowledge/
    └── CONTENT.md                # Reference documents the agent can see
```

### `persona.json`

Contains the persona's identity:

```json
{
  "personaId": "5d5291bc3285362f",
  "publicKeyBase32": "cep6474yx3wwbr5xwxgrc2wr5tpsyfxuk2vshsvnf5ib4vause3a",
  "emailLocalPart": "cep6474yx3wwbr5xwxgrc2wr5tpsyfxuk2vshsvnf5ib4vause3a",
  "emailAddress": "cep6474yx3wwbr5xwxgrc2wr5tpsyfxuk2vshsvnf5ib4vause3a@mail.protege.bot",
  "createdAt": "2026-03-04T20:59:02.277Z",
  "displayName": "Research Assistant",
  "aliases": ["research", "researcher"]
}
```

### `PERSONA.md`

This file is loaded into the LLM context for every inference run (via the `load-file` resolver). Use it to give your agent a personality, instructions, or domain knowledge:

```markdown
You are a research assistant. Your job is to help the user find, summarize,
and organize information from the web.

When asked a question:
1. Use web_search to find relevant sources
2. Synthesize the results into a clear summary
3. Reply by email with your findings

Always cite your sources with URLs.
Be concise — aim for 2-3 paragraphs unless asked for more detail.
```

### `knowledge/CONTENT.md`

Static reference material loaded into context. Good for company info, style guides, or domain-specific knowledge that doesn't change often.

## Email Aliases

By default, your persona's email address is a long public-key-derived string. **Aliases** let people reach your agent with friendlier addresses.

```json
{
  "aliases": [
    "charlie",
    "tech-support",
    "support@example.com"
  ]
}
```

**How aliases work:**

- A simple alias like `charlie` becomes `charlie@<mailDomain>` (e.g., `charlie@mail.protege.bot`)
- **Plus-addressing** works automatically: `charlie+project-x@mail.protege.bot` routes to `charlie`
- Aliases are case-insensitive
- Aliases must be unique across all personas — if two personas claim the same alias, it's a configuration error
- The recipient domain must match your configured `mailDomain`

## How Memory Works

Protege gives each persona two layers of memory:

### Temporal database (`memory/{persona_id}/temporal.db`)

A SQLite database that stores everything about the persona's interactions:

| Table | Contents |
|-------|----------|
| `threads` | Thread metadata (subject, participants, timestamps) |
| `messages` | Every inbound, outbound, and synthetic message |
| `thread_tool_events` | Tool call and result traces for each run |
| `responsibilities` | Indexed responsibility metadata |
| `responsibility_runs` | Scheduler run records and outcomes |

This is the source of truth for conversation history. The `thread-history` resolver queries it to build context for each inference run.

### Active memory (`memory/{persona_id}/active.md`)

A short, synthesized summary of recent activity. This file is refreshed automatically by the memory synthesis hooks after each inference run:

1. `thread-memory-updater` summarizes the latest conversation
2. `active-memory-updater` reads recent thread summaries and writes `active.md`

The active memory is loaded into every inference run via `load-file(memory/{persona_id}/active.md)` in the context pipeline. It gives your agent a sense of what it's been working on recently — without needing to load full conversation histories.

You can also edit `active.md` manually to give your agent specific context or instructions that persist across conversations.

## Scheduled Responsibilities

Personas can have recurring tasks defined as markdown files in `personas/{persona_id}/responsibilities/`:

```markdown
---
name: daily-news-digest
schedule: "0 8 * * *"
enabled: true
---

Search the web for the top 5 technology news stories from the past 24 hours.
Summarize each story in 2-3 sentences. Email the digest to admin@example.com
with the subject "Daily Tech Digest - [today's date]".
```

**Frontmatter fields:**

| Field | Description |
|-------|-------------|
| `name` | Unique identifier for this responsibility |
| `schedule` | Cron expression (standard 5-field format) |
| `enabled` | `true` or `false` |

The **body** is the prompt text. When the cron schedule fires, the scheduler creates a synthetic inbound message from this prompt and runs it through the same harness as a normal email.

After creating or modifying responsibility files, sync them to the database:

```bash
protege scheduler sync --persona 5d52
```

## Persona Selection in CLI Commands

Many commands accept a `--persona` flag. You can use:

- **Full persona ID**: `--persona 5d5291bc3285362f`
- **Unique prefix**: `--persona 5d52` (as long as it's unambiguous)
- **Email local part**: `--persona cep6474yx3wwbr5x...`

## Managing Personas

```bash
# Create a new persona with a display name
protege persona create "Ops Monitor"

# List all personas
protege persona list

# Show detailed info about a persona
protege persona info 5d52

# Delete a persona (removes identity files, not memory)
protege persona delete 5d52
```

::: warning Passport key security
`passport.key` contains the persona's private key used for relay authentication. If this key is lost or compromised, create a new persona — there's no key recovery mechanism.
:::
