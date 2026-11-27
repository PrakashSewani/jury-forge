# Roadmap

The path from documentation to a first supported release. Each phase has a goal, deliverables, and
an exit gate. The owner approves each gate before the next phase starts. The deciding direction is
[ADR-0023](../decisions/ADR-0023-product-direction.md): v1 is the **trust loop**, not the platform.

## Phase 0 — Product definition and documentation — **done, G0 passed 2026-11-16**

**Goal:** agree on what we are building, why, and the architecture that can deliver it.

**Deliverables:**

- PoC study: architecture, behaviour, deployment, data model, API, decisions, testing,
  retrospective.
- Flaw register with evidence and severity.
- Product vision, personas, principles, capabilities, scope, success metrics.
- Target architecture: components, data model, job pipeline, security, AI pipeline, extensibility,
  observability, operations, deployment.
- ADR drafts for the durable choices, including the direction (ADR-0023).
- Agent chain, skills, and workflow prompts.
- MIT licence, README, AGENTS.md.

**Exit gate (G0):** the owner has reviewed the docs, answered the open questions that block
architecture, approved the scope and principles, and approved or amended ADR-0023.

**Not in this phase:** product code, infrastructure, dependencies.

## Phase 1 — Walking skeleton

> **Split (2026-11-16):** **Phase 1a — technology and approach** (decisions only, no code) accepted
> the stack ADRs and the engineering approach on 2026-11-16. **Phase 1b** builds the walking
> skeleton below and has not started; it waits for the owner's go.
> The work-package breakdown for every phase (MVP → v1.2) is in
> [`implementation-plan.md`](implementation-plan.md).

**Goal:** prove the self-hosted runtime and the conversational loop with one built-in reviewer —
not a one-shot review, and not a platform.

**Deliverables:**

- Stack ADRs accepted: runtime, deployment, storage, queue, auth, agent harness (ADR-0010).
- Repository structure and the one-command check.
- Compose install (`caddy`, one-shot `migrate`, `app`, `worker` with cron, `postgres`) with a
  bootstrap token and first-owner claim.
- Shared contracts (schemas), error taxonomy, OpenAPI generation.
- Provider onboarding: key validation, `/models` discovery, encrypted storage, catalog (ADR-0011).
- GitHub App setup, webhook ingress, queue, manual `jury:pr-review` label + Check Run action on an
  installed repo.
- **GitHub OAuth dashboard login** (same App) and first-owner claim, with sessions and the origin
  contract: the domain is set and validated in setup (ADR-0021) before the App is created;
  `PUBLIC_URL` only freezes it.
- **One built-in reviewer** bound to a catalog model; no catalog, no capability registry in Phase 1.
- **ADR-0024 safety core:** trigger authz by `author_association`, self-detection by App ID, bot
  and fork skip, per-thread and per-session turn budgets, finding fingerprints.
- **Large-PR fitting + coverage manifest** (ADR-0025 §2); base-SHA instruction files (S11).
- PR review is **T0 diff-only** plus base-SHA instruction files; hard
  per-turn token/wall-clock caps (ADR-0018; ADR-0019 rejected for PR review; T0+ arrives in v1).
- **Check Run progress and completion** (`queued` → `in_progress` → `completed`) and one review per
  turn; optional single placeholder comment for manual triggers
  ([`specs/review-progress-and-completion.md`](../product/specs/review-progress-and-completion.md)).
- Per-PR session, one thread reply, and **`suggest` resolution** (agent proposes, human resolves
  natively/UI; `auto`/`off` opt-in; ADR-0012).
- **One-click finding feedback** (valid / wrong / fixed / duplicate).
- No-reviewers/no-match fallback comment with setup/retrigger instructions.
- Session/turn/tool-call/finding records, a basic session timeline, health/readiness, logs.
- **Evaluation harness v0:** ≈20 labelled PRs (seeded bugs, clean, adversarial), deterministic
  stub-model CI for parsing, anchoring, fingerprints, dedup, and budgets. No real model calls.
- A licence check in CI (no BSL/SSPL/EE dependencies).
- A clean-machine install test and a deterministic test suite.

