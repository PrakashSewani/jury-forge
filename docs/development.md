# Development

## Prerequisites

- Node.js 24 (see `.nvmrc`; `wrangler` requires >= 22) and npm 11. Node 26 runs `npm run check`
  green as well — the UI suite builds its own `Storage` in tests (`product/test-ui/memory-storage.ts`)
  rather than reading the ambient `window.localStorage`, which Node ≥26 defines as a disabled global
  that vitest's happy-dom environment then declines to replace.
- A Cloudflare account for deploys — the free plan is enough; Workers Paid is optional headroom.
- No accounts or services are needed for local development and tests.

## Setup

```bash
git clone https://github.com/PrakashSewani/jury-forge.git
cd jury-forge
npm install
```

If your environment exports `NODE_ENV=production` (or npm is configured with `omit=dev`), npm
skips dev dependencies — run `npm install --include=dev` in that case.

## Commands

| Command                                                                 | What it does                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                         | typecheck + lint + format check + tests + build — the one command that must pass before anything is "done"; CI runs exactly this                                                                        |
| `npm run typecheck`                                                     | typecheck in every workspace (three `tsc` programs in `product/`, `astro check` in `site/`, `tsc` in `shared/`)                                                                                         |
| `npm run lint`                                                          | ESLint across the repo                                                                                                                                                                                  |
| `npm run format` / `npm run format:check`                               | Prettier write / verify                                                                                                                                                                                 |
| `npm run test`                                                          | Vitest across `product/` — the workerd suite (`test:worker`) then the UI suite (`test:ui`)                                                                                                              |
| `npm run test:worker --workspace @jury-forge/product`                   | workerd suite: `product/test/**/*.test.ts` inside the Workers runtime via the Cloudflare Vitest plugin                                                                                                  |
| `npm run test:ui --workspace @jury-forge/product`                       | UI suite: `product/test-ui/**/*.test.{ts,tsx}` in happy-dom with Testing Library                                                                                                                        |
| `npm run build`                                                         | `vite build` in `product/`, `astro build` in `site/`                                                                                                                                                    |
| `npm run dev`                                                           | product dev server — Worker and dashboard in one Vite process (HMR)                                                                                                                                     |
| `npm run dev:seed`                                                      | seed the local D1 dev state with one instance, reviewers, repositories, runs, findings and a sample knowledge pack (two versions, docs, grants) — idempotent, `--local` only, never a deployed instance |
| `npm run dev --workspace @jury-forge/site`                              | promo site dev server                                                                                                                                                                                   |
| `npm run preview --workspace @jury-forge/product`                       | serve the built product output in workerd (run a build first)                                                                                                                                           |
| `npm run preview --workspace @jury-forge/site`                          | serve the built promo site                                                                                                                                                                              |
| `npm run cf-typegen --workspace @jury-forge/product`                    | regenerate `product/worker-configuration.d.ts` after changing `product/wrangler.jsonc`                                                                                                                  |
| `npx wrangler d1 migrations apply jury-forge --local` (from `product/`) | apply D1 migrations to local dev state                                                                                                                                                                  |
| `node scripts/release.mjs <patch\|minor\|major> [--dry-run]`            | version bump used by the release workflow                                                                                                                                                               |

## Environment

- Local development and tests need no environment variables — the Vite plugin emulates bindings
  (including D1) locally.
- Instance secrets (phase 2): `product/.dev.vars.example` is the reference — `ENCRYPTION_KEY`
  encrypts credentials at rest, and `SETUP_CODE` gates the one-time instance claim (D-008). For
  local runs, copy it to `product/.dev.vars` (gitignored); deployed instances set the same names
  with `npx wrangler secret put <NAME>`. D-023 adds three optional rotation secrets
  (`ENCRYPTION_KEY_VERSION`, `ENCRYPTION_KEY_PREVIOUS`,
  `ENCRYPTION_KEY_PREVIOUS_VERSION`) — an instance that never rotates leaves them unset; see
  "Rotating the encryption key" below. Nothing secret is ever committed — see the boundaries
  in `docs/architecture.md`.
