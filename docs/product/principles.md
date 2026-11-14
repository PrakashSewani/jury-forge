# Product principles

Principles are tie-breakers. When two options are defensible, the one that better satisfies the
higher principle wins. If a principle conflicts with the owner's explicit decision, the decision
wins and the principle is recorded as an exception.

## 1. The operator owns the instance

The default deployment runs on infrastructure the operator controls. There is no required central
service, no hidden phone-home, and no vendor account in the data path. Any optional cloud feature
must be separable and off by default.

**Tie-breaker:** choose the option that makes self-hosting easier, even if it makes our hosting
slightly harder.

## 2. The review must be trustworthy, not just fluent

A finding is a claim. It must be grounded in code, attributable to a reviewer and a model, and
auditable after the fact. We prefer a short, correct review over a long, confident one.

**Tie-breaker:** choose fewer, better findings over more coverage.

## 3. A prompt is not a security boundary

Anything from a pull request, repository file, knowledge pack, or model response is untrusted
data. Enforcement happens in code: validation, grounding, scope checks, publish policy, egress
policy, and authorization.

**Tie-breaker:** if a rule matters, enforce it outside the model.

## 4. Secure and private by default

No secrets in logs. No code to a provider without a visible policy. No broad credential that can be
redirected to an arbitrary URL. No telemetry without consent. No default that surprises a security
reviewer.

**Tie-breaker:** choose the safer default even when it costs a feature.

## 5. Boring operations win

A self-hosted product is judged by install, upgrade, backup, restore, and diagnosis. We invest in
those before we invest in another integration. A single container or Compose stack with Postgres is
the reference; complexity must earn its place.

**Tie-breaker:** choose the deployment with fewer moving parts.

## 6. Measure quality, don't assert it

Every review-quality claim needs a benchmark: labelled PRs, precision/recall, acceptance,
false-positive rate, latency, and cost. Prompt changes are experiments, not opinions.

**Tie-breaker:** choose the change we can measure over the change that sounds better.

## 7. Extensible at the boundaries, opinionated in the core

Forge, provider, queue, storage, and notification are interfaces. The review pipeline and policy
model are ours and should be coherent. Plugins extend; they do not fork the core.

**Tie-breaker:** choose the boundary that lets the operator replace a dependency without rewriting
the product.

## 8. Fail visibly and recoverably

A failed run is a first-class state with a reason, a timeline, and a next action. Silent
degradation is a bug. Every long-running operation has a lease, a heartbeat, a timeout, and a way
to cancel or retry.

**Tie-breaker:** choose the option that makes failure obvious and recoverable.

## 9. One vocabulary, one contract

The dashboard, API, docs, and tests use the same names and the same schemas. No screen prints a
machine code. No response drifts from its type. No feature ships with a second name.

**Tie-breaker:** choose the design that removes a translation layer.

## 10. Open source, no traps

MIT core, no CLA, no open-core bait, no licence key to self-host. Contributions are welcome, and
the project's governance is documented. A commercial offering, if any, must not subtract from the
open product.

**Tie-breaker:** choose the option a contributor can fork and run without asking permission.

## 11. Start with the wedge

Excellent GitHub PR review first. Every additional forge, policy surface, or integration must
justify itself against the wedge. A feature that makes the first review better beats a feature that
makes the product broader.

**Tie-breaker:** choose depth over breadth.

## 12. Documentation is a product surface

The install guide, the upgrade guide, the security model, and the ADR log are part of the product.
If it is not written down and linked, it does not exist. Docs are reviewed with the same rigour as
code.

**Tie-breaker:** choose the option that a new maintainer can understand from the repository.

## How to use these principles

- In a spec, name the principles the design serves.
- In an ADR, record the trade-off against the principle it bends.
- In a review, ask which principle the change strengthens or weakens.
- In a conflict, escalate to the owner with the trade-off spelled out; do not silently pick.
