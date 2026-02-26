# ADR-0025: File and Discovery Runtime Actions Are Unsandboxed in v1

- Status: Accepted
- Date: 2026-02-26
- Deciders: Protege team
- Technical Story: Keep local file workflows maximally useful in early v1 instead of blocking non-workspace paths.

## Context

ADR-0020 introduced a minimal workspace-root path guardrail for file actions. In practice, this blocks expected agent workflows like reading or writing files outside the repository root (for example Desktop notes or project-adjacent files).

Current product direction favors usefulness and reliability over early path-policy hardening.

## Decision

1. `file.read`, `file.write`, `file.edit`, `file.glob`, and `file.search` do not enforce workspace-root boundaries in v1.
2. Paths for these actions resolve normally from the current process context (absolute paths remain absolute; relative paths resolve from cwd).
3. `shell.exec` keeps workspace-root constraints on `workdir` to avoid accidental process execution drift.
4. This supersedes the file-action path guardrail from ADR-0020.

## Consequences

Positive:

1. Agent file workflows match user expectations for local-machine operations.
2. Fewer false negatives during coding and automation tasks.
3. Less friction in chat-driven workflows that span files outside the repo.

Tradeoffs:

1. Broader file access raises accidental edit/read risk.
2. Future hardening will need an explicit allowlist/policy design and migration path.

## Alternatives Considered

1. Keep strict workspace-only policy:
   - rejected due to frequent practical workflow breakage.
2. Add complex path allowlist policy immediately:
   - rejected to avoid premature configuration complexity.
3. Unsandbox all actions including shell workdir:
   - rejected; shell execution keeps a tighter default boundary.
