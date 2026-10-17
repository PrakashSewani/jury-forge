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

**Rework (2026-10-17):** the post-phase-2 rework is four stacked slices. Slice A merged to `dev` as
**#17** (`77541fbb`; reviewed head `33b0a50`) on `feat/rework-a-design-system-20261017`; slice B
merged to `dev` as **#18** (`c48e825e1b`), and post-merge canary verification passed on the merged
tree. Slice C is in progress on `feat/rework-c-product-shape-20261017` — its plan is recorded in
D-028 and `docs/design.md`, and implementation has not started. Slice D is not started.

| Slice | Branch                                 | Status                               |
| ----- | -------------------------------------- | ------------------------------------ |
| A     | `feat/rework-a-design-system-20261017` | merged to `dev` (`77541fbb`) (#17)   |
| B     | `feat/rework-b-shell-screens-20261017` | merged to `dev` (`c48e825e1b`) (#18) |
| C     | `feat/rework-c-product-shape-20261017` | in progress                          |
| D     | —                                      | not started                          |

Slice A is the design-system vocabulary and UI harness (D-026): a token layer in
`product/src/styles.css`, the `product/src/ui/` primitives, a dependency-free
`product/src/lib/theme.ts` (the theme toggle that calls it is slice B), and a second happy-dom
vitest project with 95 UI tests. Strict visual no-op: no page, worker, shared, or site source
changed. Scopes for B/C/D are in
`docs/roadmap.md`; the rework is product work, not a phase, so phase 3 stays `not started`.

**Slice A:** merged to `dev` as PR #17 (`6201eda` docs, `0d379c3` implementation, `82fb6b8` and
`33b0a50` review rounds; CI `check` success). **Slice B run 1 (2026-10-17):** landed
`scripts/measure-layout.mjs`, a dependency-free
Chrome DevTools Protocol layout harness, and captured the pre-change baseline under `docs/rework/`
(`README.md`, `baseline.json`, `baseline.md`; the 32 baseline PNGs are regenerable and gitignored). The harness measures
the eight dashboard screens at seven widths (320–1440) in light and dark for horizontal overflow,
mobile tap targets, contrast, focus indicators and the 390 px nav. The baseline measures `dev`'s app
source at `77541fb`, the merge this branch was later rebased onto — no page, worker, `shared/`,
`site/` or slice B source changed.
It fails as expected: no mobile nav, all mobile widths overflow, tap targets under 44 px, and the
`text-neutral-400` footer/log-out text is ~2.5:1. The numbers are in `docs/rework/baseline.md`.

**Slice B run 2 (2026-10-17):** landed the shell and the measured accessibility retune. New
`product/src/shell/` (`Shell`, `Nav`, `ThemeToggle`, `UserMenu`, `RouteGuard`, barrel `index.ts`) —
sidebar at `lg`, top bar plus slide-over below, `max-w-7xl` grid with `min-w-0`, the instance
status chip and active-route state. Dark mode is actually wired: `main.tsx` applies the resolved
preference at boot and `ThemeToggle` cycles light → dark → system under `jf:theme`. The whole text
ladder was retuned so all four levels clear AA in both themes — light body neutral-700 / muted
neutral-600 / subtle neutral-500, dark body neutral-200 / muted neutral-300 / subtle neutral-400,
with the measured ratios in D-027 — the primitives gained `focus-visible` outlines and 44 px
targets, and `Loading`/`LoadFailed` moved to theme-flipping tokens. `scripts/measure-layout.mjs` got
two methodological fixes — keyboard (`Tab`) focus instead of scripted `.focus()`, and the WCAG 2.5.5
inline-link tap-target exemption — and the baseline was **re-captured** with the amended harness, on
`dev`'s source at `77541fb`, so before/after share one rule and one base.
`docs/rework/shell.md` is the after-shell run (`shell.json` was dropped at PR time as the redundant
intermediate sheet — `docs/rework/README.md` says why). At that point the eight screens were untouched:
overflow remained only on the `/reviewers` toolbar at 320–360 px and contrast still failed on the
dark theme, both deferred to run 3.

**Slice B run 3 (2026-10-17):** rebuilt all eight screens in `product/src/pages/` on
`product/src/ui/`. Overview leads with the instance state and a derived next action plus recent runs;
Reviewers is a table with inline enable/disable; the reviewer editor is a sectioned form with
per-field validation, a sticky save bar, a `beforeunload` guard and the key shown only as set or
replace; Repositories expands per-repo reviewer toggles inside the row; Runs filters by status and
repository with relative times; Run detail groups findings per reviewer with a severity filter and a
usage strip; Settings groups the advanced numbers with their defaults and a per-field reset; Activity
filters the trail by actor and action. Every screen has loading, empty, error and data states, and two
new screen-local modules carry the shared loading/error blocks (`pages/screen-state.tsx`) and human
error copy (`pages/messages.ts`) — no screen prints a machine code at the user any more. No raw
palette utility and no timer remain anywhere in `product/src/`: live run updates are slice D.

**Verified:** `npm run check` exit 0 — workerd **170/170** (17 files) · UI **95/95** (6 files) · both
builds · harness exit 0 with `--assert`: **112 cells measured, 0 failing** (overflow 0, tapTargets 0,
contrast 0, focus 0, mobileNav 0) across 8 routes × 7 widths × 2 themes, browser and dev server both
reaped. Numbers: `docs/rework/final.json` / `final.md`, deltas against `docs/rework/baseline.json`.

**Blocked by:** nothing.

**Next action:** slice C's pull request (readiness, reviewer templates, reviewer↔repo visibility,
try-a-reviewer — D-028) is next; then slice D (validated contracts, error taxonomy, client routing,
run polling) from the rework plan in `docs/roadmap.md`.

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
