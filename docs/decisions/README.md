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
| [ADR-0003](ADR-0003-compose-first-deployment.md) | Docker Compose is the reference deployment | proposed | 2026-11-14 |
| [ADR-0004](ADR-0004-postgres-source-of-truth.md) | PostgreSQL is the source of truth | proposed | 2026-11-14 |
| [ADR-0005](ADR-0005-typescript-first-runtime.md) | TypeScript-first runtime for v1 | proposed | 2026-11-14 |
| [ADR-0006](ADR-0006-queue-and-stateless-workers.md) | Queue and stateless workers, not per-run actors | proposed | 2026-11-14 |
| [ADR-0007](ADR-0007-token-aware-context-and-retrieval.md) | Token-aware context and repository retrieval | proposed | 2026-11-14 |
| [ADR-0008](ADR-0008-roles-and-trust-boundaries.md) | Roles and trust boundaries | proposed | 2026-11-14 |
| [ADR-0009](ADR-0009-mit-no-cla.md) | MIT licence, no CLA | accepted | 2026-11-14 |
| [ADR-0010](ADR-0010-agent-runtime-harness.md) | Agent runtime harness | proposed | 2026-11-15 |
| [ADR-0011](ADR-0011-provider-model-discovery.md) | Provider and model discovery | proposed | 2026-11-15 |
| [ADR-0012](ADR-0012-pr-sessions-and-resolution.md) | PR sessions and agent-only resolution | proposed | 2026-11-15 |
| [ADR-0013](ADR-0013-manual-trigger-and-agent-routing.md) | Manual-first triggering and dynamic agent routing | proposed | 2026-11-15 |
| [ADR-0014](ADR-0014-repo-knowledge-graph.md) | Diff-first review with an incremental repository graph | proposed | 2026-11-15 |
| [ADR-0015](ADR-0015-session-capacity-and-visibility.md) | Session capacity, interface, roles, and visibility | proposed | 2026-11-15 |

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
