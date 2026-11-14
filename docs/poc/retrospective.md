# PoC retrospective

This is an honest reading of the proof of concept, not a victory lap. The point is to extract
lessons that change what we build.

## What worked

### 1. The product thesis is sound

A configurable jury of specialist reviewers, each with its own model and instructions, producing
one consolidated review, is a better mental model than a single opaque bot. The PoC's reviewers,
templates, per-repo scope, knowledge packs, and manual try runs all point in the same direction:
the operator wants to shape the review, not just receive it.

### 2. Documentation as an operating system

The PoC's `AGENTS.md` rules — ask first, docs before code, record decisions, keep the tracker
honest — produced an unusually coherent repository. A new reader can reconstruct why almost
everything exists. The decision log is the single most reusable artefact.

### 3. Contract discipline

Making zod schemas the only source of API types, validating responses on both sides, and keeping
one error taxonomy eliminated a whole class of drift bugs. This is table stakes for the new
product.

### 4. The run as a state machine

Persisting each phase and resuming on an alarm is the right shape for a multi-minute review. The
new product should keep the shape (durable, resumable, idempotent per step) while replacing the
runtime.

### 5. Product-shape details that punch above their weight

- **Readiness computed from the database** rather than stored as onboarding state.
- **Try a reviewer** with no GitHub publish — a safe way to evaluate a prompt.
- **Reviewer templates** as prefill, not as a marketplace.
- **Scope preview** against the newest run's changed files before saving patterns.
- **Resolution buckets** (Resolved / Still present / New).
- **Knowledge packs with immutable versions and provenance** (`slug@hash`, injected bytes).
- **A human error taxonomy** — no screen ever prints `request_failed`.
- **A measured accessibility harness**, not a vibe check.
- **A seeded local instance** that makes demos and UI tests realistic.

### 6. Delivery hygiene

Small PRs, a single check command, docs with each slice, and mutation-checked fixes produced a
repository that stayed understandable under rapid change.

### 7. The live loop actually worked

The live instance produced one real auto review on 2026-10-19: 8 inline findings on a PR, all 8
valid against the code, including command injection, SSRF, path traversal, broken authz, an unkeyed
signature, and a leaked key. The Testing reviewer failed with a provider 401 in that run; the
operator fixed the configuration and used **Try a reviewer** to re-run it, producing 9 more valid
findings without publishing anything. That is the product working as intended — and a clear
picture of the reliability, attribution, and context gaps that remain. See
[`live-instance.md`](live-instance.md).

## What did not work

### 1. The runtime dictated the product

Cloudflare's free plan gave the PoC a zero-cost deployment, but the 10 ms CPU ceiling, 50
subrequests, byte budgets, and one-DO-per-run model became product limits. The architecture could
not answer "what would a great review need?" because the answer was often "not on this runtime".

### 2. The review was a prompt, not a pipeline

The engine fetched a diff, packed it into a prompt, called N models in parallel, parsed JSON, and
posted comments. There was no code index, no retrieval beyond path globs, no verification of a
finding against the code, no consensus or disagreement handling, no confidence, and no evaluation.
"Better than the PoC" has to mean a real review pipeline.

### 3. Security was mostly perimeter security

Credential encryption, signature verification, and same-origin checks were solid. But PR content
is untrusted input, and the PoC piped it into prompts without a trust boundary, without secret
redaction, and without prompt-injection defenses. The provider base URL was an arbitrary outbound
request. The access model was "anyone with installation access is the owner".

### 4. Reliability was assumed, not engineered

There was no queue, no lease, no heartbeat, no watchdog, no dead-letter queue, no cancellation, and
no exactly-once publish. A lost alarm or a failed final write could leave a run `running` forever.
The tests were excellent at the happy path and thin at the failure boundaries.

### 5. Documentation drifted

D-030 retired `main`, but the architecture and development docs still described the old release
flow. The decision log was append-only but not periodically reconciled. A docs-first process still
needs a consistency check.

### 6. The economics were invisible

Token usage was captured, but there was no price table, per-run cost, budget guard, or dashboard.
Parallel reviewers multiplied the cost of the same diff, and nothing stopped an operator from
burning spend on a stale run.

### 7. "Self-hosted" meant "Cloudflare account"

The deploy was one command, which was excellent, but it was one command *for Cloudflare*. The
product could not run on a VPS, in a homelab, in an air-gapped environment, or in a company's
Kubernetes cluster. That is not self-hosted in the sense most buyers mean.

## The ten lessons we will encode

1. **Choose the runtime for the product, not the product for the runtime.** Container-first,
   vendor-neutral, replaceable components.
2. **A review is a pipeline, not a prompt.** Context assembly, retrieval, role execution,
   grounding, verification, consensus, publish, evaluate.
3. **Token and cost budgets, not byte budgets.** Every model has a window and a price.
4. **Untrusted input is a first-class threat.** PR content, repo files, packs, and provider output
   are data with a trust label, never instructions.
5. **Every phase is idempotent and observable.** Leases, heartbeats, retries, DLQ, cancellation,
   exactly-once publish via an idempotency key.
6. **Multi-user from the boundary, even if the MVP is single-operator.** Roles, membership,
   scoping, and audit are cheaper to design now than to retrofit.
7. **Make quality measurable.** Golden PRs, precision/recall, acceptance rate, false-positive
   rate, time-to-first-finding, cost per review.
8. **Documentation needs a consistency check.** Link decisions to tests and review the index at
   every release.
9. **Security is a product feature.** Secret redaction, SSRF defenses, egress controls, audit
   export, data retention.
10. **A great demo is not a great product.** The PoC's local seed and layout harness were
    excellent; the new product needs the same care for install, upgrade, backup, and diagnosis.

## The sentence to keep on the wall

> The PoC proved that people want a review jury they control. The next product must prove that a
> self-hosted jury can review *better*, not just differently.
