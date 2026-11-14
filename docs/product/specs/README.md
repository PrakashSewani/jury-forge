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
| [`agentic-review-sessions.md`](agentic-review-sessions.md) | Durable per-PR sessions, manual triggers, dynamic routing, agent-only resolution, diff/context review | draft for owner review |
| [`provider-model-discovery.md`](provider-model-discovery.md) | Provider onboarding, `/models` discovery, model catalog, encrypted keys | draft for owner review |
| [`repo-knowledge-graph.md`](repo-knowledge-graph.md) | Incremental repository graph for diff/context review and context reuse | draft for owner review |
| [`session-capacity-and-visibility.md`](session-capacity-and-visibility.md) | Interface, concurrency, lifecycle, roles, visibility, budgets | draft for owner review |
| [`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md) | Reviewer catalog, repo bindings, required/optional, SME/admin roles, fallback | draft for owner review |

The specs follow the owner's 2026-11-15 capability list (Q-001) and the v1 scope in
[`../scope.md`](../scope.md). Do not implement until the owner approves the spec and the relevant
ADR.
