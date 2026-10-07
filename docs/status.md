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

**Phase:** 2 — all slices are built. Slice 5 (the dashboard) is in review on
`phase-2/5-dashboard` (#12), stacked on slice 4 (#11) → slice 3 (#10) → slice 2b (#9) → `dev`;
slices 1 and 2a are merged to `dev`.

**Done this session:** built slice 5 — the repositories API (list, `?refresh=1` sync from GitHub
with new repositories arriving disabled, enable/disable, per-repo reviewer toggles) and the
dashboard: the auth-aware shell (nav, instance state, sign-in gate), overview with recent runs,
the reviewers list and editor (create/edit/delete; write-only keys with replace and clear), the
repositories screen (enable toggles and per-repo reviewer checkboxes), the runs list (keyset
load-more, repo-name resolution), and the run detail (per-reviewer findings, GitHub review link).
The dependency-free router now serves all eight routes.

**Verified:** `npm run check` exits 0 — typecheck, lint, Prettier, 100/100 tests across 14 files,
both builds. End-to-end pass against the dev server in a browser: sign-in gate → home (recent
runs) → created a reviewer through the UI → enabled a repository → disabled a per-repo reviewer
toggle → runs list → run detail with findings, all against live local state.

**Blocked by:** nothing. Phase 2 is code-complete; every slice is in review.

**Next action:** review and merge the stack in order (#9 → #10 → #11 → #12 → #13 → #14,
retargeting each in turn). Slice 6 (run hygiene — superseded-run skip, review minimization,
priority file order; D-018) is in review on `phase-2/6-run-hygiene` (#14); slice 7 (resolution
tracking + output contract) is next, then phase 3 (the promo site).

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