**Exit gate (G1):** a new operator installs on a clean Linux host, signs in with GitHub to claim the
instance, adds a provider key, triggers a review on a test PR, sees the Check Run progress, gets one
review, replies to the thread, gets a second agent response, and resolves it natively in `suggest`.
A runaway-loop test proves the hard caps stop a turn, and the evaluation harness v0 runs in CI.

## Phase 2 — The trust loop (v1)

**Goal:** make the review decision defensible: evidence, dissent, a receipt, and a durable
conversation a small team can rely on.

**Deliverables:**

- **Three built-in reviewers** (Security, Correctness, Tests), editable and versioned.
- **Jury output:** composition, per-finding provenance, preserved dissent, and an explainable chair
  rule ([`specs/jury-output.md`](../product/specs/jury-output.md)).
- **Review receipt:** provider, model, tokens, redactions, withheld files, context, policy, verdict,
  resolver.
- **Roles:** owner, maintainer, reader; repository access follows GitHub.
- **Trust hardening:** secret/PII redaction, origin-bound keys, egress policy, trust-labelled
  prompts, output validation, prompt-injection defences for diffs and replies, resolution guard.
- **Audit stream with export**; retention and deletion for sessions/messages/raw responses.
- **Stalled-session policy:** 7-day `needs human` flag, 30-day drop from the default inbox, archive
  only on PR merge/close, no auto-resolve, no silent drop.
- **Preview/approve mode** and suppression rules.
- **Backups, restore drill, upgrade/rollback, migration safety.**
- **Conversation safety (ADR-0024):** trigger authz, fork skip, loop/turn budgets, finding
  fingerprints, re-anchoring after push, evidence-gated resolution, enforced token budgets.
- **Standout features** ([`specs/standout-features.md`](../product/specs/standout-features.md)):
  appeal, verified-fixed, comment ceiling (ADR-0033), repo memory, signed receipt, presets + cost estimate, fix
  handoff, risk score, reaction feedback, instruction compatibility, jury charges, suggestion
  blocks, merge-gate policy, egress preview.
- **Review pipeline (ADR-0025):** T0+ context, large-PR fitting + coverage manifest, linked-issue
  and SARIF evidence, verifier, code-first chair, `reasoning`/`fast` model roles.
- **Release gates added:** injection corpus, licence check, N-1 upgrade + rollback, restore drill
  that verifies the receipt chain, sizing floor (2 vCPU / 4 GB / 20 GB).
- Minimal control plane: setup, overview, sessions, three reviewers, providers, audit, settings.

**Exit gate (G2):** a real team can run a review they can defend; the receipt is complete; the
injection/SSRF/authz/bot-loop/re-anchor suites pass; the security review finds no S1 issues.

## Phase 3 — Quality proof

**Goal:** make the jury measurably better than a single strong model with a good prompt, and decide
the branch-review question on evidence.

**Deliverables:**

- **Benchmark v1 via replay** on the dogfood and pilot repos: diff-only jury (T0/T0+) vs a single
  strong-model baseline at equal token budget; precision, recall, grounding, acceptance, false
  positives, latency, cost. Ground truth comes from per-finding feedback and appeal outcomes.
- **Public scorecard** for the v1 launch.
- **Context planner** with a manifest and cost estimate; session/diff reuse.
- **Structured output, repair, grounding, verification, confidence.**
- **Deduplication, disagreement, chair/consensus** refined against the benchmark.
- **Agent versioning, activation gates, rollback, run-time snapshots.**
- **Feedback capture and reviewer scorecards** (the data behind the benchmark).
- **Decision:** if T0 leaves meaningful recall on the table, promote branch review + graph from v1.x
  into the next release; if not, keep it deferred.
- Dogfood repository runs the product on itself.

**Exit gate (G3):** the benchmark beats the baseline on precision, recall, grounding, and
acceptance; the dogfood repo runs on itself; cost per accepted finding is within budget; the
branch-review decision is recorded.

## Phase 4 — Operations and release

**Goal:** a product an operator can run, upgrade, back up, and recover.

**Deliverables:**

