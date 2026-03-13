# Release Runbook

This page documents the release process for Protege maintainers.
Current release target: `protege-toolkit@0.0.1-alpha.2`.

## CI Pipelines

| Pipeline | Trigger | What it does |
|----------|---------|-------------|
| **CI** | PRs and pushes to `main` | Package-local typecheck, test, package smoke, dry-run publish |
| **CLI E2E** | PRs and pushes to `main` | Full command-level smoke test from packed tarball |
| **Release** | `v*` tags and manual dispatch | Verify + publish to npm + create GitHub release |
| **Docs** | Pushes to `main` | Build VitePress and deploy to GitHub Pages |

Release publishing behavior:

1. Stable versions publish to npm with the `latest` dist-tag.
2. Prerelease versions (for example `0.0.1-alpha.1`) publish to npm with the `alpha` dist-tag.
3. Automated releases publish from GitHub Actions with `--provenance`.

## Release Procedure

1. **Pull latest `main`** and ensure CI is green

2. **Run local checks:**
   ```bash
   cd framework && npm run lint && npm run typecheck && npm run test
   cd ../relay && npm run lint && npm run typecheck && npm run test
   cd ../site && npm run build
   ```

3. **Bump framework version** in `framework/package.json`

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
   npm view protege-toolkit version
   npm install -g protege-toolkit@alpha
   protege --version
   ```

8. **Smoke test** in a clean workspace:
   ```bash
   mkdir /tmp/release-test && cd /tmp/release-test
   protege init
   protege setup --non-interactive --provider openai --outbound local
   protege doctor
   ```

## Alpha Notes

1. Use prerelease semver for the initial public package, for example `0.0.1-alpha.1`.
2. Publish only the framework package unless relay packaging is explicitly part of the release scope.
3. Treat alpha releases as developer-targeted and document known limitations in the GitHub release notes.

## Rollback

**If publish fails before npm upload:** fix the issue, bump to `vX.Y.(Z+1)`, re-tag, re-push.

**If npm publish succeeds but there's a problem:** never overwrite the same npm version. Patch forward with `vX.Y.(Z+1)` and add correction notes in the GitHub release.
