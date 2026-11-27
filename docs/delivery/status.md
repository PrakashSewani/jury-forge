# Status

Persistent project tracker and handoff. Update it as work lands, not retrospectively. Keep exactly
one phase `in progress` and exactly one next action.

## Phase tracker

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Product definition and documentation | **done — G0 passed 2026-11-16** |
| 1a | Technology and approach (decisions only, no code) | **done — accepted 2026-11-16** |
| 1b | Foundation and walking skeleton (MVP, gate G1) | **in progress — owner go 2026-11-27; M1.0** |
| 2 | Trust and security | not started |
| 3 | Review quality | not started |
| 4 | Operations and release | not started |
| 5 | v1 launch | not started |

## Current handoff

**Phase:** 1b, milestone **M1.0 (repository and CI)**. The owner said go on 2026-11-27. WP 1-01
to 1-05 are merged into `dev` (PR #5) with a green CI run; spikes 1-06 and 1-07 remain.

**Branch:** `docs/architecture-alignment` (documentation only: the architecture audit and its
fixes; stacked on `docs/deployment-ops-rewrite`, PR #8).

**Next action:** run **spike S-A (WP 1-06)**: graphile-worker serialization and debounce under
concurrency, plus the pg-boss adapter proof, written up in `docs/analysis/spikes/`. It needs a
container runtime (CI has one; this machine's Docker was not running). S-C (WP 1-07) follows and
needs the owner's Anthropic key or a local Ollama. Both spike notes close M1.0; then M1.1.

### Landed this session (2026-11-28, architecture audit and alignment)

The [architecture audit](../analysis/architecture-audit-2026-11-28.md) read every document in
`docs/architecture/` against technical-approach (ADR-0026) and the accepted ADRs. It recorded about
80 findings and fixed all of them except two decisions for the owner. No accepted ADR body was
changed.

- **Runtime:** a thin turn runner, not LangGraph (ADR-0010 as amended); the chair is code and the
  verifier is a non-voting call in every v1 review (ADR-0025 §4). This replaced "LangGraph
  recommended", "optional chair model call", and "optional verifier" in `overview`, `components`,
  `agentic-review`, `ai-pipeline`, and `extensibility`.
- **Queue:** [`job-pipeline.md`](../architecture/job-pipeline.md) was rebuilt on graphile-worker:
  the TA §3.3 jobs, per-session `queue_name`, `job_key` debounce, cron in `worker`, permanently
  failed jobs instead of a DLQ table, and the step list of TA §3.4.
- **Data model:** [`data-model.md`](../architecture/data-model.md) was rebuilt on the TA §17 tables
  with a tier per table (MVP, v1, v1.1, v1.2). The `runs`/`run_steps`/`jobs`/`outbox`/`agent_*` model
  is gone; RLS is not used in v1; retention is 30 days raw (Q-046). **TA §17 amended:**
  `reviewer_repo_bindings` (the MVP specs need it) and `model_probes` (ADR-0029) were added.
- **Security:** no RLS and no KMS in v1 (the KEK file); sessions idle 8 h / absolute 7 d; API tokens,
  OIDC, and the wider roles tiered v1.2; two closed open decisions marked closed.
- **Observability:** metrics and trace steps follow TA §3.12 and §3.4; `/readyz` no longer checks
  object storage.
- **Outside `docs/architecture/`:** G1 in `quality-gates.md` names the real containers;
  `roadmap.md`, `capabilities.md` (Helm, queue, artefact, and Compose rows), `principles.md`, the
  `repo-knowledge-graph` spec (no Redis, artefacts in Postgres), and "janitor" in two specs and
  `success.md` (wording only). `decisions/README.md` no longer says the stack ADRs "stay proposed".
- **New [ADR-0031](../decisions/ADR-0031-helm-chart-runtime-shape.md) (proposed):** the v1.2 Helm
  chart runs the Compose roles (`app`, `worker` with cron, a migration Job); no scheduler
  Deployment. It amends ADR-0022's component list only once accepted.

**Owner questions from the audit (§4 there):** Q-A is the finding severity scale (needed by M1.5;
ADR-0024 and ADR-0028 rely on `critical`, but no document lists the levels). Q-B is ADR-0031.
Q-D is three cron sweeps the specs need, missing from the TA §3.3 list. Q-E is the two-worker cron
test in M1.1. Q-F is the verifier's failure behaviour.

### Landed earlier this session (2026-11-28, deployment and operations rewrite)

[`deployment.md`](../architecture/deployment.md) and [`operations.md`](../architecture/operations.md)
were rewritten to match the accepted v1 stack ([`technical-approach.md`](../architecture/technical-approach.md),
ADR-0026), and both drift notes are gone. No ADR or spec was changed.

- **Topology:** four containers (`caddy`, `app`, `worker`, `postgres`) plus the one-shot `migrate`,
  one image for `migrate`/`app`/`worker`. The Compose example gains the `migrate` service,
  `depends_on: service_completed_successfully`, `postgres:17`, and named volumes; the `scheduler`
  service is gone.
- **Removed from v1:** Redis, MinIO/S3, the artefact volume, `OBJECT_STORAGE_*`, object-storage
  backups, and the separate scheduler. Artefacts are bounded `bytea` in Postgres, so one `pg_dump`
  covers all durable state; the master key is backed up separately (`--include-key` opt-in, TQ-3).
  Cron (reconciler, retention, stalled sessions, reaction poll) runs inside `worker`.
- **Helm is v1.2** (model E, DEP-11, DEP-12, the operations matrix); the v1 install commands for the
  chart are removed. Air-gapped (F) is "not in v1".
- **Environment:** only the technical-approach §14 names; `NO_PROXY` and the knowledge-pack body cap
  were dropped. The retired names appear once, in `operations.md` §3, marked "none in v1".
- **Added from accepted documents:** the ADR-0030 `local` provider egress exception and its
  `doctor` and troubleshooting rows; the Q-048 hardware floor row in sizing; the receipt signing key
  row in secrets; the `doctor` checks from technical-approach §3.12 and first-run-setup criterion 2.
- **Kept:** the loopback setup listener, the pinned Compose subnet for `TRUSTED_PROXIES`,
  file-based secrets, Caddy on-demand TLS, the public-surface section, and the section numbering
  that other documents link to. The Helm anchor changed to `deployment.md#e-kubernetes-and-helm-v12`,
  and its one inbound link was updated.

**Follow-ups found (since fixed by the architecture alignment above, except the ADR-0022 decision,
now proposed as ADR-0031):**

- Other documents still describe a separate scheduler, Redis, or MinIO as v1:
  `architecture/agentic-review.md` (around line 246), `architecture/components.md` §12,
  `architecture/overview.md` (around lines 73 and 78), `delivery/quality-gates.md` G1 (around line 45),
  `delivery/roadmap.md` (around line 43), `product/capabilities.md` (the Helm row, around line 247), and
  `product/specs/repo-knowledge-graph.md` (around line 127, Redis cache).
- The **bodies** of ADR-0003, ADR-0004, ADR-0006, and ADR-0022 predate technical-approach: they still
  name a scheduler, Redis/MinIO, object storage, Postgres 16+, and (ADR-0004) row-level security,
  which technical-approach §3.2 does not use in v1. Their status lines carry the amendments, so the
  rewrite follows those. ADR-0022's chart component list (a separate scheduler Deployment) needs a
  superseding decision before the v1.2 chart is specified.
- Before more than one `worker` replica is documented as safe for cron, an M1.1 integration test
  must show that graphile-worker fires each cron tick once across two workers.

### Landed earlier this session (2026-11-27, MVP spec review)

The six MVP-gate specs were reviewed against the accepted ADRs and revised. **None is approved yet**;
each header and the [specs index](../product/specs/README.md) say "revised, awaiting owner approval".

- **Every spec now has a release-tier section**, and the acceptance criteria carry their tier, so
  approving a spec for the MVP approves only its MVP rows.
- **first-run-setup:** environment variables and secrets match technical-approach §14
  (`JURY_MASTER_KEY_FILE`, no session secret, no `BOOTSTRAP_TOKEN` override, no egress-allowlist
  variable); no object storage in v1; the bootstrap token is never in a URL; the capability probe
  (ADR-0029) gates Stage 5; evaluation mode (criterion 11) is after G1; Helm is v1.2; F-042 and
  F-013 replace the "F-0xx" placeholders.
- **provider-model-discovery:** the `local` kind follows the new ADR-0030; owner-only provider
  management (ADR-0028); master key, not KMS; the registry is the bundled snapshot with no default
  fetch; the signed manifest is untiered (MVP rejects providers without `/models`); Non-goals,
  Metrics, Rollout, and SSRF/local criteria added.
- **agentic-review-sessions:** ADR-0010 as amended (no harness); **PR review runs no model tool
  loop** (the tool table is the v1.1 branch-review set); capability labels are v1.2;
  `.jury-forge.yml` uses the §14 keys and is read from the base SHA; a comment never creates a
  session; a mention is a reply turn; `pull_request_review` and default-branch `push` are v1.1 event
  expansions; a manual request never bypasses bindings; the 2026-11-15 idea list is an untiered
  appendix; AG-01 and AG-08 closed.
- **review-progress-and-completion:** Check Run on open only in bound repos and never on forks;
  failure conclusions per decision 4; the placeholder is found only among the App's own comments; a
  security section; the large-PR estimate goes into the placeholder.
- **large-pr-handling:** aligned to ADR-0025 §2 (states, deterministic fitting); the 100 %
  no-clean-result rule is fixed in the MVP; split/continuation/threshold untiered; Rollout fixed.
- **session-capacity-and-visibility:** one lifecycle (the data-model states); open PRs' sessions are
  never archived; ADR-0024 hard budgets plus ADR-0015's soft quota and loop guard (Q-050); a v1
  owner/maintainer/reader table; reply rights per ADR-0024; pricing points to the provider spec.
- **New [ADR-0030](../decisions/ADR-0030-local-provider-egress.md)** (egress rule for local model
  servers), indexed; ADR-0011's status line, technical-approach §3.11, and `security.md` point to it.
- **technical-approach §14 amended:** `TRUSTED_PROXIES` and `DATABASE_URL_FILE` added (see decision
  1); retired variable names listed.
- **`deployment.md` and `operations.md`:** the Compose example, the secrets table, the environment
  table, and the support matrix now match technical-approach; a drift note marks the remaining
  Redis/MinIO/S3/Helm-in-v1 passages, which still need a full rewrite.
- **New Q-050** in [`open-questions.md`](../analysis/open-questions.md).

**Owner decisions (2026-11-27, "fix with defaults"):** each default was checked against the
accepted ADRs before it was applied; three were changed because the literal default would have
conflicted with an ADR or weakened the product.

1. **Environment variables:** technical-approach §14 is the list. **Changed:** `TRUSTED_PROXIES`
   and `DATABASE_URL_FILE` were *added* to §14 instead of moved to the database: the app needs the
   trusted proxy before any setup state exists, or every pre-auth rate limit collapses into the
   proxy's single IP, and a `DATABASE_URL` value in the environment leaks the password.
2. **Mentions:** **changed.** A mention cannot be a review trigger (ADR-0013 names the Check Run
   action and the label only). An `@jury-forge` mention from a repo-write user is a **reply turn** in
   an existing session (ADR-0024 §1); it never starts a review and gets no placeholder.
3. **Check Run on PR open:** only in repos with an enabled binding, never on a fork PR. Applied as
   proposed.
4. **Provider outage:** **changed.** `neutral` with the remedy under the default `gate: neutral` (and
   always in the MVP), but `failure` when a repo opted into a blocking gate (v1): GitHub counts
   `neutral` as passing a required check, so the literal default would merge unreviewed code during an
   outage.
5. **Local models:** applied as proposed, but it contradicts ADR-0011's accepted egress rule, so it
   is recorded as **ADR-0030** (owner-only, the exact host pinned, plain HTTP only to loopback/private
   addresses, metadata and link-local always blocked, the instance's own listeners refused). Its
   safeguards were drafted in this pass and are open to amendment.
6. **Stalled sessions:** a session is archived only when its PR closes; after 30 days waiting it is
   marked `needs human`. Applied as proposed; it matches ADR-0015 ("archive only after PR close").
7. **Model registry:** the bundled snapshot, no default fetch; a signed refresh is opt-in and
   untiered. Applied as proposed.

### Landed earlier this session (2026-11-27, M1.0 walking skeleton)

Merged into `dev` through PR #5 (`feat/walking-skeleton`, commit `769bc1c`, merge `1182ff7`); no
product behaviour, only the skeleton and the checks.

- **WP 1-01, workspace:** pnpm workspace with `apps/{server,web,cli}` and
  `packages/{contracts,domain,pipeline,gateway,forge,parsing,store,crypto,testkit}` per
  technical-approach §4, each a typed placeholder. `tsconfig.json` (strict, `nodenext`,
  `erasableSyntaxOnly`), `biome.json`, `.editorconfig`, `.node-version`. Exact versions only;
  dependency install scripts are denied (`allowBuilds`).
- **WP 1-02, import boundaries:** `.dependency-cruiser.cjs` enforces the §4 rule (`domain` →
  `contracts` only and no I/O modules; `contracts` is a leaf; `pipeline` does not import
  gateway/forge/store/crypto; `testkit` only from tests; no cycles, no undeclared or
  unresolvable imports). `scripts/dependency-rules.test.ts` runs the real rules over deliberate
  violations in `scripts/fixtures/boundaries/` and expects exactly those four.
- **WP 1-03, test harness:** vitest projects `unit` and `integration`, v8 coverage with the
  `packages/domain` ≥ 90 % threshold, fast-check, and `@jury-forge/testkit` with a PostgreSQL 17
  container helper. A missing container runtime skips integration tests with a warning locally
  and **fails** in CI.
- **WP 1-04, licences and supply chain:** `scripts/check-licences.ts` + `licence-policy.json`
  (see technical-approach §13 for why not `license-checker`), with unit, property, and CLI tests
  that a BUSL-1.1 or SSPL-1.0 dependency fails. `renovate.json`: grouped weekly updates, pinned
  ranges and action digests, PostgreSQL held below 18.
- **WP 1-05, CI:** `.github/workflows/ci.yml` with three jobs: `pnpm check` on linux/amd64,
  typecheck + unit on linux/arm64, and the TypeScript 5.9.3 fallback typecheck. Actions are
  pinned to commit SHAs; `contents: read` only.
- **Found:** dependency-cruiser cannot use TypeScript 7.0's API and passed silently on 0 modules.
  Fixed with a private TS 5.9.3 for it (`packageExtensions`) and guarded by the fixture test.
- **Docs:** `AGENTS.md` and `README.md` phase lines, `CONTRIBUTING.md` checks,
  technical-approach §3.14 and §13 (verified tool versions), and the M1.0 progress note in
  `implementation-plan.md`.

### Earlier this session (2026-11-27, docs and capabilities review)

A review after G0 found that the 2026-11-16 consistency pass had covered only T0/T0+ wording.
Fixed in this pass:

- **`capabilities.md` §0 added:** 33 v1 trust-loop rows (verifier, chair, presets, model roles,
  T0+, instruction files, evidence ingest, conventions pack, ADR-0024, appeal, verified-fixed, noise budget, risk
  score, charges, fix handoff, merge gate, reactions, repo memory, signed receipt, egress preview,
  retention, checkbox trigger, bot-author defaults, reconciler, sizing floor, injection corpus),
  each with its source. Four rows have no spec section yet and are marked *spec gap*.
- **Row tiers aligned with the tier table:** 55 rows in §2–§12 now carry MVP / v1 / v1.1 /
  v1.2 instead of a bare `Planned` or `v1.x`. Fixed rows that contradicted it: resolution policy
  (was MVP with SME/admin override), provider fallback (was Deferred), the benchmark (Phase 3 +
  v1.1 replay UI), the chair (code, not configurable), the competitor teardown (Done). The
  status key gained Rejected, Done, and *(partial)*.
- **Backlog promotions recorded** (§13, the specs README, and five spec headers): B-04 → MVP
  (Q-040), B-03 and the B-07 reviewer client → v1.1, B-02 and B-06 → v1.2; B-01, B-05, B-08 stay
  backlog.
- **Conventions pack:** `scope.md` now has the one v1 org conventions pack that ADR-0017/0023 and
  WP 2-34 already had; the deferred row covers only further packs.
- **`standout-features.md`:** S6 split (egress preview v1, replay Phase 3 internal / v1.1 UI);
  SF-04 closed by Q-045; S1–S6 vs S7–S13 labelled.
- **`security.md` §6:** v1 role note (owner/maintainer/reader; the other columns are v1.2); the
  "Enable repositories" row renamed to reviewer binding (ADR-0013).

**Owner decisions (2026-11-27):**

1. **Instruction files → the S11 set** ([ADR-0027](../decisions/ADR-0027-instruction-files.md)):
   six file types from the base SHA, capped, trust-labelled, on by default (closes KN-01), MVP.
   Amends Q-032. Propagated to `scope.md`, `capabilities.md`, `knowledge-system.md`,
   `standout-features.md`, Q-032, ADR-0017/0023 status lines, and the ADR indexes.
2. **Spec approval → per milestone.** The six MVP specs are marked *MVP gate* and must be approved
   before Phase 1b work that implements them; every other spec is approved before its milestone.
   Recorded in [`../product/specs/README.md`](../product/specs/README.md). No spec is approved yet.
3. **Maintainer rights → override, owner decides critical**
   ([ADR-0028](../decisions/ADR-0028-v1-resolution-rights.md)): in v1 a maintainer accepts,
   dismisses, and reopens; only the owner dismisses or resolves a `critical` finding. Amends
   ADR-0012 and Q-028. Propagated to `scope.md`, `v1-ui.md`, `jury-output.md`, `security.md` §6,
   `agentic-review-sessions.md`,
   `capabilities.md`, and Q-028. New **Q-049** records the default for GitHub-native resolves of
   critical findings and the merge gate.

**Spike: CommandCode discovery + structured output (2026-11-27)** —
[`../analysis/spikes/2026-11-27-commandcode-structured-output.md`](../analysis/spikes/2026-11-27-commandcode-structured-output.md),
run with the owner's key on `deepseek/deepseek-v4.1-flash`; throwaway code outside the repository.

- CommandCode `/models` answers 200 **without a key**, so it cannot validate one; it has no pricing
  and no capability flags. `provider-model-discovery.md` §1 now validates with an authenticated
  minimal call.
- Structured output, 108 trials: the forced-tool mode on `/messages` was 18/18 valid; `json_schema`
  on `/chat/completions` was 16/18, with a whitespace runaway to the token cap on empty results;
  `output_format` on `/messages` appears to be ignored (0/18); prompt-only JSON needed one repair in
  about 20 % of trials.
- WP 1-07 is only partly done: Ollama and Anthropic-native models are not covered.

**Capability review against the spike (2026-11-27):** a row-by-row pass over `capabilities.md`.
Reworked: structured output (probe-chosen mode, MVP), tool use (v1.1; a forced tool is only a
structured-output mode in PR review), hard caps (reasoning tokens, `finish=length`), cost budgets
and presets (registry/admin prices; "cost unknown"), model roles (reasoning share, caching
confirmed), local servers and streaming (untested; probe first), capability registry (claims until
probed), rate limits (classify errors by status), diagnostics (last probe). Also S7 in
`standout-features.md`, Q-031 evidence, and `provider-model-discovery.md` pricing and catalog rows.

**Model capability probes (owner decision, 2026-11-27)** —
[ADR-0029](../decisions/ADR-0029-model-capability-probes.md): before a model is bound, a budgeted
probe on synthetic fixtures checks auth with a real call, picks the structured-output mode that
works, and records reasoning share and caching; `finish=length` is a failure, not a repair. MVP.
Propagated to `capabilities.md`, `scope.md`, `provider-model-discovery.md` (§2.1, binding, API, UI,
acceptance), `technical-approach.md` §3.4, `ai-pipeline.md`, `components.md`, `data-model.md`
(`model_probes`), `implementation-plan.md` (WP 1-19a, 1-07, 1-20), G1 in `quality-gates.md`, the
glossary (also removed a stale duplicate "Coverage manifest" entry), ADR-0011/0026 status lines,
and the ADR indexes. New [`../analysis/spikes/README.md`](../analysis/spikes/README.md): spike
index, S-A…S-E status, Mermaid charts of the results, and how to run a spike. The pre-v1 quality
spike stays dropped (ADR-0023).

Also noted, not changed: ADRs are amended in place (`accepted as amended`, edited status lines),
while `AGENTS.md` and `decisions/README.md` say to supersede; the status list has no `amended`.

### Earlier: 2026-11-16 consistency pass

- **T0+ propagated.** ADR-0025 now names what it amends (ADR-0007, 0011, 0014, 0016, 0018, 0019,
  0023) and states its tier: the MVP stays strict T0, T0+ ships in v1. Fifteen documents that said
  "strict T0 / no repository file reads" now say diff-only with **no file outside the diff read**:
  `ADR-0007`, `ADR-0014`, `ADR-0016`, `ADR-0018`, `ADR-0019` (note only), `ai-pipeline.md`,
  `overview.md`, `agentic-review.md`, `quality-gates.md`, `capabilities.md`, `glossary.md`,
  `agentic-review-sessions.md`, `reviewer-assignment-and-roles.md`, `pr-walkthrough.md`,
  `knowledge-system.md`.
- **Open questions closed.** Q-028 and Q-032–Q-048 moved to a "Closed at G0" table that keeps the
  IDs and names the document each decision lives in. A second pass closed the questions an accepted
  ADR had already answered (Q-002–Q-009, Q-012–Q-016, Q-019, Q-021–Q-027, Q-029) into a
  "Closed at Phase 1a and earlier" table. Eight questions remain open — Q-001, Q-010, Q-011, Q-017,
  Q-018, Q-020, Q-030, Q-031 — none of which blocks Phase 1b.
- **G0 ticked with evidence** in [`quality-gates.md`](quality-gates.md); the tracker no longer
  duplicates the gate list.
- **`technical-approach.md` header fixed** (it called itself accepted and still-proposed at once) and
  the local Node claim corrected to the observed `v24.19.0`.
- **`overview.md` decision table fixed**: sixteen rows moved from `Proposed` to their real status,
  and ADR-0024/0025/0026 added.
- **This file rewritten**: branch, phase, one next action, ADR table, and history collapsed.

### Earlier this phase (2026-11-16)

- G0 passed: owner accepted ADR-0007, 0008, 0011–0018, 0021–0025 and the default answers to Q-028 and
  Q-032–Q-048. Quality spike removed by the owner; quality is measured after v1 by replay.
- ADR-0024 (conversation safety, finding identity, evidence-gated resolution), ADR-0025 (v1 review
  pipeline), ADR-0026 (v1 stack) written and accepted.
- `product/specs/standout-features.md` (S1–S13) and the competitive scan added the v1 differentiators
  and table stakes.
- Phase 1a delivered [`technical-approach.md`](../architecture/technical-approach.md): 12 stack
  decisions T-01–T-12, repository layout, runtime flows, footprint budgets, threat→control map, and
  the M1.0–M1.8 plan with five time-boxed spikes.
- [`implementation-plan.md`](implementation-plan.md): 127 work packages across Phases 1b–5 plus
  v1.1/v1.2, with a critical path and per-milestone exit evidence.

## Verified this session (2026-11-28)

**Architecture audit and alignment (docs only):**

- Every document in `docs/architecture/` was read in full; findings cite the pre-fix line numbers
  at `c8a76d2`.
- Each replacement was applied by exact match: a pattern had to match exactly once, or the file was
  not written.
- Stale-term grep over `docs/architecture/`, `docs/delivery/`, and `docs/product/` (Redis, MinIO,
  object storage, S3, janitor, LangGraph, DLQ, `webhook_events`, `run_steps`, row-level security, KMS,
  lease, heartbeat, Postgres 16, OIDC). Every remaining hit is one of:
  - a "none in v1" statement;
  - a v1.1/v1.2 item;
  - a rejected option;
  - the PoC history;
  - the standout-feature ID "S3".
- The relative-link and anchor check result is recorded below with the deployment rewrite run; it
  covers this branch.
- **Not verified:** nothing was implemented, so the indicative table and column lists in
  `data-model.md` are unchecked until the M1.1 migrations exist.

**Deployment and operations rewrite (docs only):**

- Relative-link and heading-anchor check over all 124 Markdown files: 526 relative links, 0 broken. A
  negative test confirmed that the checker flags a missing file and a missing anchor.
- Stale-term grep over both documents (Redis, MinIO, S3, `OBJECT_STORAGE`, scheduler,
  `ENCRYPTION_KEY`, `SESSION_SECRET`, `PROVIDER_EGRESS_ALLOWLIST`, "PostgreSQL 16"): every remaining hit
  says "v1.2" or "none in v1". Postgres 16 is still mentioned twice as "tested for an external
  database", which is ADR-0004's status line and technical-approach TQ-4.
- Every environment variable named in the two documents is on the §14 list, apart from the retired
  names (marked "none in v1") and the `postgres` image's own `POSTGRES_DB` and `POSTGRES_PASSWORD_FILE`.
- `git diff --check`: clean; both documents are LF.
- **Not verified:** the Compose and Caddy examples were not run (there is no image yet); they stay
  illustrative until M1.2 produces the real files.

## Verified earlier (2026-11-27)

**MVP spec review (docs only):**

- Relative-link and heading-anchor check over all 124 Markdown files: 0 broken.
- `git diff --check`: clean (no whitespace errors); edited files are LF.
- Stale-term grep over the six specs (`ENCRYPTION_KEY`, `SESSION_SECRET`,
  `PROVIDER_EGRESS_ALLOWLIST`, `BOOTSTRAP_TOKEN`, object storage, `F-0xx`, LangGraph, `v1.x`): every
  remaining hit is intended (a "none in v1" statement, the closed harness question, or a post-v1
  "later").
- Each default was checked against ADR-0011, ADR-0013, ADR-0015, ADR-0024, ADR-0025 §2, and
  technical-approach §3.4, §3.9, §3.11, and §14 before it was applied.
- **Not verified:** `deployment.md` and `operations.md` beyond the corrected sections (the drift
  note lists what remains), and the specs not in the MVP gate.

**M1.0 in CI (GitHub Actions):**

- **PR run** [46020023291](https://github.com/PrakashSewani/jury-forge/actions/runs/46020023291)
  on head `769bc1c` (`pull_request`): all three jobs succeeded.
  - [`pnpm check (linux/amd64)`](https://github.com/PrakashSewani/jury-forge/actions/runs/46020023291/job/140576955358):
    dependency-cruiser 28 modules, 16 dependencies, 0 violations; licence check passed on 260
    package versions (162 production; 261 on Windows, where the set of platform-specific
    optional packages differs); unit 28/28 passed; **integration 1/1 passed**. This is
    the first run of the testcontainers test: PostgreSQL 17 started and answered a query.
  - [`typecheck + unit (linux/arm64)`](https://github.com/PrakashSewani/jury-forge/actions/runs/46020023291/job/140576955420):
    succeeded.
  - [`typecheck (TypeScript 5.x fallback)`](https://github.com/PrakashSewani/jury-forge/actions/runs/46020023291/job/140576955091):
    succeeded.
- **`dev` push run** [46020282734](https://github.com/PrakashSewani/jury-forge/actions/runs/46020282734)
  on merge `1182ff7`: succeeded.
- **Still not verified:** `renovate.json` against Renovate's validator, and whether the Renovate
  app is installed on the repository (no Renovate PR or onboarding issue has been seen yet).

**M1.0 locally, on Windows 11, Node v24.19.0, pnpm 12.4.2:**

- `pnpm check` exited 0: typecheck (TS 7.0.2), `biome ci` (37 files), dependency-cruiser
  (28 modules, 16 dependencies, 0 violations), licence check (261 package versions, 162
  production), 28 unit tests passed.
- **Boundary rule fails a violating import:** a declared `@jury-forge/store` import added to
  `packages/domain` made `pnpm run check:deps` exit 1 with `domain-imports-only-contracts`;
  reverted, and the lint returned to 0 violations.
- **Licence check fails BSL/SSPL:** the CLI test runs the script on a fixture with BUSL-1.1 and
  SSPL-1.0 packages and asserts exit code 1 naming both.
- **TypeScript 5.9.3 fallback:** `pnpm --package=typescript@5.9.3 dlx tsc -p tsconfig.json`
  exited 0.
- **Integration stage:** with no Docker running, it was skipped locally with the warning; with
  `CI=1` it failed as designed. The container test itself ran in CI (above).
- Running Renovate's validator locally was not permitted in this session.

**Earlier in this session (docs review and spike):**

- **Spike README charts:** all 5 Mermaid blocks rendered without errors in Mermaid 11.4.1 in the
  app's browser (a local check page).
- **Spike calls:** 4 discovery probes, 6 auth probes, 90 structured-output trials plus an 18-trial
  re-run, all against the live CommandCode API; raw results kept in the scratch folder, summary in
  the spike note. The key was never printed or written to a file.

- **Link check:** a Node script over all 117 `*.md` files resolved every relative link and heading
  anchor; 0 broken.
- **Edits applied by exact-match replacement**; each pattern had to match exactly once or the file
  was not written.
- **Spec-coverage spot-check:** rows in `capabilities.md` §0 link a spec only where `grep` found the
  topic in it; four rows are marked *spec gap*.
- **Not verified:** the architecture documents other than `security.md` §6 and the PoC docs were
  not re-read in full.

## Verified earlier (2026-11-16)

- **Link check:** every relative link in every `*.md` resolved; 0 broken.
- **Contradiction sweep:** `grep` for "strict T0" / "no repository file reads" leaves only
  tier-scoped statements (MVP, G1), the rejected ADR-0019 record, and historical entries below.
- **npm evidence spot-check (live):** `web-tree-sitter 0.27.2`, `graphile-worker 0.18.0`,
  `zod 4.6.7`, `fastify 5.12.8`, `@octokit/app 16.1.4`, `vitest 5.1.0` all match
  `technical-approach.md` §13.
- **Secret scan:** no key, token, or private-key pattern in the tree.
- **Tree contents:** `git ls-files` is documentation, licence, and config only — no product code.
- **Environment:** `node -v` → `v24.19.0`; `pnpm -v` → `12.4.2`.
- **Not verified:** any model output, any install on a host, and the packages §13 lists as "not yet
  verified live" (Caddy, minisign, cosign, syft, testcontainers, fast-check, Biome, Playwright,
  Radix, Tailwind, kysely-codegen, license-checker, the grammar packages). Nothing here is a "works"
  claim.

## Blocked by

- **M1.0 exit:** the CI run is green (PR #5); spikes 1-06 (S-A, needs a container runtime) and
  1-07 (S-C: Ollama and an Anthropic-native model are left, which needs the owner's key or a local
  Ollama).
- **M1.2 onward:** approval of the six MVP-gate specs (revised 2026-11-27, not yet approved) before the work packages that implement them — first-run-setup before M1.2, provider-model-discovery before M1.3:
  [`first-run-setup.md`](../product/specs/first-run-setup.md),
  [`provider-model-discovery.md`](../product/specs/provider-model-discovery.md),
  [`agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md),
  [`review-progress-and-completion.md`](../product/specs/review-progress-and-completion.md),
  [`large-pr-handling.md`](../product/specs/large-pr-handling.md), and
  [`session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).
  M1.0 implements none of them. No technical blocker is open.
- **Installability is still unproven.** There is no compose file, CLI, Dockerfile, or signed release.
  The three documentation defects from the install dry run (B1–B3) are fixed in the docs, but no
  build exists to test. See [`../analysis/install-readiness-2026-11-15.md`](../analysis/install-readiness-2026-11-15.md).

## Open owner questions

The open list is now Q-001, Q-010, Q-011, Q-017, Q-018, Q-020, Q-030, Q-031, Q-049, and Q-050; each has a recorded
default and a close condition in [`../analysis/open-questions.md`](../analysis/open-questions.md).
Everything else is closed by an accepted ADR (see the two closed tables there). None of the open
items blocks Phase 1b.

## G0 — passed 2026-11-16

The checklist and its evidence live in [`quality-gates.md`](quality-gates.md#g0--documentation-and-product-definition--passed-2026-11-16).

## Recent decisions

| ADR | Status | Summary |
| --- | ------ | ------- |
| ADR-0001 | accepted (owner directive) | Self-hosted, MIT, vendor-neutral. |
| ADR-0002 | accepted | The Cloudflare PoC is reference only. |
| ADR-0003 | accepted (Phase 1a) | Docker Compose is the reference deployment. |
| ADR-0004 | accepted (Phase 1a) | PostgreSQL is the source of truth. |
| ADR-0005 | accepted (Phase 1a) | TypeScript-first runtime for v1. |
| ADR-0006 | accepted (Phase 1a) | Queue + stateless workers, not per-run actors. |
| ADR-0007 | accepted (G0) | Token-aware context; PR review context is T0+ per ADR-0025. |
| ADR-0008 | accepted (G0) | Roles and trust boundaries. |
| ADR-0009 | accepted (owner directive) | MIT licence, no CLA. |
| ADR-0010 | accepted as amended (Phase 1a) | Thin turn runner; no agent harness in v1. |
| ADR-0011 | accepted (G0) | Provider/model discovery; no free-text model; encrypted keys. |
| ADR-0012 | accepted (G0) | PR sessions; `suggest` default resolution, `auto`/`off` opt-in. |
| ADR-0013 | accepted (G0) | Manual-first triggering and dynamic agent routing. |
| ADR-0014 | accepted (G0) | Diff-only PR review; branch review + graph in v1.1. |
| ADR-0015 | accepted (G0) | Session capacity, interface, roles, and visibility. |
| ADR-0016 | accepted (G0) | Reviewer catalog, repo bindings, capabilities, fallback. |
| ADR-0017 | accepted (G0) | Knowledge sources, snapshots, grants, retrieval. |
| ADR-0018 | accepted (G0) | Release tiering; eval harness + hard caps in Phase 1. |
| ADR-0019 | rejected | T1 bounded reads for PR review; T0+ (ADR-0025) is the narrower accepted path. |
| ADR-0020 | accepted (Phase 1a) | Signed release bundle, verify before extract, no pipe-to-shell. |
| ADR-0021 | accepted (G0) | Runtime-configured public origin; domain is a setup step. |
| ADR-0022 | accepted as amended (G0) | Helm chart, moved to v1.2 by ADR-0023. |
| ADR-0023 | accepted (G0) | Product direction: the auditable review layer; v1 is the trust loop. |
| ADR-0024 | accepted (G0) | Conversation safety, finding identity, evidence-gated resolution. |
| ADR-0025 | accepted (G0) | v1 pipeline: T0+ context, verifier, code-first chair, model roles. |
| ADR-0026 | accepted (Phase 1a) | v1 stack: HTTP/UI, GitHub client, parsing, crypto, observability, tests, layout. |
| ADR-0027 | accepted (owner, 2026-11-27) | Instruction files: the S11 set from the base SHA, default on; amends Q-032. |
| ADR-0028 | accepted (owner, 2026-11-27) | v1 resolution rights: maintainers override; only the owner dismisses critical. |
| ADR-0029 | accepted (owner, 2026-11-27) | Model capability probes: test auth and structured-output mode before binding. |

## History

### 2026-11-15 — product direction and capability intake

The owner moved the product to an **agentic reviewer**: per-PR sessions, manual-first triggering,
dynamic agent routing, provider/model discovery, encrypted keys, diff-only PR review, graph-backed
branch review (v1.1), `suggest` resolution. ADR-0010–ADR-0017 and the matching specs were written.
ADR-0023 narrowed v1 to the **trust loop** (install → provider → jury → diff review → verdict/dissent
→ receipt → session → feedback); ADR-0019 was rejected (no arbitrary file reads for PR review).
Owner decisions: no slash commands; labels, Check Run actions, and the UI picker only; capabilities
are first-class tenant objects; trigger and resolve authorization per ADR-0024.

Workstreams at the time: **A (quality spike) removed** by the owner on 2026-11-16; **B (install
readiness)** documented three blockers and no build — see
[`../analysis/install-readiness-2026-11-15.md`](../analysis/install-readiness-2026-11-15.md).

### 2026-11-14/15 — PoC study and knowledge base

Studied `PrakashSewani/jury-forge-poc` at `1cc22b7` (docs, source, migrations, CI) and captured the
live instance read-only through D1. Findings: 77-entry flaw register (F-001–F-077) in
[`../analysis/flaws.md`](../analysis/flaws.md), the keep/reject/rethink ledger, and the PoC section of
the knowledge base. Live evidence recorded in [`../poc/live-instance.md`](../poc/live-instance.md):
the only posted review's 8 findings all check out against the PR code, and the same reviewer that
failed with a provider 401 in the automatic run succeeded in a manual try run with 9 valid findings.
The instance was read-only throughout; no configuration was changed. The knowledge base
(`poc/`, `analysis/`, `product/`, `architecture/`, `delivery/`, `reference/`, `decisions/`),
`README.md`, `AGENTS.md`, the MIT `LICENSE`, the project skills, and the agent chain were created.

**Backlog (not committed to any tier):** B-01–B-08 (shadow mode, per-repo provider allowlist,
local/CLI diff review, large-PR handling, reviewers-as-code, history-seeded conventions, MCP surface,
PR walkthrough) in [`../product/capabilities.md`](../product/capabilities.md) §13, one spec each under
`../product/specs/`.

## How to update this file

- Change the phase table only when a phase actually starts or ends.
- Keep "Landed this session" to what landed in the current session; move older entries to `## History`
  as a short paragraph, not a transcript.
- "Verified" states what was run and observed, never "works".
- "Blocked by" names the exact question or dependency, not a vague concern.
- Exactly one "Next action".