- Backups, restore drill, upgrade/rollback, migration safety.
- `jury-forge` CLI: install, migrate, doctor, backup, restore, rotate-key, export/import,
  create-admin, reconcile, setup.
- Metrics, traces, dashboards, alerts, SLOs, support bundle.
- Signed images, SBOM, provenance, changelog, SemVer.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates.
- Documentation: install, upgrade, security, troubleshooting, runbooks.
- Load/soak tests and a support matrix (Compose only; Helm is v1.x).

**Exit gate (G4):** a release candidate passes the install/upgrade/restore drills on the support
matrix; the operations docs are complete; the security checklist is green.

## Phase 5 — v1 launch

**Goal:** the first supported, MIT-licensed release of the trust loop.

**Deliverables:**

- v1.0.0 tag, signed images, release notes.
- Public docs site and a read-only demo.
- A public benchmark scorecard.
- A security disclosure process.
- At least one external dogfood team (with permission) and a case study.
- A support policy and a roadmap for v1.x.

**Exit gate (G5):** the owner signs off; the release checklist is complete; no open S1/S2 security
issues; the docs are consistent.

## v1.1 — depth, and v1.2 — platform (only after the trust loop is proven)

**v1.1 — depth** (better reviews, more places):

1. Replay tooling and the public scorecard.
2. **Branch review + callers-of-changed-symbols index**, then the full graph (measurement-gated).
3. Sandboxed analyzer runs (own ADR); provider fallback; SARIF upload.
4. **GHES**; CLI `--staged`; `code-review` skill folder; read-only MCP; rule auto-tuning suggestions.

**v1.2 — platform** (org scale):

1. **Reviewer catalog + studio + approval**; per-repo bindings with path/language scopes.
2. **Capability registry + `jury:cap:*` labels**; SME/admin/viewer/auditor roles.
3. **Knowledge packs, doc links, retrieval UI, signed packs**; history-seeded conventions.
4. **OIDC; Helm** (ADR-0022 re-scoped); per-repo provider allowlists / data zones (B-02).
5. Analytics UI, notifications; **GitLab self-managed**.

**Later:** Gitea/Bitbucket, multi-installation, air-gapped, marketplace, cross-repo context,
IDE/Slack.

Each item enters only with measurement evidence, demand from a first user, or an owner decision.

## Milestone map

| Milestone | Phase | Proves |
| --------- | ----- | ------ |
| M0 | 0 | We agree on the product, the direction, and the architecture. |
| M1 | 1 | The self-hosted runtime can do a manual, conversational review with visible progress. |
| M2 | 2 | The review decision is defensible: evidence, dissent, receipt, audit, recovery. |
| M3 | 3 | The jury is measurably better than a strong single model; the branch-review call is evidence-based. |
| M4 | 4 | An operator can install, upgrade, back up, and recover it. |
| M5 | 5 | It is a product, not a project. |

## Dependencies and critical path

```
G0 docs + ADR-0023 ──▶ ADRs (runtime/storage/queue/auth) ──▶ M1 walking skeleton
                                                                │
                                      ┌─────────────────────────┼─────────────────────────┐
                                      ▼                         ▼                         ▼
                               M2 trust loop             M3 quality proof          M4 operations
                                      └─────────────────────────┼─────────────────────────┘
                                                                ▼
                                                           M5 v1 launch
```

There is no pre-v1 quality spike; quality is measured in Phase 3 by replaying real reviews once the
trust loop exists. Security and operations harden in parallel, but both must pass before M5.

## What could change the plan

- Phase 3 replay shows T0 is not competitive → branch review moves into v1; cut reviewer-studio
  breadth or another platform feature, not the verdict or the receipt.
- The first 10 installs are mostly solo/homelab → revisit the ICP and the local/evaluation path.
- A security buyer requires per-repo provider allowlists → promote B-02 from v1.x.
- A platform team requires Helm before adopting → promote Helm; do not promote the catalog by default.
- The owner's final capability list (Q-001) may add or remove a phase.
- The harness spike (ADR-0010) may choose a thin turn runner; that changes Phase 1 implementation,
  not the product contract.

See [`status.md`](status.md) for the live state and [`quality-gates.md`](quality-gates.md) for the
gate checklists.
