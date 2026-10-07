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

**Phase:** 2 in progress — slice 3 (reviewers and providers) is in review on
`phase-2/3-reviewers-providers` (#10), stacked on slice 2b (`phase-2/2b-wizard-ui`, #9); slice
2a (#8) is merged to `dev`.

**Done this session:** built slice 3 — reviewer CRUD API (`/api/reviewers`, session-gated,
Zod-validated; API keys write-only, encrypted at rest, `apiKey: null` clears); the two provider
adapters (OpenAI- and Anthropic-compatible request shapes, default Anthropic `max_tokens` 4096,
120 s timeout, tolerant JSON extraction); the context builder (D-010 budget of 200 KB / 32 KB
per file / 4 KB description, lockfile/generated/binary skips, truncation notes, prompt
assembly); and consolidation (findings validation and normalization, commentable-line selection
from patch hunks, D-009 caps of 10 per reviewer / 25 per run with overflow routed to the
summary). New test suites for the API and all three modules.

**Verified:** `npm run check` exits 0 — typecheck, lint, Prettier, 77/77 tests across 11 files,
both builds.

**Blocked by:** nothing. Slice 4 (webhook intake and the run engine) stacks on
`phase-2/3-reviewers-providers` once this merges.

**Next action:** build slice 4 — the webhook receiver and the `RunEngine` Durable Object end to
end, then run history records.

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
