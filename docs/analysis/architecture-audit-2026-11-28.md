# Architecture audit (2026-11-28)

- Scope: every document in `docs/architecture/`, plus the delivery, product, and decision documents
  that describe the runtime. The audit checks each one against the accepted v1 stack.
- Baseline: [`technical-approach.md`](../architecture/technical-approach.md) (ADR-0026) and the
  accepted ADRs, as of `dev` at `73e3a65` plus PR #8 (the deployment and operations rewrite).
- Method: each document was read in full and each runtime claim compared with the accepted
  document that owns it. Line numbers refer to the pre-fix text at commit `c8a76d2`.
- Outcome: the fixes landed in the same PR as this report (branch `docs/architecture-alignment`).
  Items that need an owner decision are listed in §4 and were **not** decided here.

## 1. Summary

Most of `docs/architecture/` was written on 2026-11-14/15, before the stack was accepted on
2026-11-16. `technical-approach.md`, `deployment.md`, `operations.md`, and the ADRs from 0024
onward match the stack. The older documents still describe the design that was weighed and then
replaced:

| Theme | What the old documents say | What is accepted | Owner of the decision |
| ----- | -------------------------- | ---------------- | --------------------- |
| Agent runtime | LangGraph.js recommended, with a Postgres checkpointer | A thin turn runner on the `ai` SDK; no harness in v1 | ADR-0010 (amended), TA §3.4 |
| Chair | An optional final model call decides severity and verdict | The chair is code: fingerprint merge, highest confirming severity, agreement ratio | ADR-0025 §4, AGENTS.md ("models propose, code decides") |
| Verifier | Optional, per policy | One non-voting verifier call per review in v1 | ADR-0025 §4 |
| Queue | A custom `jobs` table with leases, heartbeats, a janitor, a `dead_letters` table, and an `outbox` | graphile-worker: per-session `queue_name`, `job_key` debounce, built-in cron, transactional `add_job` | ADR-0006, TA §3.3 |
| Scheduler | A separate scheduler/janitor process | Cron inside `worker`; no separate process | TA §2 |
| Artefacts | Object storage (local volume or S3) | Bounded `bytea` in Postgres; S3 adapter v1.2 | ADR-0004, TA §2, §3.2 |
| Tenancy | Row-level security as defence in depth | No RLS in v1: a repository layer that always filters by `org_id`, plus cross-tenant tests | TA §3.2 |
| Secrets | A data key per tenant wrapped by a KMS/HSM or a key file | A per-secret DEK wrapped by the KEK from `JURY_MASTER_KEY_FILE`; no KMS in v1 | TA §3.9 |
| Data model | `organizations`, `runs`, `run_steps`, `review_requests`, `webhook_events`, `jobs`, `outbox`, `provider_credentials`, `agent_*` | The TA §17 tables: `orgs`, `session_turns`, `turn_steps`, `webhook_deliveries`, `providers`, `secrets`, `artefacts`, … | TA §17 |
| Pipeline steps | `resolve → fetch → index → plan → review → ground → jury → publish → record` | `resolve → fetch → plan → review* → ground → verify → chair → summarise → publish → evaluate` (+ receipt) | ADR-0025 §4, TA §3.4, §5.2 |
| Tools in PR review | Reviewers use bounded read-only tools | No model tool loop in PR review; tool calling exists in the gateway for v1.1 branch review | TA §3.4, `agentic-review-sessions` spec |
| Roles | owner/admin/maintainer/viewer/auditor (+ SME) | v1: owner, maintainer, reader; the rest v1.2 | ADR-0023, ADR-0028, Q-005 |
| Identity | GitHub OAuth and/or OIDC | GitHub OAuth; OIDC v1.2 | ADR-0023, capabilities |
| Retention | Raw prompts/responses 90 days | 30 days raw; 1 year findings and receipts | Q-046 |
| Notifications, packs, capability labels | Described as present | v1.2 (v1 has one org conventions pack) | capabilities.md tiers |

None of these is a new contradiction between accepted documents. In each case the accepted
document is later and more specific, and the older text was never updated.

## 2. Findings by document

Severity: **H** = an implementer following the document would build the wrong thing; **M** = a wrong
tier or name; **L** = wording.

### `architecture/overview.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| OV-1 | 9–10 | Says the stack choices "are proposed in ADRs and require the owner's approval"; they were accepted on 2026-11-16. | M |
| OV-2 | 15–38 | The diagram has object storage, a separate queue box, and a code index as v1 parts. | M |
| OV-3 | 52–54 | "Object storage holds large artefacts." | M |
| OV-4 | 70 | Agent runtime: "LangGraph.js or a thin turn runner". | H |
| OV-5 | 72–76 | Indexer (v1.1), scheduler/janitor, "or an external queue", object storage, and "Caddy/Traefik/Nginx" listed as v1 services. | M |
| OV-6 | 78 | The all-in-one mode bundles a scheduler. | L |
| OV-7 | 85–97 | Data flow: `webhook_event`, graph and packs in context, tool calls, raw responses to object storage, a janitor. | M |
| OV-8 | 113 | "Sessions use OIDC/GitHub OAuth"; OIDC is v1.2. | M |

