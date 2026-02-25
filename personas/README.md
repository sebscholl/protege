# Personas

Extension Surface: Yes

Each persona has its own configuration and identity material.

Every persona directory should contain persona metadata and a `passport.key` file used for relay identity/auth.

Standard files:

1. `persona.json` with persona id, full public key local-part, and metadata.
2. `passport.key` with raw private key material for signing/auth.

Scheduler source files:

1. `responsibilities/` is the file-first scheduler definition directory.
2. Each responsibility is one markdown file: `<responsibility_id>.md`.
3. Required frontmatter keys:
   - `name`
   - `schedule`
   - `enabled`
4. Markdown body is the canonical prompt text used for scheduler runs.
