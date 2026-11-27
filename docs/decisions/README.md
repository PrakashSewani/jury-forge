# Architecture decision records

Every durable choice gets an ADR. ADRs are append-only: an accepted decision is superseded by a
new one, never rewritten. The index below is the source of truth for status.

## Process

1. Copy the template in [`../delivery/ways-of-working.md`](../delivery/ways-of-working.md#4-the-adr-template).
2. Number it `ADR-XXXX` (next free number).
3. State the context, options, decision, consequences, security/operations impact, evidence, and a
   revisit trigger.
4. Mark it `proposed`.
5. Get the owner's decision (or record a time-boxed default).
6. Mark it `accepted`, `rejected`, or `superseded by ADR-YYYY`.
7. Update the affected docs and `docs/delivery/status.md`.

## Statuses

| Status | Meaning |
| ------ | ------- |
| `proposed` | Written, under review; not yet binding. |
| `accepted` | Binding. Implementation may rely on it. |
| `rejected` | Considered and declined; keep the reasoning. |
| `superseded` | Replaced by a newer ADR; kept for history. |
| `deprecated` | Still true but no longer recommended; migrate away. |

## Index

| ADR | Title | Status | Date |
| --- | ----- | ------ | ---- |
| [ADR-0001](ADR-0001-self-hosted-mit-vendor-neutral.md) | Self-hosted, MIT, vendor-neutral product | accepted | 2026-11-14 |
| [ADR-0002](ADR-0002-poc-is-reference-only.md) | The Cloudflare PoC is reference only | accepted | 2026-11-14 |
| [ADR-0003](ADR-0003-compose-first-deployment.md) | Docker Compose is the reference deployment | accepted | 2026-11-14 |
| [ADR-0004](ADR-0004-postgres-source-of-truth.md) | PostgreSQL is the source of truth | accepted | 2026-11-14 |
| [ADR-0005](ADR-0005-typescript-first-runtime.md) | TypeScript-first runtime for v1 | accepted | 2026-11-14 |
| [ADR-0006](ADR-0006-queue-and-stateless-workers.md) | Queue and stateless workers, not per-run actors | accepted | 2026-11-14 |
| [ADR-0007](ADR-0007-token-aware-context-and-retrieval.md) | Token-aware context and repository retrieval | accepted | 2026-11-14 |
| [ADR-0008](ADR-0008-roles-and-trust-boundaries.md) | Roles and trust boundaries | accepted | 2026-11-14 |
| [ADR-0009](ADR-0009-mit-no-cla.md) | MIT licence, no CLA | accepted | 2026-11-14 |
| [ADR-0010](ADR-0010-agent-runtime-harness.md) | Agent runtime: thin turn runner + `ai` SDK gateway (no harness in v1) | accepted as amended | 2026-11-15 |
| [ADR-0011](ADR-0011-provider-model-discovery.md) | Provider and model discovery | accepted | 2026-11-15 |
| [ADR-0012](ADR-0012-pr-sessions-and-resolution.md) | PR sessions and resolution modes (`suggest` default) | accepted | 2026-11-15 |
| [ADR-0013](ADR-0013-manual-trigger-and-agent-routing.md) | Manual-first triggering and dynamic agent routing | accepted | 2026-11-15 |
| [ADR-0014](ADR-0014-repo-knowledge-graph.md) | Diff-only PR review + branch review with an incremental graph (v1.1) | accepted | 2026-11-15 |
| [ADR-0015](ADR-0015-session-capacity-and-visibility.md) | Session capacity, interface, roles, and visibility | accepted | 2026-11-15 |
| [ADR-0016](ADR-0016-reviewer-catalog-and-roles.md) | Reviewer catalog, repo bindings, SME roles, and fallback (v1.2) | accepted | 2026-11-15 |
| [ADR-0017](ADR-0017-knowledge-sources-and-retrieval.md) | Knowledge sources, snapshots, grants, and retrieval | accepted | 2026-11-15 |
| [ADR-0018](ADR-0018-release-tiering-and-quality-first-sequencing.md) | Release tiering and quality-first sequencing | accepted | 2026-11-15 |
| [ADR-0019](ADR-0019-pr-review-context-tiers.md) | PR review context tiers (T1 bounded reads) — rejected; T0+ accepted instead (ADR-0025) | rejected | 2026-11-15 |
| [ADR-0020](ADR-0020-install-and-update-channel.md) | Install and update channel: signed release bundle, no pipe-to-shell | accepted | 2026-11-15 |
| [ADR-0021](ADR-0021-runtime-configured-origin.md) | Runtime-configured public origin (domain is a setup step) | accepted | 2026-11-15 |
| [ADR-0022](ADR-0022-helm-chart-in-v1.md) | Helm chart (moved to v1.2 by ADR-0023) | accepted as amended | 2026-11-15 |
| [ADR-0023](ADR-0023-product-direction.md) | Product direction: the auditable review layer, not a review platform | accepted | 2026-11-15 |
| [ADR-0024](ADR-0024-conversation-safety-and-finding-identity.md) | Conversation safety, finding identity, and evidence-gated resolution | accepted | 2026-11-16 |
| [ADR-0025](ADR-0025-v1-review-pipeline.md) | v1 review pipeline: T0+ context, verifier, code-first chair, model roles | accepted | 2026-11-16 |
| [ADR-0026](ADR-0026-v1-stack.md) | v1 stack: HTTP/UI, GitHub client, parsing, crypto, observability, testing, layout | accepted | 2026-11-16 |
| [ADR-0027](ADR-0027-instruction-files.md) | Repository instruction files: the S11 set, read from the base SHA | accepted | 2026-11-27 |
| [ADR-0028](ADR-0028-v1-resolution-rights.md) | v1 resolution rights: maintainers override, the owner decides critical findings | accepted | 2026-11-27 |
| [ADR-0029](ADR-0029-model-capability-probes.md) | Model capability probes: test a model before a reviewer trusts it | accepted | 2026-11-27 |
| [ADR-0030](ADR-0030-local-provider-egress.md) | Egress rule for local model servers: a pinned, owner-only exception for the `local` kind | accepted | 2026-11-27 |
| [ADR-0031](ADR-0031-helm-chart-runtime-shape.md) | The Helm chart (v1.2) runs the v1 runtime shape: no scheduler Deployment, cron in `worker` | proposed | 2026-11-28 |
| [ADR-0032](ADR-0032-finding-severity-scale.md) | Finding severity scale (`critical`/`high`/`medium`/`low`) and ranking weights (8/4/2/1) | accepted | 2026-11-28 |

**Phase 1a (2026-11-16):** the stack ADRs were accepted from
[`../architecture/technical-approach.md`](../architecture/technical-approach.md).

**G0 (2026-11-16):** the owner accepted the product and behaviour decisions. The stack ADRs (0003,
0004, 0005, 0006, 0010, 0020) were left `proposed` at G0 as input to Phase 1a and were accepted at
the end of Phase 1a the same day (above).

**Pre-stack ADR bodies:** ADR-0003, ADR-0004, ADR-0006, and ADR-0022 were written before the stack
was accepted, and their bodies still mention a scheduler, Redis/MinIO, object storage, Postgres 16+,
or row-level security. Their status lines record what was accepted, and
[`technical-approach.md`](../architecture/technical-approach.md) is the binding detail. The bodies
stay as history (ADRs are never rewritten); see the
[architecture audit](../analysis/architecture-audit-2026-11-28.md).

## Conventions

- One decision per ADR. If it needs two decisions, write two.
- Include the options you rejected and why; the rejection is often more valuable than the choice.
- Record the security and operational consequences explicitly.
- Record a revisit trigger (a date, a scale threshold, a provider change, a benchmark result).
- Link the code/tests that enforce the decision once they exist.
- Do not use an ADR for a reversible implementation detail; use the spec or a code comment.

## Proposed vs accepted

A `proposed` ADR is a recommendation. It can guide a spike but not a shipped feature. The owner
accepts it at the relevant gate. If implementation starts before acceptance, the ADR must say so
and the risk is recorded in `docs/delivery/status.md`.
