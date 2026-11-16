# Scope

Scope is a decision, not a wish list. This page defines the first release (v1) and the explicit
non-goals. The deciding direction is [ADR-0023](../decisions/ADR-0023-product-direction.md): v1 is
the **trust loop**, not the platform.

## The v1 goal

**A self-hosted, MIT-licensed GitHub review layer that a small team can install, operate, trust, and
audit — and that proves its quality before it grows into a platform.**

The unit of value is a **review decision**, not a review comment: a default jury, an evidence-backed
verdict with visible dissent, a durable conversation, and a receipt for everything that left the
perimeter.

## Who v1 is for

Primary: **20–200 person engineering organisations with a platform or security function and private
GitHub repositories.** The platform engineer installs it; the security lead approves it; the staff
engineer uses it. Solo/homelab is served by the labelled evaluation mode, not a supported v1 install.

## v1: the trust loop

### 1. Install and operate

- One-command Docker Compose install on Linux (amd64 and arm64), from a signed release bundle
  (ADR-0020). Compose is the only supported v1 install.
- PostgreSQL as the source of truth; a durable job queue and at least one worker.
- Environment validation, health/readiness, a support bundle, and documented backup/restore.
- Upgrade path with expand/contract migrations and a rollback procedure.
- **MVP is a single operator:** the claimed owner signs in with GitHub. v1 adds owner, maintainer, and
  reader; the wider role model is v1.x.

### 2. Connect

- **Single-tenant v1:** one organisation or personal account per instance, one GitHub installation,
  many repositories.
- GitHub App (manifest flow) for GitHub.com. GHES is v1.x.
- Installation-level availability: a review on any PR in an installed account/org, with no per-repo
  enable toggle (ADR-0013). The reviewer binding is the enablement.
- Manual first: `jury:pr-review` label, Check Run action, or UI picker. No slash commands.
- Config-as-code (`.jury-forge.yml`) for automatic review, default `auto: false`; org defaults are
  v1.x.

### 3. Review

- **Diff-only by default** for any repository with a bound/default jury: diff/hunks + PR metadata +
  thread context.
- **Repository instruction files** (`AGENTS.md`, `CONTRIBUTING.md`) at the base SHA, capped and
  trust-labelled as instructions-only. No other repository file is read at T0 (Q-032).
- **A default jury of three built-in reviewers: Security, Correctness, Tests.** Editable and
  versioned; no catalog, capability registry, or SME approval in v1.
- **One review per turn** with:
  - composition (who ran/skipped and why);
  - per-finding provenance (reviewer, model, evidence, confidence);
  - preserved dissent and an explainable chair rule;
  - a verdict that respects the repo policy (advisory by default).
- **Hard per-turn token/tool/wall-clock caps**; a turn that hits a cap stops and says so.
- **Progress and completion** via the Check Run (queued → in progress → completed) plus the review
  itself; for explicit manual triggers, one placeholder comment is posted by default and edited in
  place (never a series) ([`specs/review-progress-and-completion.md`](specs/review-progress-and-completion.md)).
- **A review receipt** for every published review: provider, model, tokens, redactions, withheld
  files, context, policy, verdict, resolver.
- **No-reviewers/no-match/required-unavailable fallback comments**; never a misleading clean review.
- **A durable per-PR session** (ADR-0012): threads, messages, turns, findings, generations; a reply
  resumes with context.
- **Resolution:** `suggest` default (agent proposes, human resolves natively/UI); `auto`/`off` opt-in;
  a new reply reopens. SME/admin override is v1.x; owner/maintainer override is v1.
- **Feedback:** one-click valid / wrong / fixed / duplicate on each finding.
- **Stalled sessions:** flagged after 7 days, archived after 30, never auto-resolved or silently
  dropped.
- **Branch review and the repository graph are v1.x**, benchmark-gated (ADR-0014/ADR-0018). A
  one-click “deep review” is the path, not an automatic upgrade.

### 4. Providers and models

- Add a provider with base URL + key; validate and fetch `/models`; no free-text model entry
  (ADR-0011).
- Model catalog enriched with context window, prices, capabilities, and supported endpoint; unknown
  models flagged.
- Encrypted, write-only, origin-bound, rotatable keys; per-provider health/refresh.
- OpenAI-compatible, Anthropic-compatible, and local model servers.
- One provider per instance in v1; per-repo provider allowlists are v1.x (Q-033).

### 5. Control and proof

- **Roles:** owner, maintainer, reader. The wider model (SME, admin, viewer, auditor) is v1.x.
- **Minimal control plane:** setup, overview, sessions, the three reviewers, providers, audit,
  settings (caps, retention, verdict policy).
- **Audit stream with export:** every trigger, turn, tool call, model call, reply, resolution,
  override, and receipt.
- **Secret redaction** before prompts leave the perimeter; a per-review egress/redaction receipt.
- **Egress policy and key-to-provider binding; resolution guard.**
- **Data retention and deletion** for sessions, messages, and raw responses.
- **Budgets:** token caps are hard; currency is best-effort when pricing is known.

### 6. Measure

- **Evaluation harness v0** from the first release: ≈20 labelled PRs, deterministic stub-model CI.
- **Quality is measured after v1 is built**, on real PRs: per-finding feedback, appeal outcomes,
  and replay against a single-model baseline ([`specs/standout-features.md`](specs/standout-features.md) S6).
  No pre-v1 spike.
