# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope                                                                                                 | Status      |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001                | completed   |
| 1     | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | completed   |
| 2     | Product: the core workflow, end to end                                                                | in progress |
| 3     | Promo site: the site that explains it and sends people to it                                          | not started |
| 4     | Launch: first release tagged, site deployed                                                           | not started |

## Current handoff

**Phase:** 2 in progress — slice 4 (webhook intake and the run engine) is in review on
`phase-2/4-webhooks-run-engine` (#11), stacked on slice 3 (`phase-2/3-reviewers-providers`, #10);
slice 2b (`phase-2/2b-wizard-ui`, #9) targets `dev`; slice 2a (#8) is merged to `dev`.

**Done this session:** built slice 4 — the webhook receiver (raw-body HMAC verification,
`pull_request` filtering, delivery de-duplication with pruning, an idempotent run kick) and the
`RunEngine` Durable Object end to end (config → file pages → 25-file context batches →
per-reviewer prompts → parallel provider calls → consolidation → one `COMMENT` review), with
per-step backoff retries, non-retryable 4xx handling, `skipped` runs for disabled repositories
or no applicable reviewers, and `runs` / `run_reviewers` as the durable history (D-016 records
the activation semantics); plus the run history API (`GET /api/runs`, `GET /api/runs/:id`) and
batched context accumulation.

**Verified:** `npm run check` exits 0 — typecheck, lint, Prettier, 95/95 tests across 13 files,
both builds. Engine tests drive real Durable Object alarms (including backoff retries) against
MSW-mocked GitHub and provider endpoints.

**Blocked by:** nothing. Slice 5 (the dashboard screens) stacks on `phase-2/4-webhooks-run-engine`
once this merges.

**Next action:** build slice 5 — the reviewers, repositories, and runs dashboard screens
(repositories API and per-repo toggles included), then the end-to-end pass.

## Backlog (owner-owned, deferred)

- **Before the first release (phase 4):** create a repo-admin token with `contents: write` and
  add it as the `RELEASE_TOKEN` repository secret — the release workflow fails, with
  instructions, until it exists (D-007; steps in `docs/development.md`). Deferred by the owner.
- **Before the first instance deploy (manual):** generate an `ENCRYPTION_KEY`
  (`openssl rand -base64 32`) and a one-time `SETUP_CODE` (`openssl rand -base64 24`), and set
  both as Worker secrets alongside the D1 create step — see the `ship-release` skill (D-008).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
