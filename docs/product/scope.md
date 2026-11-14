# Scope

Scope is a decision, not a wish list. This page defines the first release (v1) and the explicit
non-goals. It will be revised when the owner provides the final capability list.

## v1: the first release

**Goal:** a self-hosted, MIT-licensed GitHub PR review jury that a small team can install,
operate, trust, and measure — with durable, conversational per-PR sessions, not one-shot reviews.

### In scope

1. **Install and operate**
   - One-command Docker Compose install on Linux (amd64 and arm64).
   - PostgreSQL as the source of truth; a durable job queue and at least one worker.
   - Environment validation, health/readiness, a support bundle, and documented backup/restore.
   - Upgrade path with expand/contract migrations and a rollback procedure.

2. **Connect**
   - **Single-tenant v1:** one organisation or personal account per instance, one GitHub
     installation, many repositories. Multi-org/multi-installation is later.
   - GitHub App (manifest flow) for GitHub.com; GitHub Enterprise Server if the install spike is
     clean.
   - Installation-level availability: manual review on any PR in an installed account/org, with no
     per-repo enable toggle (ADR-0013).
   - Config-as-code (`.jury-forge.yml`) for automatic review policy, agent scopes, and pr/branch
     mode; default `auto: false`.
   - Repository discovery, policy display, and installation events; no webview enable/disable gate
     for agentic review.

3. **Review**
   - Durable per-PR sessions: threads, messages, turns, findings, generations; replies resume with
     context (ADR-0012).
   - Manual first: `jury:pr-review`/`jury:branch-review` labels and Check Run actions; slash command/UI
     fallback; automatic reviews only by policy.
   - Reviewer catalog per org, with SME ownership and admin approval; per-repo bindings with
     required/optional, path/language/label scope, and budgets (ADR-0016).
   - No-reviewers/no-match/required-unavailable fallback comments; never a misleading clean review.
   - Multi-agent routing by explicit request, repo bindings, paths, languages, labels, and
     availability (ADR-0013).
   - User-defined agents with instructions, rules, provider/model binding, parameters, and scope.
   - Agent versions, activation, rollback, and run-time snapshots.
   - Parallel agent execution with per-provider concurrency limits.
   - PR review by default; explicit branch review compares the PR branch to the default branch and uses an incrementally updated graph
     (ADR-0014).
   - Knowledge system: packs/skills, repo docs at SHA, allowlisted live doc links with per-run snapshots, capability/repo/reviewer grants, retrieval with citations.
   - Knowledge packs with immutable versions, grants, and provenance.
   - Grounding: every inline finding must cite code that exists at the reviewed SHA.
   - Cross-reviewer de-duplication, disagreement, and a chair/consensus step.
   - One consolidated response per turn; inline comments, overflow summary, and resolution state.
   - Per-finding confidence, evidence, and optional suggested fixes.
   - Publish policy: comment by default; request changes / check conclusion per repo policy.
   - Preview/approve mode for new or sensitive agents.
   - Suppression rules and per-finding feedback.
   - Guarded agent-only resolution: only Jury Forge resolves its threads after a satisfactory
     human response; a new reply reopens.

4. **Providers and models**
   - Add a provider with base URL + key; validate and fetch `/models`; no free-text model entry
     (ADR-0011).
   - Model catalog enriched with context window, prices, capabilities, and supported endpoint;
     unknown models flagged. Pricing from provider `/models`, registry, or audited admin override.
   - Encrypted, write-only, origin-bound, rotatable keys; per-provider health/refresh.
   - CommandCode, OpenAI-compatible, Anthropic-compatible, and local model servers.

5. **Control**
   - Roles: owner, admin, **SME**, maintainer, member, viewer, auditor (scoped to org/repo/domain).
   - Audit stream with export; every trigger, turn, tool call, model call, reply, resolution, and human override.
   - V1 website control plane: setup, session inbox/detail, reviewer studio, repositories/bindings, providers/models, settings/roles, audit.
   - Token and cost budgets per session/turn/repo with estimates and alerts.
   - Data retention and deletion for sessions, messages, graph, and raw responses.
   - Secret redaction before prompts leave the perimeter.
   - Egress policy and key-to-provider binding; resolution guard.

6. **Measure**
   - An evaluation benchmark of labelled PRs with precision/recall, acceptance, and false-positive
     metrics.
   - Per-agent scorecards and session outcomes.
   - OpenTelemetry traces, Prometheus metrics, structured logs, and cost/latency dashboards.
   - A dogfood repository that runs the product on itself.

7. **Deliver**
   - MIT licence, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
   - Signed container images, SBOM, changelog, and SemVer releases.
   - Documentation for install, upgrade, backup, security model, and troubleshooting.

### Explicitly out of scope for v1

| Out of scope | Why | Revisit |
| ------------ | --- | ------- |
| Auto-fix / auto-merge | Human judgment stays in the loop; risk is too high. | After suggested fixes are proven and there is a strong safety model. |
| Code generation / agentic coding | Different product; dilutes the wedge. | Not planned. |
| Arbitrary host shell / unsandboxed code execution | Too risky for v1. | Opt-in sandboxed `tests.run`/`build.run` capability later, with isolation/resource caps. |
| A graph database as a required dependency | Postgres adjacency is enough for v1. | Revisit at large graph scale. |
| Multi-forge (GitLab/Gitea/Bitbucket) | GitHub first; the adapter interface is designed for later. | v1.1+ based on demand. |
| Kubernetes/Helm as the primary install | Compose is the reference; K8s is a later adapter. | After Compose operations are solid. |
| A hosted SaaS with customer code | Contradicts the privacy thesis. | A demo instance only. |
| A reviewer/pack marketplace | Local templates and packs first. | After the core is trusted. |
| A central billing/metering service | BYOK; no reseller. | Maybe an optional support offering. |
| Full IDE integration | The PR is the primary surface. | Later. |
| Air-gapped install | Valuable but a large ops surface; local models reduce the gap. | After v1. |
| Mobile app | Responsive web is enough. | Not planned. |
| i18n beyond English | Focus; add when there is demand. | v1.x. |

## MVP vs v1

We use **MVP** for the smallest build that proves the wedge, and **v1** for the first supported
release.

### MVP (the walking skeleton)

- Compose install with Postgres, one worker, and one UI.
- GitHub App setup and installation-level availability (no repo toggle).
- Provider add → `/models` discovery → one agent bound to a catalog model.
- Manual `/jury pr-review` on a PR → diff context → agent turn with one tool → one posted review.
- A user reply in the thread → a second turn with the session context alive.
- Guarded resolve after a satisfactory reply; a new reply reopens.
- Session/turn/tool-call records, a basic session timeline, and health/readiness.
- A deterministic test suite and a clean-machine install test.

The MVP proves the **agentic loop and the self-hosted runtime**, not the quality thesis. It must
include the session/reply/resolve path; a one-shot review is not the product.

### v1

The full in-scope list above. v1 is not "MVP plus a few features"; it is the first release we would
support for a team that depends on it.

## De-scoping rules

- If a capability does not improve the first review, the install, or the trust story, it waits.
- If a capability cannot be measured, it waits for the benchmark.
- If a capability requires a central service, it is out unless the owner explicitly overrides.
- If a capability creates a security risk we cannot mitigate, it does not ship.

## Change control

Any change to this scope requires:

1. an owner decision,
2. an update to this file and [`capabilities.md`](capabilities.md),
3. an ADR if it changes the architecture or the data model,
4. a line in [`../delivery/status.md`](../delivery/status.md).
