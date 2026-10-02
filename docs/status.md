# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope                                                                                                 | Status      |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001                | completed   |
| 1     | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | completed   |
| 2     | Product: the core workflow, end to end                                                                | not started |
| 3     | Promo site: the site that explains it and sends people to it                                          | not started |
| 4     | Launch: first release tagged, site deployed                                                           | not started |

## Current handoff

**Phase:** 1 complete. Phase-2 readiness review done — the three open product decisions are
resolved (D-008–D-010) and the docs are current; phase 2 (the product core) is not started,
awaiting the owner's go.

**Done this session:** cross-checked the docs against the repository (worker/dashboard layout,
migrations, workflows, release script, workspace scripts) and fixed two inconsistencies — the
phase tracker listed phase 1 "in progress" while the handoff said complete, and the
`npm run typecheck` row in `docs/development.md` was a broken markdown table. Resolved the open
questions from `docs/product.md`: D-008 — deploy-time `SETUP_CODE` claim protection; D-009 —
inline comment caps (10 per reviewer, 25 per run); D-010 — diff budget (200 KB per reviewer,
32 KB per file). Added `SETUP_CODE` to `product/.dev.vars.example` and to the deploy procedure
in the `ship-release` skill, and refreshed this handoff.

**Verified:** docs diff reviewed against the repository state; Prettier clean on every edited
file; `npm run check` exits 0.

**Blocked by:** nothing. Phase-2 implementation starts after `docs/design.md` is written and
reviewed (docs-first), and on the owner's go.

**Next action:** on the owner's go, write `docs/design.md` — D1 schema (reviewers, provider
bindings, repositories, runs, sessions), API surface, setup wizard/OAuth flow, Durable Object
state machine, consolidation format, dashboard screens — then implement the end-to-end review
loop.

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
