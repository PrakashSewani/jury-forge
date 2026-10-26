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
post-merge canary verification passed on each merged tree. Slice D merged to `dev` as **#20**
(`bd344c4`) on 2026-10-19, branched from `b93d2f04b1` with its plan recorded in D-029; sentry's
round-1 findings were answered in `635e74b`.

| Slice | Branch                                 | Status                               |
| ----- | -------------------------------------- | ------------------------------------ |
| A     | `feat/rework-a-design-system-20261017` | merged to `dev` (`77541fbb`) (#17)   |
| B     | `feat/rework-b-shell-screens-20261017` | merged to `dev` (`c48e825e1b`) (#18) |
| C     | `feat/rework-c-product-shape-20261017` | merged to `dev` (`b93d2f04b1`) (#19) |
| D     | `feat/rework-d-architecture-20261017`  | merged to `dev` (`bd344c4`) (#20)    |

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

**Round 1 of the review debate (PR #20, sentry, merge confidence 45%) — answered in `635e74b` plus
this tracker commit: 7 findings, 6 resolved / 1 rejected**, one reply per comment thread on the PR. (1)
The editor's unsaved-changes guard was dead for in-app navigation — `beforeunload` never fires for a
`pushState` route change — so `router.ts` gained `registerNavigationBlocker()`: `navigate()` consults
every blocker before it writes the entry (and returns `false` when vetoed) and the router's own
`popstate` handler asks first too, putting the entry back and notifying nobody when refused; the
editor registers one while its form is dirty (its `beforeunload` handler stays for a real unload). (2)
`POST /api/reviewers` and `PATCH /api/reviewers/:id` were validating their response as
`ReviewerSchema.nullable()` while the dashboard parses a non-null reviewer: both now answer
`errorResponse('internal_error', 500)` when the row does not read back and validate `ReviewerSchema`.
(3) The new `test-ui/router.test.tsx` rendered the shell without stubbing `localStorage`, so all six of
its tests died on Node ≥26 — it now takes `memoryStorage()` like `shell.test.tsx` and
`theme.test.tsx`. (4) The runs list's 5s tick replaced the whole list with page 1 and refetched
repositories; it now refreshes the first page in place, leaving the "Load more" tail, the cursor and
the repository map alone (repositories are fetched at mount and on an explicit retry only). (5) The
one finding **rejected**: parsing is deliberately off in a production build (D-029, `architecture.md`)
— the dashboard still validates every response, the parse is on in dev and test where drift must fail
a test, and flipping it on the hot path is a plan-level cost decision, not a review fix. (6) `focus`
and `visibilitychange` both fire when the tab comes back; the revalidate path now skips a load that is
already in flight (the effect's own load is never skipped, so a new fetcher still fetches). (7) The
setup screen's install link points at an absolute GitHub URL, which `handleAppLink` can never
intercept, so the dead handler is gone.

Numbers after the round: workerd **292/292** (23 files, +3 in the new `test/reviewers-missing-row.test.ts`
— a create and an update whose row does not read back, driven through a D1 wrapper that stops
answering that read, plus the 201 body parsing as the dashboard's `ReviewerSchema`) and UI
**141/141** (12 files, +5: three in `router.test.tsx` for the veto itself, the declined-then-accepted
in-app click and the vetoed back button, one in `use-resource.test.tsx` for the double-event
revalidate, one in `polling.test.tsx` for the tick that keeps the loaded page and the cursor). Each of
the five new cases was mutation-checked: reverting the fix it covers makes exactly that case fail.

**Verified at `635e74b` on this VPS (Node 26.7.0, `npm run check` **exit 0**):** prettier clean ·
ESLint clean · typecheck (three `tsc` programs + `astro check`, 0 errors) · workerd **292/292** (23
files) · UI **141/141** (12 files) · worker + client + site builds, nothing skipped. That is the CI
Node's suite plus the Node ≥26 storage bug the round found, which the pinned Node 24 cannot see.

**Onboarding UX (2026-10-19), on `feat/onboarding-ux-20261019` (base `bd344c4`): docs `436d5da`,
implementation `6af6094`, plus this tracker commit.** Five parts in one pull request against `dev`,
with no migration, no new dependency and no engine change:

1. `setup_url` — `manifestFor()` in `product/worker/routes/setup.ts` posts
   `setup_url: ${origin}/setup`, and `AppManifestSchema` in `shared/src/schemas/setup.ts` requires it,
   so GitHub returns the operator to the step with the "verify" button after an install instead of
   leaving them on its own app page. It applies to Apps created after it is in the manifest; patching
   a live App is an operator action outside this repository.
2. `product/src/ui/ExternalLink.tsx` — `target="_blank"` and `rel="noopener noreferrer"`, neither
   overridable by a caller, with the shared focus ring and 44 px target. The wizard's
   "Install … on GitHub" link and the run detail's "View on GitHub" link use it; the OAuth sign-in
   anchor and the manifest form POST stay same-tab, because GitHub answers both with a redirect into
   the instance.
3. The create screen presents **Blank reviewer** and **Start from a template** as two explicit radio
   choices, with all seven starters unchanged, the picker shown only once a template is asked for, and
   nothing prefilled until one is picked (was: a `<select>` defaulted to blank inside a card titled
   "Start from a template", which read as if a template were required).
4. Reuse a stored model key — `POST` and `PATCH /api/reviewers` accept an optional
   `apiKeyFromReviewerId` and copy that row's `api_key_enc` verbatim: never decrypted, never read as
   plaintext, and the response shape is unchanged. A missing or keyless source answers
   `invalid_request` 400, both fields together answer the same 400, and an unset `ENCRYPTION_KEY`
   still answers `encryption_key_unset` 500. The editor's key section offers _Reuse the key stored
   on …_ beside pasting a key, listing only reviewers that hold one, rendering no value and sending
   only the id.
5. `docs/design.md` records the manifest's `setup_url`, the new-tab rule and the reuse contract, and
   its key paragraph's literal that had been mangled to an asterisk placeholder since `a8f3ba2` reads
   correctly again.

**Verified on the Mac checkout of record (`~/Projects/jury-forge`) at `6af6094`:** `npm run check`
**exit 0** — typecheck (three `tsc` programs plus `astro check`, 0 errors), ESLint, Prettier
`format:check`, workerd **298/298** (24 files) · UI **151/151** (14 files), both builds, clean tree
afterwards. The suite it replaces on `dev` is 292/292 (23 files) and 141/141 (12 files): the new
cases are six in `product/test/reviewers-key-reuse.test.ts` (verbatim copy on create and on update,
unknown source, keyless source, both fields together, `ENCRYPTION_KEY` unset), four in
`product/test-ui/external-links.test.tsx` (the primitive, the install link, the sign-in anchor that
must stay same-tab, the run's review link) and five in
`product/test-ui/reviewer-key-reuse.test.tsx`; `try-run.test.tsx`'s four picker tests became five
for the two-choice UI, and `setup-flow.test.ts`, `contracts.test.ts` and `wizard.test.ts` carry the
manifest assertion and `setup_url` fixtures. No raw palette utility class in the new UI (grepped:
none), and the 44 px targets and focus rings come from `tapTarget` / `focusRing` as everywhere else.

**Round 1 of the review debate (PR #21, sentry, merge confidence 55%) — answered in `bd26c9f` plus
this tracker commit: 4 findings, 4 resolved / 0 rejected**, one reply per comment thread on the PR;
all four were minor/nit and none asked for a design change. (1) Choosing **Blank reviewer** after
previewing a template left the template's name, instructions and rules in the fields while the card
promised "start from a blank reviewer and fill in everything yourself": the editor now keeps what
those three fields held before the first template was applied and restores it, with the "Applied the
… template" notice cleared and the picker back on its placeholder — a template is a preview, not a
lock-in. (2) The reuse picker labelled each option with `source.name` alone while `reviewers.name`
has no unique constraint: an option now reads _name — model_, and only a name that two sources share
also carries its short id (8 characters), so the operator can tell which stored key they are about
to copy. (3) A reuse still answers `encryption_key_unset` 500 on an instance with no
`ENCRYPTION_KEY` although it copies ciphertext verbatim: that refusal is now documented at the
create guard as deliberate symmetry with the paste path, keeping the contract
`product/test/reviewers-key-reuse.test.ts` pins instead of weakening it for one branch. (4) The edit
screen's reuse save had no UI case; `reviewer-key-reuse.test.tsx` now asserts that `updateReviewer`
receives `apiKeyFromReviewerId` and no key value.

Numbers after the round: workerd **298/298** (24 files, unchanged — the route edit is a comment) and
UI **154/154** (14 files, +3: the duplicate-name picker, the edit-screen reuse save, and the
blank-after-template reset, the last of them in `try-run.test.tsx`).

**Verified at `bd26c9f` on the Mac checkout of record (Node 24.21.0, `npm run check` **exit 0**):**
typecheck (three `tsc` programs plus `astro check`, 0 errors) · ESLint clean · Prettier
`format:check` clean · workerd **298/298** (24 files) · UI **154/154** (14 files) · worker, client
and site builds, nothing skipped.

**Blocked by:** nothing.

**Next action:** sentry re-reviews the answered head of `feat/onboarding-ux-20261019` against `dev`
(round 2, threshold 60); Prakash merges on its verdict. The rework plan in `docs/roadmap.md` is
complete, and phase 3 (the promo site) starts after this item lands.

**Repository search (2026-10-19):** `GET /api/repositories` takes an optional `q` and narrows the
list to the rows whose `full_name` contains it — trimmed, matched case-insensitively, with `LIKE`'s
`%` and `_` escaped first so a literal `_` in a name is not a wildcard and a literal `%` matches
rather than everything — and the Repositories screen carries a labelled `<input type="search">`
(300 ms debounce) whose applied term is written back into the URL in place, with an empty state and
a way back when nothing matches. `refresh=1` and the enable/reviewer toggles are unchanged, and a
refresh still imports the whole installation while returning only the matching rows. One PR against
`dev` from `feat/repo-search-20261019`, branched from `dev` at `696189b`; no new dependency, no
schema change, no migration, nothing deployed.

**Verified on the Mac checkout of record (`npm run check` exit 0):** typecheck (three `tsc`
programs plus `astro check`, 0 errors) · ESLint clean · Prettier `format:check` clean · workerd
**302/302** (24 files) · UI **160/160** (14 files) · worker, client and site builds, nothing
skipped. Measured against `dev`'s own test code, that is +4 worker and +6 UI cases: 5 → 9 in
`product/test/repositories.test.ts`, 33 → 39 in `product/test-ui/screens.test.tsx`.

**Next action:** sentry reviews `feat/repo-search-20261019` against `dev` (round 1, threshold 60),
and Prakash merges on its verdict — the merge to `dev` is the deployment (D-030), not this branch.

**Reviewer scope (2026-10-25, D-031):** a reviewer↔repository pair can now carry path filters and a
bounded reference-folder list. `reviewer_repositories` gained `paths_include`, `paths_exclude` and
`context_paths` (JSON arrays, migration `0007_reviewer_scope.sql`); the automatic run filters each
reviewer to the changed files its globs keep, drops a reviewer that keeps none (`skipped` when all
drop), and builds that reviewer's own budgeted diff from the full patch list. A reviewer with
reference paths gets the repository tree listed once, the matching files fetched in batches of
eight at the head SHA, and a read-only block in its prompt; findings outside the diff land in the
summary with `file:line` (inline comments stay diff-only). Three instance settings bound it —
`referenceContextFiles` (default 50), `referenceContextFileBytes` (32,000) and
`referenceContextTotalBytes` (100,000) — exposed on the Settings screen. The Repositories screen's
expanded reviewer rows carry the three comma-separated pattern fields. Manual try runs ignore path
filters (D-028) but keep their reference context. No new dependency.

**Verified on `feat/reviewer-scope-20261025` with `npm run check` exit 0:** typecheck
(three `tsc` programs plus `astro check`, 0 errors) · ESLint clean · Prettier `format:check` clean ·
workerd **323/323** (25 files) · UI **161/161** (14 files) · worker, client and site builds, nothing
skipped. That is +21 worker cases (11 in the new `product/test/scope.test.ts`, 5 in
`context.test.ts`, 2 in `repositories.test.ts`, 3 in `run-engine.test.ts`) and +1 UI case in
`screens.test.tsx`. This Windows shell exports `NODE_ENV=production`, which makes React load its
production build and breaks every UI test on `act`; the suite was therefore run with
`NODE_ENV=test`, which is what vitest sets on CI. The migration applies automatically on the next
merge to `dev` (D-030), before the Worker deploys.

**Scope follow-up (2026-10-25, D-032):** seven changes on top of D-031. Consolidation now
**enforces** scope — a finding outside a reviewer's filtered files is demoted to the summary even
when its diff line is commentable. Runs record their scope: migration `0008_scope_record.sql` adds
`runs.files_json`, `runs.scope_skip_json` and `run_reviewers.scope_json`; run detail returns
`changedFiles`, `skippedReviewers` and each reviewer's `scope`, and the screen shows them. The
Repositories screen has a **Preview scope** action backed by
`POST /api/repositories/:repoId/scope-preview`, which matches patterns against the newest run's
changed files without touching GitHub. Reference trees are read per literal context root
(`git/trees/{sha}:{root}`) instead of one whole-repo listing, the per-run file cap is shared fairly
across reviewers, and patterns are stored exactly as typed (`docs/` no longer becomes `docs/**`).

**Verified on `feat/reviewer-scope-20261025` with `npm run check` exit 0:** typecheck
(three `tsc` programs plus `astro check`, 0 errors) · ESLint clean · Prettier `format:check` clean ·
workerd **326/326** (25 files) · UI **163/163** (14 files) · worker, client and site builds, nothing
skipped. That is +3 worker cases over the D-031 numbers (context-root derivation, consolidation's
out-of-scope demotion, the preview endpoint) and +2 UI cases (run detail's scope record, the
Repositories preview action). Run with `NODE_ENV=test` for the same Windows-shell reason as above.
Migration `0008` applies automatically on the next merge to `dev`, after `0007`.

**UI rework (2026-10-25), on `feat/ui-rework-20261025`, D-033.** The dashboard on a dark-first
forge theme with an ember accent (dark is the default; light and system stay one toggle away). The
install state is a status pill with the app slug. Runs gets search and URL-backed filters; the
Cmd/Ctrl+K command palette, toasts, and run-detail grouping by file with per-finding copy all ship.
Components: Radix (dialog, switch, tabs) and cmdk, sonner, lucide-react; no web font, no
dependency beyond the four approved runtime packages. The UI is verified against the accessibility
harness: 112 cells, 0 failing (`docs/rework/layout-ui-rework.json`).

**Verified on `feat/ui-rework-20261025` with `npm run check` exit 0:** typecheck (three `tsc`
programs plus `astro check`, 0 errors) · ESLint clean · Prettier `format:check` clean · workerd
**326/326** (25 files) · UI **178/178** (16 files) · worker, client and site builds, nothing skipped.
Run with `NODE_ENV=test` (this Windows shell exports `NODE_ENV=production`, which breaks React's test
build). The client bundle is about 763 kB (218 kB gzip): Vite warns on size and the chunks are not
split. The dev-seed and layout-harness scripts now spawn `npx` without a shell on Windows.

**Knowledge packs (2026-10-26), on `feat/knowledge-packs-20261026`, D-034.** Implemented: migration
`0009` (`packs`, `pack_versions`, `pack_files`, `pack_grants`, `runs.knowledge_json`,
`run_reviewers.knowledge_json`); the shared encodings; the server-side `SKILL.md`/root-Markdown
analyzer, SHA-256 versions, slug/`forceNew`, preview/create/version/grants routes and activity
rows; browser folder/zip extraction with the in-repo zip reader and the `yaml` product dependency;
the run-engine `knowledge` step, per-reviewer budgeted block in `prepare`, and per-run/per-reviewer
provenance; the Packs list/detail/upload/grant screens, nav entry, settings fields, reviewer-editor
card and run-detail Knowledge card; the sample pack in `npm run dev:seed`; and the 10-route layout
harness.

**Verified on `feat/knowledge-packs-20261026` with `NODE_ENV=test npm run check` exit 0:** typecheck
(three `tsc` programs plus `astro check`, 0 errors) · ESLint clean · Prettier `format:check` clean ·
workerd **386/386** (27 files) · UI **197/197** (18 files) · worker, client and site builds, nothing
skipped. Run with `NODE_ENV=test` because this Windows shell exports `NODE_ENV=production`.

**Also verified:** `npm run dev:seed` exit 0 — local D1 now holds 12 runs, 22 run-reviewer rows, 3
reviewers, 2 repositories, 1 pack, 2 pack versions, 6 pack files, 3 pack grants and 8 activity rows
(migration `0009` applied locally). `node scripts/measure-layout.mjs --label knowledge --browser
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --out docs/rework/knowledge.json
--sheet docs/rework/knowledge.md --assert` exit 0 — **140 cells, 0 failing** (overflow 0,
tapTargets 0, contrast 0, focus 0, mobileNav 0), 70.1 s; the sheet is `docs/rework/knowledge.md`.
Nothing is deployed from this branch; the merge to `dev` deploys and applies `0009` (D-030).

**Blocked by:** nothing.

**Next action:** the owner reviews `feat/knowledge-packs-20261026` and merges it; the merge is the
deployment (D-030) and applies migration `0009`.

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

## Hosting (2026-10-19)

The product is live at `https://jury.prakashsewani.com` — a Worker custom domain on the Worker
`jury-forge`, backed by its own D1 database (`7eeae477-07f6-41e0-89f8-e891eba8979d`, migrations
`0001`–`0006` applied remotely) and two secrets (`ENCRYPTION_KEY`, `SETUP_CODE`). Cloudflare Access
allows the owner's email only, with one path-scoped application that bypasses
`/api/webhooks/github`. A merge to `dev` now deploys (D-030) and `main` no longer exists.

The instance is claimed (`2026-10-19`), its GitHub App `jury-forge` is installed on the owner's
account with 47 repositories synced, and no reviewer exists yet — the first review on the deployed
instance has not run.