### `architecture/components.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| CO-1 | 12 | GitHub OAuth "and/or OIDC". | M |
| CO-2 | 29–32 | Step list `resolve, fetch, index, plan, review, ground, jury, publish, record` and "claim a job with a lease". | H |
| CO-3 | 40–52 | The indexer is not marked v1.1. | M |
| CO-4 | 77–88 | "T0 does not read files", with no T0+ (v1). | M |
| CO-5 | 97 | Reviewers "support tools for retrieval/verification"; none in PR review. | H |
| CO-6 | 118–121 | Duplicate clustering by "semantic similarity" and an "optional chair step: a final model call". | H |
| CO-7 | 137–145, 167–174 | The knowledge service and notifications are not marked v1.2. | M |
| CO-8 | 156–165 | "Scheduler and janitor" with a DLQ. | M |
| CO-9 | 180–181 | CLI list includes `import` and `reconcile`, which are in no accepted list. It omits `init`, `setup`, `verify --release`, and `receipt verify`. | M |
| CO-10 | 189–192 | Roles not tiered; API tokens and service accounts not tiered. | M |
| CO-11 | 204 | "Object storage holds bytes". | M |

### `architecture/job-pipeline.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| JP-1 | 14–40 | A custom job model (`webhook_events → outbox → queue`) and job kinds that do not match TA §3.3 (`webhook.ingest`, `session.turn`, `publish.github`, cron). | H |
| JP-2 | 42–66 | A hand-built queue state machine with lease expiry and a dead-letter state. | H |
| JP-3 | 68–83 | Steps `index`, `jury`, `record` and a `run_steps` table; TA has `turn_steps` keyed by `(turn_id, step)`. | H |
| JP-4 | 85–91 | Leases, 15 s heartbeats, and a janitor; graphile-worker owns job locking. | H |
| JP-5 | 93–104 | Idempotency keyed by `run_id`, `request_id`, and a `review_publications` table; TA uses `(turn_id, step)` and a stored `external_id`. | M |
| JP-6 | 118–131 | `dead_letters` table and replay; replay of a turn is v1.1. | M |
| JP-7 | 176–177 | "Object storage unavailable" and "janitor crashes" failure rows. | M |
| JP-8 | 192–197 | The migration note describes `SKIP LOCKED` and Redis/BullMQ as the swap target; TA's port is five functions with pg-boss as the proven fallback. | M |
| JP-9 | 199–215 | Session-turn jobs include v1.1 index jobs without a tier, and a `model.refresh` job not in the TA cron list. | L |

### `architecture/data-model.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| DM-1 | 6–7 | "Status: proposed. The exact DDL follows the storage ADR"; the storage ADR is accepted, and TA §17 names this file as the field-level reference. | M |
| DM-2 | 15–16 | "Postgres holds facts; object storage holds bytes." | H |
| DM-3 | 22–41 | Table names differ from TA §17 (`organizations`, `sessions`, `forge_installations`, `forge_credentials`, `webhook_events`, `outbox`); `instance_settings`, `secrets`, and `artefacts` are missing. | H |
| DM-4 | 28, 57 | Five-to-seven role names with no tier. | M |
| DM-5 | 64–76 | A `review_requests`/`runs`/`run_steps`/`provider_calls`/`review_publications` model beside the session model; TA has one model (`session_turns`, `turn_steps`). | H |
| DM-6 | 91–93 | `agent_definitions`/`agent_versions`/`agent_scopes` duplicate `reviewers`/`reviewer_versions`. | M |
| DM-7 | 89 | `tool_calls` "read-only tools in v1"; no PR-review tools in v1. | M |
| DM-8 | 150–151 | `jobs` and `dead_letters` tables; graphile-worker owns its own schema. | H |
| DM-9 | 185 | "Row-level security is a defense in depth." | H |
| DM-10 | 189 | Raw prompt/response retention 90 days; Q-046 says 30. | M |
| DM-11 | 195 | Deletion cascades through "object-storage prefixes". | L |
| DM-12 | — | Gap the other way: TA §17's MVP list has no repo-binding table, but the MVP specs require one (`agentic-review-sessions` §6: one built-in reviewer with one `required`/`default` binding; `review-progress-and-completion`: the Check Run appears on open only in a bound repo). TA §17 also omitted `model_probes` (ADR-0029). Fixed: both tables are now in `data-model.md` as MVP, and TA §17 carries a dated amendment. | M |

