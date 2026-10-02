# Development

## Prerequisites

- Node.js 24 (see `.nvmrc`; `wrangler` requires >= 22) and npm 11.
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

| Command                                                                 | What it does                                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                         | typecheck + lint + format check + tests + build — the one command that must pass before anything is "done"; CI runs exactly this |
| `npm run typecheck`                                                     | typecheck in every workspace (three `tsc` programs in `product/`, `astro check` in `site/`,                                      |
| `tsc` in `shared/`)                                                     |
| `npm run lint`                                                          | ESLint across the repo                                                                                                           |
| `npm run format` / `npm run format:check`                               | Prettier write / verify                                                                                                          |
| `npm run test`                                                          | Vitest in `product/` — runs inside the Workers runtime via the Cloudflare Vitest plugin                                          |
| `npm run build`                                                         | `vite build` in `product/`, `astro build` in `site/`                                                                             |
| `npm run dev`                                                           | product dev server — Worker and dashboard in one Vite process (HMR)                                                              |
| `npm run dev --workspace @jury-forge/site`                              | promo site dev server                                                                                                            |
| `npm run preview --workspace @jury-forge/product`                       | serve the built product output in workerd (run a build first)                                                                    |
| `npm run preview --workspace @jury-forge/site`                          | serve the built promo site                                                                                                       |
| `npm run cf-typegen --workspace @jury-forge/product`                    | regenerate `product/worker-configuration.d.ts` after changing `product/wrangler.jsonc`                                           |
| `npx wrangler d1 migrations apply jury-forge --local` (from `product/`) | apply D1 migrations to local dev state                                                                                           |
| `node scripts/release.mjs <patch\|minor\|major> [--dry-run]`            | version bump used by the release workflow                                                                                        |

## Environment

- Local development and tests need no environment variables — the Vite plugin emulates bindings
  (including D1) locally.
- Planned runtime secrets for phase 2 (encryption master key and friends) will go in `.dev.vars`
  for local runs and in Worker secrets when deployed; see the boundaries in
  `docs/architecture.md`.
- Releases need the repository secret `RELEASE_TOKEN` (a repo-admin token with
  `contents: write`) before the first release — `main` is protected and the release workflow
  pushes with this token (D-007). Without it, the release job fails with instructions.

## Releases and deploys

Create release PRs from `dev` to `main` and apply exactly one label: `release:patch`,
`release:minor`, or `release:major`. After merge, the release workflow (only from `main`) bumps
the root `package.json` — syncing `package-lock.json` and `CHANGELOG.md` — tags `v<version>`,
and publishes a GitHub release. A merge without a release label publishes nothing. The full
procedure, including the yank/rollback path, is in the `ship-release` skill.

Deployments are manual and always target the owner's own Cloudflare account. Verified locally on
2026-10-02: the build produces the deployable output and `npx wrangler deploy --dry-run` resolves
the build-output configuration and lists the D1 binding. The remote deploy steps themselves have
not been exercised yet — exact commands live in the `ship-release` skill.

## Troubleshooting

| Symptom                                                 | Fix                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Dev tools (e.g. `prettier`) missing after `npm install` | Your environment sets `NODE_ENV=production` (npm `omit=dev`) — run `npm install --include=dev` |
| `wrangler` asks for authentication during deploy        | `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN`                                            |
| Binding types look stale after editing `wrangler.jsonc` | `npm run cf-typegen --workspace @jury-forge/product` and commit the regenerated file           |