- OpenTelemetry traces, Prometheus metrics, structured logs, and cost/latency dashboards.
- A dogfood repository that runs the product on itself.

### 7. Deliver

- MIT licence, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- Signed container images, SBOM, changelog, and SemVer releases.
- Documentation for install, upgrade, backup, security model, and troubleshooting.

## Deferred to v1.x

These are designed for, not built in v1. They return only with a benchmark result or an owner
decision.

| Capability | Why it waits | Tier |
| ---------- | ------------ | ---- |
| Reviewer catalog, reviewer studio, org approval | Three built-in reviewers prove the loop; the catalog is a platform feature | v1.x |
| Capability registry and `jury:cap:*` labels | The request/grant model is good, but not needed for the first review | v1.x |
| SME, admin, viewer, auditor roles | Owner/maintainer/reader is enough for a small team | v1.x |
| Knowledge packs, doc links, retrieval UI | Repo instruction files cover the first need | v1.x |
| Repository graph and branch review | Highest cost; measure first | v1.1 (measurement-gated) |
| Helm / Kubernetes | Compose is the reference; Helm adds a support matrix | v1.x |
| Per-repo provider allowlists / data zones | The egress receipt proves v1; the policy follows | v1.x |
| Multi-forge (GitLab/Gitea/Bitbucket) | GitHub is the wedge; the adapter boundary stays | v1.x+ |
| Analytics suite, scorecards UI, notifications | The benchmark and the inbox are enough for v1 | v1.x |
| SSO/OIDC, multi-installation, air-gapped | Enterprise surfaces after the trust loop is proven | Later |

## Explicitly out of scope

| Out of scope | Why | Revisit |
| ------------ | --- | ------- |
| Auto-fix / auto-merge | Human judgment stays in the loop; risk is too high. | After suggested fixes are proven and there is a strong safety model. |
| Code generation / agentic coding | Different product; dilutes the wedge. | Not planned. |
| Arbitrary host shell / unsandboxed code execution | Too risky for v1. | Opt-in sandboxed `tests.run`/`build.run` later, with isolation/resource caps. |
| A graph database as a required dependency | Postgres adjacency is enough when the graph lands. | Revisit at large graph scale. |
| A hosted SaaS with customer code | Contradicts the privacy thesis. | A demo instance only. |
| A reviewer/pack marketplace | The trust loop comes first. | After the core is trusted. |
| A central billing/metering service | BYOK; no reseller. | Maybe an optional support offering. |
| Full IDE integration, mobile app | The PR is the primary surface. | Later. |
| i18n beyond English | Focus; add when there is demand. | v1.x. |

## MVP vs v1

**MVP** is the smallest build that proves the runtime and the loop; **v1** is the first release we
would support for a team that depends on it.

### MVP (the walking skeleton — the *safe loop*)

- Compose install with Postgres, one worker, and one UI.
- GitHub App setup and installation-level availability (no repo toggle).
- Provider add → `/models` discovery → one built-in reviewer bound to a catalog model.
- Manual `jury:pr-review` label, Check Run action, or UI picker → T0 diff review with base-SHA
  instruction files → one review.
- Large-PR fitting with a coverage manifest; never a silent partial review.
- Per-PR session; replies; `suggest` resolution; basic timeline.
- **ADR-0024 safety core:** trigger authz, self-detection by App ID, bot and fork skip, turn
  budgets, finding fingerprints. These are cheap, and leaving them out would make the MVP
  exploitable on any public repo.
- One-click feedback on findings.
- Check Run progress and completion; a failure path that says why.
- Evaluation harness v0 (stub model, no real model calls), a licence check, and a clean-machine install test.

The MVP proves the **self-hosted runtime and a safe conversational loop**, not the full quality
thesis. It must include the session/reply/resolve path; a one-shot review is not the product.

### v1 (the trust loop)

The v1 sections above, grouped by theme in `capabilities.md`: jury (three reviewers, verifier,
code-first chair, presets, model roles), context (T0+, evidence ingest), conversation (the rest of
ADR-0024, appeal, verified-fixed, incremental review), output (noise budget, risk score, charges,
suggestions, fix handoff, merge gate), learning (reactions, implicit acceptance, repo memory,
scorecard), trust (signed receipt, egress preview, redaction, retention, audit, roles), and ops
(backup/restore, upgrade/rollback, reconciler, sizing).

### v1.1 (depth) and v1.2 (platform)

v1.1 makes reviews better and reaches more places: replay and the scorecard, branch review with a
callers index, sandboxed analyzers, GHES, CLI. v1.2 adds org scale: catalog and studio, capability
labels, wider roles, knowledge packs, OIDC, Helm, provider allowlists, GitLab self-managed.

## De-scoping rules

- If a capability does not improve the first review, the install, or the trust story, it waits.
- If a capability cannot be measured, it waits for post-v1 measurement (feedback + replay).
- If a capability requires a central service, it is out unless the owner explicitly overrides.
- If a capability creates a security risk we cannot mitigate, it does not ship.
- If a capability only makes the product broader, not more defensible, it goes to v1.x.

## Change control

Any change to this scope requires:

1. an owner decision,
2. an update to this file and [`capabilities.md`](capabilities.md),
3. an ADR if it changes the architecture or the data model,
4. a line in [`../delivery/status.md`](../delivery/status.md).
