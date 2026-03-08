# Release Runbook

This page documents the release process for Protege maintainers.

## CI Pipelines

| Pipeline | Trigger | What it does |
|----------|---------|-------------|
| **CI** | PRs and pushes to `main` | Typecheck, test, package smoke, dry-run publish |
| **CLI E2E** | PRs and pushes to `main` | Full command-level smoke test from packed tarball |
| **Release** | `v*` tags and manual dispatch | Verify + publish to npm + create GitHub release |
| **Docs** | Pushes to `main` | Build VitePress and deploy to GitHub Pages |

## Release Procedure

1. **Pull latest `main`** and ensure CI is green

2. **Run local checks:**
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   ```

3. **Bump version** in `package.json`

4. **Commit:**
   ```bash
   git commit -am "chore(release): vX.Y.Z"
   ```

5. **Tag and push:**
   ```bash
   git tag vX.Y.Z
   git push && git push origin vX.Y.Z
   ```

6. **Monitor** the Release workflow in GitHub Actions (verify + publish jobs)

7. **Verify:**
   ```bash
   npm view protege version           # Expected version
   npx protege --version              # Expected version
   ```

8. **Smoke test** in a clean workspace:
   ```bash
   mkdir /tmp/release-test && cd /tmp/release-test
   npx protege init
   npx protege setup --non-interactive --provider openai --outbound local
   npx protege doctor
   ```

## Rollback

**If publish fails before npm upload:** fix the issue, bump to `vX.Y.(Z+1)`, re-tag, re-push.

**If npm publish succeeds but there's a problem:** never overwrite the same npm version. Patch forward with `vX.Y.(Z+1)` and add correction notes in the GitHub release.
