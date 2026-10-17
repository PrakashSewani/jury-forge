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
roadmap item 8 landed on `dev` in one pull request (D-019, #16, merged 2026-10-17 as `f277f1e4`); it
was product work, not a phase.

## Current handoff

**Phase:** 2 complete. The whole slice stack is merged to `dev`, in order: #9 → #10 → #11 → #12 →
#13 → #14, each retargeted to `dev` and merged with a merge commit to match the repository's
history. The tracker refresh (#15) merged to `dev` on 2026-10-17 (`8221de5`).

**Merged:** the improvement slate's remaining slices — 7, 8, 9, 10, 11 and roadmap item 8 — landed
in one pull request against `dev` (D-019, #16, merged 2026-10-17 as `f277f1e4`), on
`feat/jury-forge-roadmap-20261017`, branched from `8221de5`. One docs commit plus one implementation
commit per slice, each with `npm run check` green:

- slice 7 — resolution tracking + output contract v2 → docs `a8f3ba2`, implementation `6ce1fc3`
  (D-020)
- slice 8 — instance settings + optional blocking mode → docs `9e0cf01`, implementation `e616c31`
  (D-021)
- slice 9 — repository instructions, opt-in → docs `75be673`, implementation `cde7fd7` (D-022)
- slice 10 — credential key rotation + audit trail → docs `71ce2c8`, implementation `4587919`
  (D-023)
- roadmap item 8 — seven-day session TTL → docs `3c21484`, implementation `96678ce` (D-024)
- slice 11 — guided deploy + reviewer import/export → docs `0d0aba9`, implementation `15cb31f`
  (D-025)

**Verified:** `npm run check` exit 0 on the branch tip (`15cb31f`) — typecheck (three `tsc`
programs in `product/`, `shared/`, and `astro check` in `site/`), ESLint, Prettier `format:check`,
**170/170 tests across 17 files** and both builds (Worker + dashboard, and the Astro site), with a
clean tree afterwards. The command was run on the Mac checkout of record
(`~/Projects/jury-forge`) after each slice's implementation commit and once more at this tip.
`node --check scripts/deploy-guided.mjs` and `node scripts/deploy-guided.mjs --dry-run` exit 0;
that script is deliberately not exercised against a real Cloudflare account here — no part of this
change deploys anything.

**Rework (2026-10-17):** the post-phase-2 rework is four stacked slices. Slice A is committed,
pushed and open against `dev` as **#17** on `feat/rework-a-design-system-20261017` (`6201eda` docs,
`0d379c3` implementation), in review; slice B's branch is `feat/rework-b-shell-screens-20261017`.

| Slice | Branch                                 | Status                  |
| ----- | -------------------------------------- | ----------------------- |
| A     | `feat/rework-a-design-system-20261017` | in review (#17)         |
| B     | `feat/rework-b-shell-screens-20261017` | in progress, on A's tip |
| C     | —                                      | not started             |
| D     | —                                      | not started             |

Slice A is the design-system vocabulary and UI harness (D-026): a token layer in
`product/src/styles.css`, the `product/src/ui/` primitives re-exported through
`product/src/components.tsx`, a dependency-free `product/src/lib/theme.ts` (no runtime caller yet —
the toggle is slice B), and a second happy-dom vitest project with 59 UI tests. Strict visual
no-op: no page, worker, shared, or site source changed. Scopes for B/C/D are in
`docs/roadmap.md`; the rework is product work, not a phase, so phase 3 stays `not started`.

**Verified:** `npm run check` exit 0 — workerd 170/170 · UI 54/54.

**Blocked by:** nothing.

**Next action:** open slice A's PR against `dev` (`feat/rework-a-design-system-20261017`).

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