- Releases need the repository secret `RELEASE_TOKEN` (a repo-admin token with
  `contents: write`) before the first release — `main` is protected and the release workflow
  pushes with this token (D-007). Without it, the release job fails with instructions.

## Rotating the encryption key

`ENCRYPTION_KEY` encrypts every credential at rest (D-005, D-023). Ciphertexts are versioned
(`v2.<keyVersion>.<iv>.<ciphertext>`), so a rotation needs no re-entry of credentials:

```bash
# 1. Generate the next key and label it (labels are arbitrary strings; this example moves the
#    previous key's label into the new "previous" slot).
openssl rand -base64 32                      # the new ENCRYPTION_KEY

# 2. Configure the ring — current key, current label, previous key, previous label:
npx wrangler secret put ENCRYPTION_KEY                    # the new key
npx wrangler secret put ENCRYPTION_KEY_VERSION            # e.g. 2
npx wrangler secret put ENCRYPTION_KEY_PREVIOUS           # the old key, kept for reads
npx wrangler secret put ENCRYPTION_KEY_PREVIOUS_VERSION   # e.g. 1

# 3. Deploy (or reload) the Worker so the new secrets are live. New writes — reviewer API keys,
#    reviewer updates, registrations — use the new key immediately; old ciphertexts keep
#    decrypting with ENCRYPTION_KEY_PREVIOUS.
```

A reviewer's API key is re-wrapped with the current key the next time that reviewer is updated
(the operation is recorded in the activity trail). GitHub App credentials are only rewritten when
the app is registered, so re-run the setup wizard's app registration before removing
`ENCRYPTION_KEY_PREVIOUS` if you want the app's secrets on the new key. Once nothing decrypts with
the previous key, delete the two `*_PREVIOUS*` secrets.

## Releases and deploys

Create release PRs from `dev` to `main` and apply exactly one label: `release:patch`,
`release:minor`, or `release:major`. There is no release branch and no `release:` label any more (D-030): a merge
to `dev` is the shipping event. The root `package.json` version is no longer bumped by CI — cut it by
hand when a version is worth cutting, and tag it from `dev`. The `ship-release` skill still holds the
yank/rollback procedure.

Deployments target the owner's own Cloudflare account. Verified locally on
2026-10-02: the build produces the deployable output and `npx wrangler deploy --dry-run` resolves
the build-output configuration and lists the D1 binding. The remote deploy steps themselves have
not been exercised yet — exact commands live in the `ship-release` skill.

For a first deploy, `npm run deploy:guided` (D-025) runs the whole first-run sequence — wrangler
auth check, D1 create and wiring of its id, the two instance secrets, remote migrations, product
deploy — and prints the instance's `/setup` URL when it is done. `npm run deploy:guided --
--dry-run` prints every step it would run and changes nothing. It skips steps that already exist,
so it is safe to re-run.

**Automated deploy (D-030).** A push to `dev` runs `.github/workflows/deploy.yml`: `npm ci`, the
repository's own `npm run check`, the remote D1 migrations, then the product deploy. It needs the
repository secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts + D1) and `CLOUDFLARE_ACCOUNT_ID`.
Migrations run before the deploy, so a schema change reaches the database first, and a failing check
stops the run before either happens. `wrangler versions list` then `wrangler versions deploy <id>`
rolls the Worker back — code only; a migration is not rewound.

## Troubleshooting

| Symptom                                                 | Fix                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Dev tools (e.g. `prettier`) missing after `npm install` | Your environment sets `NODE_ENV=production` (npm `omit=dev`) — run `npm install --include=dev` |
| `wrangler` asks for authentication during deploy        | `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN`                                            |
| Binding types look stale after editing `wrangler.jsonc` | `npm run cf-typegen --workspace @jury-forge/product` and commit the regenerated file           |
