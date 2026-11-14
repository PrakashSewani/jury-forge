# Scope

Scope is a decision, not a wish list. This page defines the first release (v1) and the explicit
non-goals. It will be revised when the owner provides the final capability list.

## v1: the first release

**Goal:** a self-hosted, MIT-licensed GitHub PR review jury that a small team can install,
operate, trust, and measure.

### In scope

1. **Install and operate**
   - One-command Docker Compose install on Linux (amd64 and arm64).
   - PostgreSQL as the source of truth; a durable job queue and at least one worker.
   - Environment validation, health/readiness, a support bundle, and documented backup/restore.
   - Upgrade path with expand/contract migrations and a rollback procedure.

2. **Connect**
   - GitHub App (manifest flow) for GitHub.com; GitHub Enterprise Server if the install spike is
     clean.
   - Multiple installations per instance (one org per deployment is still the default).
   - Repository discovery, enablement, and per-repo reviewer policy.

3. **Review**
   - User-defined reviewers with instructions, rules, model, provider, and parameters.
   - Reviewer templates and versioned prompts (draft → active, rollback).
   - Parallel execution with per-provider concurrency limits.
   - Diff context, repository instructions, path scope, and reference context.
   - Knowledge packs with immutable versions, grants, and provenance.
   - Grounding: every inline finding must cite code that exists at the reviewed SHA.
   - Cross-reviewer de-duplication and an optional consensus/chair step.
   - One consolidated review with inline comments, overflow summary, and resolution buckets.
   - Per-finding confidence, evidence, and optional suggested fixes.
   - Publish policy: comment by default; request changes / check conclusion per repo policy.
   - Preview/approve mode for new or sensitive reviewers.
   - Suppression rules and per-finding feedback.

4. **Control**
   - Roles: owner, admin, maintainer, viewer, auditor (scoped to installation/repo).
   - Audit stream with export.
   - Token and cost budgets with pre-run estimates and alerts.
   - Data retention and deletion.
   - Secret redaction before prompts leave the perimeter.
   - Egress policy and key-to-provider binding.

5. **Measure**
   - An evaluation benchmark of labelled PRs with precision/recall, acceptance, and false-positive
     metrics.
   - Per-reviewer scorecards.
   - OpenTelemetry traces, Prometheus metrics, structured logs, and cost/latency dashboards.
   - A dogfood repository that runs the product on itself.

6. **Deliver**
   - MIT licence, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
   - Signed container images, SBOM, changelog, and SemVer releases.
   - Documentation for install, upgrade, backup, security model, and troubleshooting.

### Explicitly out of scope for v1

| Out of scope | Why | Revisit |
| ------------ | --- | ------- |
| Auto-fix / auto-merge | Human judgment stays in the loop; risk is too high. | After suggested fixes are proven and there is a strong safety model. |
| Code generation / agentic coding | Different product; dilutes the wedge. | Not planned. |
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

- Compose install with Postgres and one worker.
- GitHub App setup and one repository.
- One reviewer, one provider, one prompt.
- Webhook → fetch diff → call model → parse → post one review.
- A run record, a basic dashboard, and a health check.
- A deterministic test suite and a clean-machine install test.

The MVP is deliberately small. It proves that the new runtime and the pipeline can replace the PoC
end to end. It does **not** prove the quality thesis; the next milestone does.

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
