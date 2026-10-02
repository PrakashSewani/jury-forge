---
name: ship-release
description: Explain the automated release path and perform manual product/site deployments when asked.
license: MIT
metadata:
  template: jury-forge
  version: '1'
---

# Release and deploy

## Rules (always)

- **Release trigger:** only a pull request merged into `main` starts release-related workflows.
  Work on `dev` never publishes a release.
- **Release selection:** a release PR carries exactly one `release:patch`, `release:minor`, or
  `release:major` label. A merge without one publishes nothing.
- **Version source of truth:** the root `package.json`, kept in sync with `package-lock.json`
  and `CHANGELOG.md` by `scripts/release.mjs`.
- **Deployments are manual.** Give the user exact, copy-pasteable commands; never deploy without
  being asked.

## Automated release (implemented 2026-10-02)

Workflow: `.github/workflows/release.yml`, triggered by pushes to `main`.

1. Finds the merged pull request for the pushed commit and collects `release:*` labels — errors
   on more than one, publishes nothing when there are none.
2. Fails fast with setup instructions when the `RELEASE_TOKEN` secret is missing (required
   because `main` is protected and personal repositories cannot grant GitHub Actions a bypass —
   see D-007).
3. Runs `node scripts/release.mjs <patch|minor|major>`: bumps the root `package.json` version,
   syncs `package-lock.json`, and moves `CHANGELOG.md`'s `[Unreleased]` section under
   `## [<version>] - <date>`.
4. Commits `chore(release): v<version> [skip ci]`, pushes the commit to `main` and the
   `v<version>` tag with `RELEASE_TOKEN`, then publishes a GitHub release with generated notes.

Not yet exercised end to end: the first real release is phase 4. The script was verified locally
on 2026-10-02 (real bump, inspection, restore, and dry run).

### Yank a bad release

```bash
gh release delete v<version> --cleanup-tag --yes   # removes the release and its tag
git revert <bump-commit-sha>                       # undo the version bump on main, via a PR
```

## Manual deploys

Deployments were not exercised on 2026-10-02 — no Cloudflare account was connected from this
environment. The commands below are the procedure to run when the owner asks; expect to
authenticate with `npx wrangler login` (or `CLOUDFLARE_API_TOKEN`) first.

### Product (Worker + dashboard)

```bash
# One time per instance, before the first deploy:
npx wrangler d1 create jury-forge     # copy the returned database_id into product/wrangler.jsonc
cd product
npx wrangler d1 migrations apply jury-forge --remote
npx wrangler secret put ENCRYPTION_KEY   # openssl rand -base64 32 — encrypts credentials at rest
npx wrangler secret put SETUP_CODE       # openssl rand -base64 24 — one-time instance claim (D-008)

# Every deploy:
cd product && npm run deploy          # vite build && wrangler deploy (uses the build output config)
```

Both secrets must exist before the setup wizard runs — the one-time claim requires `SETUP_CODE`
(D-008).

### Promo site (static assets)

```bash
cd site && npm run build && npx wrangler deploy
```

### Rollback

- Product: `npx wrangler deployments list`, then `npx wrangler rollback [version-id]`.
- Site: redeploy the previous commit — static assets are immutable, so deploying an older
  commit restores the previous site.
