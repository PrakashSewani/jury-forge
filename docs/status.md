# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope                                                                                                 | Status      |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001                | completed   |
| 1     | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | in progress |
| 2     | Product: the core workflow, end to end                                                                | not started |
| 3     | Promo site: the site that explains it and sends people to it                                          | not started |
| 4     | Launch: first release tagged, site deployed                                                           | not started |

## Current handoff

**Phase:** 1 — scaffold landed and independently verified; bootstrap PR open to `dev` (merge
pending).

**Done this session:** renamed the template to **Jury Forge**; captured the brief and the
confirmed v1 contract in `docs/product.md`; recorded D-001 (full stack, versions resolved live)
and D-004–D-007 (self-hosted single-tenant, per-instance private GitHub App via the manifest
flow, Durable Object run engine, branch protections + release token) in `docs/decisions.md`.
Scaffolded the npm-workspaces monorepo — `product/` (Cloudflare Worker with a Hono health API,
a D1 binding + migration, the React dashboard, and Workers-runtime tests), `site/` (Astro promo
site), `shared/` — with one `npm run check` command, CI on PRs to `dev`/`main` and pushes to
`dev`, and the label-driven release workflow + `scripts/release.mjs`. Configured repository
settings: `dev` as default, `release:*` labels, protections on both branches, release labels
created (D-007).

**Verified:** `npm run check` exits 0 (product 3× `tsc`, `astro check` 0 errors, shared `tsc`,
eslint, prettier check, 2/2 Vitest tests inside the Workers runtime, vite + astro builds);
`wrangler types --check` reports the committed Worker types current; `wrangler deploy --dry-run`
resolves the build-output configuration and lists the D1 binding; the D1 migration applies
locally; dev/preview smoke tests served `/api/health` and both sites (HTTP 200). An independent
verifier subagent re-ran the checks and its findings (this tracker, residual template text in
`AGENTS.md` and the bootstrap skill, two doc nits) are fixed in this PR.

**Blocked by:** nothing for the PR. Before the first release (phase 4): set the `RELEASE_TOKEN`
secret — a repo-admin token with `contents: write` (D-007). Until it exists, the release
workflow fails with instructions rather than publishing.

**Next action:** merge the bootstrap PR into `dev` (CI runs on the PR); then start phase 2 —
design the reviewer model, setup wizard, and run engine (docs first), then implement the
end-to-end review loop.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
