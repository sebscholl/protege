# Release Runbook

This runbook documents the release process for Protege.

## Preconditions

1. `main` is green on `CI`, `CLI E2E`, and `Docs`.
2. `NPM_TOKEN` is configured in GitHub repository secrets.
3. The target version in `package.json` is final.
4. Release notes scope is known.

## Pipelines

## CI (`.github/workflows/ci.yml`)

Runs on pull requests and pushes to `main`:

1. `npm ci`
2. `npm run typecheck`
3. `npm run test`
4. package smoke (`npm pack` + clean install + CLI checks)
5. `npm publish --dry-run`

## CLI E2E (`.github/workflows/cli-e2e.yml`)

Runs command-level smoke in a clean workspace from the packed tarball:

1. `protege init`
2. `protege setup` (local)
3. `protege doctor`
4. `protege setup` (relay)

## Release (`.github/workflows/release.yml`)

Runs on `v*` tags and manual dispatch:

1. verify job: typecheck, tests, pack, dry-run publish
2. publish job (tag only): npm publish with provenance + GitHub release creation

## Docs (`.github/workflows/docs.yml`)

Builds VitePress and deploys to GitHub Pages from `main`.

## Release Procedure

1. Pull latest `main`.
2. Run local gates:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
3. Bump version in `package.json`.
4. Commit: `chore(release): vX.Y.Z`.
5. Tag release:
   - `git tag vX.Y.Z`
6. Push commit and tag:
   - `git push`
   - `git push origin vX.Y.Z`
7. Monitor GitHub Actions:
   - `Release` workflow verify + publish jobs
8. Confirm:
   - npm package is available
   - GitHub release exists with generated notes

## Rollback and Recovery

If publish fails before npm upload:

1. Fix the issue on `main`.
2. Re-tag with a new version (`vX.Y.(Z+1)`).

If npm publish succeeds but release has issues:

1. Do not overwrite the same npm version.
2. Patch forward with `vX.Y.(Z+1)`.
3. Add correction notes in the new GitHub release.

## Verification Checklist

1. `npm view protege version` returns expected version.
2. `npx protege --version` returns expected version.
3. Fresh workspace command smoke passes:
   - `protege init`
   - `protege setup --non-interactive ...`
   - `protege doctor`
4. Docs site loads from GitHub Pages URL.