### `architecture/agentic-review.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| AR-1 | 27–43 | Diagram: "uses LangGraph.js (recommended)", a queue with leases and DLQ, object storage. | H |
| AR-2 | 52–56 | Role list (owners/admins, members, viewers, auditors) with no v1 tier. | M |
| AR-3 | 70 | Context Service "(T0)" with graph and packs, no tiers. | M |
| AR-4 | 99–100 | After a push, findings become `needs_recheck`; ADR-0024 replaced that with re-anchoring, `fix_candidate`, and `outdated`. | H |
| AR-5 | 113–125 | Event mapping not tiered: branch-review action (v1.1), capability labels (v1.2), mentions starting turns (a mention is a reply turn in an existing session), `pull_request_review` and default-branch `push` (v1.1). | H |
| AR-6 | 143 | "Run agents in parallel with bounded tools". | H |
| AR-7 | 152–169 | §5 recommends LangGraph.js for the spike; ADR-0010 was amended to the thin runner. | H |
| AR-8 | 188 | Graph in "content-addressed object storage". | M |
| AR-9 | 215–216 | "Tools are read-only … in v1". | M |
| AR-10 | 229 | "Lease expires; turn retries from the last step". | L |
| AR-11 | 241–248 | Compose list with `indexer`, `scheduler`, `redis`, `minio`. | H |

### `architecture/ai-pipeline.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| AI-1 | 20 | ADR-0025 marked "proposed"; it was accepted at G0. | M |
| AI-2 | 26–101 | Stage list and headings use `index` and `jury`; no `verify` or `summarise` stage. | H |
| AI-3 | 39 | Raw diff stored in object storage. | M |
| AI-4 | 61–63, 148 | "Granted packs" in T0 context; v1 has one org conventions pack, and packs are v1.2. | M |
| AI-5 | 211 | The example severity enum `info|warning|error` has no `critical`, which ADR-0024 §6 and ADR-0028 depend on. See §4 Q-A. | H |
| AI-6 | 255–271 | Eight roles listed as "the jury"; v1 has three built-in jurors (Security, Correctness, Tests). | M |
| AI-7 | 283–294 | Model verification "optional, per policy". | H |
| AI-8 | 306–327 | Fingerprint from "key phrases"; an "optional" chair that produces a verdict. | H |
| AI-9 | 384–385 | "Strong model for verification and the chair". | H |
| AI-10 | 416 | Failure row "Chair unavailable"; the chair is code. | M |
| AI-11 | 435, 444 | "Uses read-only tools"; "the turn is a bounded loop with tools". | H |

### `architecture/security.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| SE-1 | 17, 38 | Assets and trust diagram include a queue and object store as separate parts. | L |
| SE-2 | 23 | The auditor actor is v1.2. | L |
| SE-3 | 134, 194 | Row-level security as a control (T-05, T-12). | H |
| SE-4 | 205–206 | Session TTL "7 days, shorter for admins"; TA: idle 8 h, absolute 7 d. | M |
| SE-5 | 207 | API tokens untiered (no capability row; not in the TA §17 MVP schema). | M |
| SE-6 | 251–252 | Envelope encryption via "a KMS/HSM or a local key file", data key per tenant. | H |
| SE-7 | 309 | Checklist "Queue/object storage private". | L |
| SE-8 | 327 | "Replay failed runs". | L |
| SE-9 | 342 | F-035 control "KMS". | M |
| SE-10 | 349–350 | Open decisions already closed (KEK file: TA §3.9; OIDC: v1.2). | M |
| SE-11 | 383–399 | §16 role mapping and capability labels without the v1 tier. | M |

### `architecture/observability.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| OB-1 | 14 | "or a bundled stack"; v1 bundles no monitoring stack. | L |
| OB-2 | 50 | Raw artefacts to object storage. | M |
| OB-3 | 67–69 | Metrics `jf_lease_expiries_total`, `jf_dead_letters_total`, `jf_webhook_events_total`; TA §3.12 metrics (queue age, verifier drop rate, coverage ratio, cache hits, budget/loop stops) are missing. | M |
| OB-4 | 98–110 | Trace steps `index`, `jury`, `record`. | M |
| OB-5 | 175, 182–183 | "Janitor metric"; `/readyz` checks object storage. | M |

### `architecture/extensibility.md`

