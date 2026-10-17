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
merged to `dev` as **#18** (`c48e825e1b`); slice C merged to `dev` as **#19** (`b93d2f04b1`), and
post-merge canary verification passed on each merged tree. Slice D is complete on
`feat/rework-d-architecture-20261017` (branched from `b93d2f04b1`, plan recorded in D-029) and is
open for review against `dev`.

| Slice | Branch                                 | Status                               |
| ----- | -------------------------------------- | ------------------------------------ |
| A     | `feat/rework-a-design-system-20261017` | merged to `dev` (`77541fbb`) (#17)   |
| B     | `feat/rework-b-shell-screens-20261017` | merged to `dev` (`c48e825e1b`) (#18) |
| C     | `feat/rework-c-product-shape-20261017` | merged to `dev` (`b93d2f04b1`) (#19) |
| D     | `feat/rework-d-architecture-20261017`  | complete, in review against `dev`    |

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

**Slice B verified (merged `c48e825e1b`):** `npm run check` exit 0 — workerd **170/170** (17 files) ·
UI **95/95** (6 files) · both builds · harness exit 0 with `--assert`: **112 cells measured, 0
failing** (overflow 0, tapTargets 0, contrast 0, focus 0, mobileNav 0) across 8 routes × 7 widths × 2
themes. Numbers: `docs/rework/final.json` / `final.md`, deltas against `docs/rework/baseline.json`.

**Slice C (2026-10-17), merged to `dev` as #19 (`b93d2f04b1`) from
`feat/rework-c-product-shape-20261017` (base `c48e825e1b`), D-028.** Nine commits: docs `b178a30`;
shared `4d43daf` (the seven reviewer templates in
`shared/src/templates.ts` plus the slice's contracts — `InstanceReadiness`, `RepositoryPullRequest`,
`TryRunRequest`/`TryRunResponse`, `RunMode`, `Reviewer.repositories`, `RunSummary.mode`); worker
`b4fdb58` (readiness derived from D1 in `product/worker/lib/readiness.ts` behind
`GET /api/instance/readiness`; `Reviewer.repositories` computed in one query) and `b12cebf` (migration
`0006_run_mode.sql`, `POST /api/runs/try`, `GET /api/repositories/:repoId/pulls`, the Durable Object's
manual mode); dashboard `0baf98f` and `da82c2e` (the Overview leads with the computed readiness and
its single next step; the reviewers list renders the API's `repositories` instead of one request per
repository; the reviewer editor's template picker; the "Try a reviewer" dialog; run detail states that
a manual run was not posted to GitHub). The seventh — `4b40665` `fix: answer sentry's round-1
findings on #19 (slice C, D-028)` — answers all four round-1 findings (see the round-1 note below);
the last two (`57c12f3`, `2b93aea`) are the tracker updates this file received while the review was
open, which is why the branch carries nine commits and not seven.

C-1 readiness is computed per request from D1 — no stored checklist — as five steps (claim, install
the app, enable a repository, add a reviewer with a model key, see the first run) with the raw counts
and a single `nextStep`. C-2 ships the seven built-in starter templates
(Security, Architecture, Backend, Frontend, Performance, Testing, Documentation) as client-side
prefill only: no API, no table. C-3 puts each reviewer's enabled repositories on the reviewer record.
C-4 adds manual try runs: the only schema change in the slice (`runs.mode`, additive, `NOT NULL`,
default `'auto'`), the same step machine as an automatic run, skipping the repository-enabled gate and
the D-018 supersession skip, running exactly the named reviewers, and stopping before the `post` step
so nothing is published to GitHub.

**Verified on the Mac checkout of record (`~/Projects/jury-forge`) at `4b40665`:** `npm run check`
**exit 0** — typecheck (three `tsc` programs plus `astro check`), ESLint, Prettier `format:check`,
workerd **198/198** (19 files) · UI **119/119** (8 files) · both builds, clean tree afterwards.
`npm run dev:seed` exit 0; `node scripts/measure-layout.mjs --label slice-c-round1 --assert` **exit 0** —
**112 cells, 0 failing** (overflow 0, tapTargets 0, contrast 0, focus 0, mobileNav 0), 50.7 s, browser
and dev server both reaped. That grid is numerically identical to the committed
`docs/rework/final.json` on a tree that now carries slice C's new UI (the runs list's manual badge
included), so its own JSON was not committed — same reasoning as `docs/rework/README.md`'s note on
the redundant intermediate sheet; it is reproducible with the command in that README. No raw
Tailwind palette utility class appears anywhere in `product/src` or `product/test-ui` (grep over
`.ts`/`.tsx`: no matches).

**Round 1 of the review debate (PR #19, sentry, merge confidence 58%) — answered in `4b40665`:
4 findings, 4 resolved / 0 rejected**, one reply per comment thread on the PR. (1) The D-020
previous-findings query now requires `r.mode = 'auto'`, so a manual trial cannot reach a later
automatic run's prompt or its posted review — the PR body's "nothing about an automatic run's
behaviour or output changed" now holds literally. (2) The try endpoint refuses a pull request
GitHub reports closed or merged with the same `not_found` a missing one gets, so the API is not
laxer than the picker. (3) `firstRunAt` keeps D-028's definition (a trial is a real run, so the
fifth step is honestly done) and the Overview's closing copy now invites the next action instead
of claiming every repository and pull request is being reviewed. (4) A `manual` badge in the runs
list, where the history is scanned. Each carries a new test — run-engine **+1**, runs-try **+1**,
readiness **+1**, screens **+1** — and each was mutation-checked: reverting its fix fails that
test (the automatic run's prompt then contains "Previously reported findings"; the closed-PR
request answers 202 instead of 404; the old title trips the copy assertions; dropping the badge
loses the row mark).

**Slice D (2026-10-17), on `feat/rework-d-architecture-20261017` (base `b93d2f04b1`), D-029.** The
boundary between the Worker and the dashboard, made real: `shared/src/schemas/*` (zod) is the single
source of the contract and every type in `shared/src/contracts.ts` derives from it with `z.infer`;
`shared/src/errors.ts` carries `API_ERROR_CODES`, the `ApiErrorCode` union and `message(code)`; the
Worker gained `product/worker/lib/respond.ts` and every dashboard-facing response in
`product/worker/**` now goes through `respond(schema, data)` or `errorResponse(code, status)`; the
dashboard's `request()` validates every response with the same schema instead of casting, and a
mismatch becomes `invalid_response` on the screen's error path rather than a broken render;
`product/src/lib/router.ts` gained `navigate()`/`subscribeRoute()`/`handleAppLink()` so a navigation
is `pushState` plus one screen fetch instead of a full page load (`App.tsx` reads the route through
`useSyncExternalStore`); `use-loadable.ts` became `use-resource.ts` (`useResource(schema, fetcher)` —
abortable, revalidating on refocus) and a new `use-poll.ts` (`usePoll`) keeps the runs list and the
run detail live while a run is `running`, stopping at a terminal status.

**Verified on the Mac checkout of record (`~/Projects/jury-forge`):** `npm run check` **exit 0** —
typecheck (three `tsc` programs plus `astro check`), ESLint, Prettier `format:check`, workerd
**289/289** (22 files) · UI **136/136** (12 files), both builds, nothing skipped. The new cases are
`respond.test.ts`, `errors.test.ts` and `contracts.test.ts` on the worker side (one drifted payload
per schema) and `router.test.tsx`, `polling.test.tsx`, `use-resource.test.tsx` and
`error-taxonomy.test.tsx` on the dashboard side. The same suite was re-run independently on this
VPS against a clean clone of the branch. Screen copy is unchanged: `product/src/pages/messages.ts` no
longer holds a map of its own, and the shared table carries exactly the sentences those screens
rendered before (checked code by code), with `lib/wizard.ts` keeping its setup-specific wording.

**Blocked by:** nothing.

**Next action:** slice D's pull request is open for review against `dev` (then Prakash merges); the
rework plan in `docs/roadmap.md` is then complete, and phase 3 (the promo site) starts after it.

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
