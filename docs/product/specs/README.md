# Product specs

One spec per capability, named `<slug>.md`. Use the template in
[`../../delivery/ways-of-working.md`](../../delivery/ways-of-working.md#3-the-spec-template) and the
`product-spec` skill.

A spec is required before implementation for any non-trivial capability. It states the problem,
users, behaviour, edge cases, non-goals, testable acceptance criteria, metrics, security/privacy,
failure modes, rollout, and open questions.

## Specs

| Spec | Capability | Status |
| ---- | ---------- | ------ |
| [`first-run-setup.md`](first-run-setup.md) | Install preflight, bootstrap token, first owner claim, GitHub App/installation, provider, first reviewer, first review, recovery | draft for owner review |
| [`agentic-review-sessions.md`](agentic-review-sessions.md) | Durable per-PR sessions, manual triggers, dynamic routing, resolution modes (`suggest` default), PR/branch review | draft for owner review |
| [`review-progress-and-completion.md`](review-progress-and-completion.md) | Check Run progress, completion signal, manual-trigger placeholder comment, failure/cancel behaviour | draft for owner review |
| [`jury-output.md`](jury-output.md) | Jury composition, finding provenance, deliberation, dissent, chair verdict, and output display | draft for owner review |
| [`standout-features.md`](standout-features.md) | Appeal, verified-fixed, noise budget, repo memory, signed receipt, presets, fix handoff, risk score, reactions, instruction compatibility | draft for owner review |
| [`provider-model-discovery.md`](provider-model-discovery.md) | Provider onboarding, `/models` discovery, model catalog, encrypted keys | draft for owner review |
| [`repo-knowledge-graph.md`](repo-knowledge-graph.md) | Incremental repository graph for branch review (v1.x) and context reuse | draft for owner review |
| [`session-capacity-and-visibility.md`](session-capacity-and-visibility.md) | Interface, concurrency, lifecycle, roles, visibility, budgets | draft for owner review |
| [`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md) | Reviewer catalog, repo bindings (required/default/capability), capability registry, SME/admin roles, fallback | draft for owner review |
| [`knowledge-system.md`](knowledge-system.md) | Skills/docs/live doc links, snapshots, grants, retrieval, citations | draft for owner review |
| [`v1-ui.md`](v1-ui.md) | V1 website scope: control plane, sessions, reviewers, capabilities, providers, audit | draft for owner review |
| [`shadow-mode.md`](shadow-mode.md) | B-01: run reviewers on live PRs without posting; compare with human review | draft — backlog |
| [`provider-allowlist.md`](provider-allowlist.md) | B-02: per-repo provider allowlist and data zones, egress ledger | draft — backlog |
| [`local-cli-review.md`](local-cli-review.md) | B-03: review a local/CI diff through the operator's instance | draft — backlog |
| [`large-pr-handling.md`](large-pr-handling.md) | B-04: coverage manifest, split proposals, no silent partial reviews | draft — backlog |
| [`reviewers-as-code.md`](reviewers-as-code.md) | B-05: reviewer definitions in git with approval preserved | draft — backlog |
| [`history-seeded-conventions.md`](history-seeded-conventions.md) | B-06: draft conventions pack mined from human review history | draft — backlog |
| [`mcp-surface.md`](mcp-surface.md) | B-07: read-only findings server and allowlisted reviewer tool servers | draft — backlog |
| [`pr-walkthrough.md`](pr-walkthrough.md) | B-08: opt-in PR overview comment, not a review | draft — backlog |

Specs marked *backlog* are candidates (see [`../capabilities.md`](../capabilities.md) section 13): not
committed, in no release tier, and not to be implemented until the owner promotes them.

The other specs follow the owner's 2026-11-15 capability list (Q-001) and the v1 scope in
[`../scope.md`](../scope.md). Do not implement until the owner approves the spec and the relevant
ADR.