| # | Line | Finding | Sev |
| - | ---- | ------- | --- |
| EX-1 | 14 | Agent runtime default "LangGraph.js or thin turn runner". | H |
| EX-2 | 15–16 | Queue default `SKIP LOCKED` (graphile-worker); artefact store default "local volume". | M |
| EX-3 | 18 | Notifier default "webhook + email"; notifications are v1.2. | M |
| EX-4 | 19 | Context default includes packs. | L |
| EX-5 | 165 | v1 row lists "packs" and "API tokens" without the v1 limits. | M |

### `architecture/tech-depth/branch-review.md`

Consistent: marked v1.1 and deferred. No change.

### Outside `docs/architecture/`

| # | Document | Finding | Sev |
| - | -------- | ------- | --- |
| XD-1 | `delivery/quality-gates.md` G1 (line 45) | "The app, worker, scheduler, Postgres, and UI start" — a gate row naming a container that does not exist. | H |
| XD-2 | `delivery/roadmap.md` (line 43) | Compose install "(app, worker, scheduler, Postgres)". | M |
| XD-3 | `product/capabilities.md` (line 247) | Helm row: the chart "deploys app/worker/scheduler/migrations; external Postgres+S3". | M |
| XD-4 | `product/specs/repo-knowledge-graph.md` (line 127) | "Redis optional for hot retrieval caches" (v1.1 spec); nothing in the stack adds Redis (TA §2, §9). | M |
| XD-5 | `decisions/README.md` (lines 65–67) | Says the stack ADRs "stay `proposed` on purpose"; they are accepted (the index above it says so). | M |
| XD-6 | ADR-0003, ADR-0004, ADR-0006 bodies | Scheduler, Redis/MinIO, object storage, Postgres 16+, RLS. Their status lines already point to TA, which is accepted, so no new decision is needed; the bodies stay as history (ADRs are never rewritten). | — |
| XD-7 | ADR-0022 body | The v1.2 chart deploys "app, worker, scheduler, and a migration Job" with "Postgres 16+ and object storage". Nothing accepted amends the chart's component list. | §4 Q-B |

## 3. What was fixed

Every finding in §2 except XD-6 (left as history), XD-7 (needs a decision), and AI-5 (needs a
decision; the document now flags the gap). The fixes keep each document's structure and the
section headings other documents link to:

- `agentic-review.md#7-repo-knowledge-graph`
- `observability.md#10-support-bundle`
- `security.md#11-deployment-hardening-checklist`

They also keep the `pr_sessions` states that `session-capacity-and-visibility.md` relies on.
`data-model.md` and `job-pipeline.md` were rewritten around TA §17 and §3.3, because nearly every
table in them had changed. `branch-review.md` needed nothing.

## 4. Questions for the owner (not decided here)

| ID | Question | Why it matters | Recommended default |
| -- | -------- | -------------- | ------------------- |
| Q-A | What is the finding severity scale? | ADR-0024 §6 and ADR-0028 rely on `critical`, the chair takes "the highest severity", and the receipt prints it, but no accepted document lists the levels. The only example (`ai-pipeline.md` §6) has `info|warning|error`, with no `critical`. M1.5 needs it for the `contracts` schema. | `critical | high | medium | low | info`, written into `jury-output.md` before M1.5. |
| Q-B | Does the v1.2 Helm chart keep a separate scheduler Deployment? | ADR-0022 says yes; the v1 runtime has no scheduler (cron is in `worker`). | Proposed as [ADR-0031](../decisions/ADR-0031-helm-chart-runtime-shape.md): the chart runs the same roles as Compose (`app`, `worker`, a migration Job); cron stays in `worker`; S3 is optional. |
| Q-C | *(Answered during the audit.)* What tier are API tokens? | `session-capacity-and-visibility` (release tiers) puts "the API/CLI surface" in v1.2. | Applied: API tokens are v1.2 in `data-model.md`, `components.md`, `security.md`, and `extensibility.md`. |
| Q-D | Is the daily provider catalog refresh a cron job? | The `provider-model-discovery` spec says "refresh on demand and daily"; TA §3.3's cron list does not include it. | Add `catalog.refresh` (daily) to the TA cron list when M1.3 lands. |
| Q-E | Is graphile-worker cron safe with several worker replicas? | Each cron tick must fire once. | An M1.1 integration test with two workers, before docs call more than one replica safe. |
| Q-F | What happens when the verifier call fails (timeout, 5xx, `finish=length`)? | ADR-0025 defines the verifier's verdicts but not its failure. The old `ai-pipeline.md` row ("chair unavailable: use policy defaults") no longer applies, because the chair is code. | Publish nothing as confirmed, mark the findings unverified, and say so in the Check Run; decide in the `jury-output` spec before v1. |

## 5. Verification

The full list is in [`../delivery/status.md`](../delivery/status.md):

- a link and anchor check over every Markdown file;
- a grep for each stale term over `docs/architecture/`;
- `git diff --check`.
