# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope                                                                                                 | Status      |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001                | completed   |
| 1     | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | completed   |
| 2     | Product: the core workflow, end to end                                                                | completed   |
| 3     | Promo site: the site that explains it and sends people to it                                          | not started |
| 4     | Launch: first release tagged, site deployed                                                           | not started |

No phase is `in progress` right now: phase 2 landed in full on 2026-10-17 and phase 3 starts after
the improvement slices in `docs/roadmap.md` (D-017). The remaining improvement slices 7–11 plus
roadmap item 8 are in progress in one pull request against `dev` (D-019); they are product work,
not a phase.

## Current handoff

**Phase:** 2 complete. The whole slice stack is merged to `dev`, in order: #9 → #10 → #11 → #12 →
#13 → #14, each retargeted to `dev` and merged with a merge commit to match the repository's
history. The tracker refresh (#15) merged to `dev` on 2026-10-17 (`8221de5`).

**In progress:** the improvement slate's remaining slices — 7, 8, 9, 10, 11 and item 8 — in one
pull request on `feat/jury-forge-roadmap-20261017`, branched from `dev` at `8221de5`, one docs
commit plus implementation commit(s) per slice (D-019).

**Landed so far (this branch):** slice 7 — docs `a8f3ba2`, implementation `6ce1fc3` (D-020);
slice 8 — docs `9e0cf01`, implementation `e616c31` (D-021); slice 9 — docs `75be673`,
implementation `cde7fd7` (D-022); slice 10 — docs `71ce2c8`, implementation `4587919` (D-023).

**Done this session:** merged the outstanding stack —

- #9 slice 2b, the setup wizard UI → `c47f87f2`
- #10 slice 3, reviewers and providers → `a86514ea`
- #11 slice 4, webhook intake and the run engine → `7738aa97`
- #12 slice 5, the dashboard → `7dc66aec`
- #13 the improvement slate and roadmap (D-017) → `17ab3e40`
- #14 slice 6, run hygiene (D-018) → `5c8f71ce` — the current `dev` tip

**Verified:** `npm ci` exit 0 and `npm run check` exit 0 on the checkout of record (`fc6d9278`,
the reviewed tip) — typecheck, lint, Prettier, 105/105 tests across 14 files, both builds (Worker

- dashboard, and the Astro site), with a clean tree afterwards. The merged content is the verified
  content: `dev`'s tip tree is `4c85a7b67ad5895d623f6dd65f0a8914bb13c40f`, byte-identical to
  `fc6d9278`'s tree. CI `check` was green on every PR head, and both the branch checkouts and the
  `dev` tip were fast-forwarded on the Mac checkout.

**Blocked by:** nothing.

**Next action:** slice 7 (resolution tracking + the output-contract v2), unless the rework the
owner has asked for supersedes the roadmap — that direction is not decided yet.

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
