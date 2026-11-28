# Architecture decision records

Every durable choice gets an ADR. ADRs are append-only ([ADR-0034](ADR-0034-adr-amendments.md)):
an accepted ADR's body is frozen. A change to what it decides is a new ADR that **amends** part of it
(`Amends:`) or **supersedes** all of it (`Supersedes:`). The older ADR gets only a dated pointer on
its status line, and the amending ADR wins where they differ. The index below is the source of truth
for status, and its **Amended by** column shows the chain.

## Process

1. Copy the template in [`../delivery/ways-of-working.md`](../delivery/ways-of-working.md#4-the-adr-template).
2. Number it `ADR-XXXX` (next free number).
3. State the context, options, decision, consequences, security/operations impact, evidence, and a
   revisit trigger.
4. Mark it `proposed`.
5. Get the owner's decision (or record a time-boxed default).
6. Mark it `accepted`, `rejected`, or `superseded by ADR-YYYY`.
7. If it amends or supersedes an older ADR, in the same pull request: add the one-clause pointer to
   the older ADR's status line (or mark it `superseded by ADR-YYYY`) and update the older row's
   **Amended by** column. Do not edit the older ADR's body (ADR-0034).
8. Update the affected docs and `docs/delivery/status.md`.

## Statuses

| Status | Meaning |
| ------ | ------- |
| `proposed` | Written, under review; not yet binding. |
| `accepted` | Binding. Implementation may rely on it. If the **Amended by** column names ADRs, read them with it; they win where the texts differ. ("Accepted as amended" is retired as a status by ADR-0034.) |
| `rejected` | Considered and declined; keep the reasoning. |
| `superseded` | Replaced by a newer ADR; kept for history. |
| `deprecated` | Still true but no longer recommended; migrate away. |

## Index

| ADR | Title | Status | Amended by | Date |
| --- | ----- | ------ | ---------- | ---- |
| [ADR-0001](ADR-0001-self-hosted-mit-vendor-neutral.md) | Self-hosted, MIT, vendor-neutral product | accepted | — | 2026-11-14 |
| [ADR-0002](ADR-0002-poc-is-reference-only.md) | The Cloudflare PoC is reference only | accepted | — | 2026-11-14 |
| [ADR-0003](ADR-0003-compose-first-deployment.md) | Docker Compose is the reference deployment | accepted | ADR-0022, ADR-0026 | 2026-11-14 |
| [ADR-0004](ADR-0004-postgres-source-of-truth.md) | PostgreSQL is the source of truth | accepted | ADR-0026 | 2026-11-14 |
| [ADR-0005](ADR-0005-typescript-first-runtime.md) | TypeScript-first runtime for v1 | accepted | — | 2026-11-14 |
| [ADR-0006](ADR-0006-queue-and-stateless-workers.md) | Queue and stateless workers, not per-run actors | accepted | ADR-0026 | 2026-11-14 |
| [ADR-0007](ADR-0007-token-aware-context-and-retrieval.md) | Token-aware context and repository retrieval | accepted | ADR-0025 | 2026-11-14 |
| [ADR-0008](ADR-0008-roles-and-trust-boundaries.md) | Roles and trust boundaries | accepted | ADR-0023, ADR-0035 | 2026-11-14 |
| [ADR-0009](ADR-0009-mit-no-cla.md) | MIT licence, no CLA | accepted | — | 2026-11-14 |
| [ADR-0010](ADR-0010-agent-runtime-harness.md) | Agent runtime: thin turn runner + `ai` SDK gateway (no harness in v1) | accepted | ADR-0026 | 2026-11-15 |
| [ADR-0011](ADR-0011-provider-model-discovery.md) | Provider and model discovery | accepted | ADR-0025, ADR-0029, ADR-0030 | 2026-11-15 |
| [ADR-0012](ADR-0012-pr-sessions-and-resolution.md) | PR sessions and resolution modes (`suggest` default) | accepted | ADR-0024, ADR-0028 | 2026-11-15 |
| [ADR-0013](ADR-0013-manual-trigger-and-agent-routing.md) | Manual-first triggering and dynamic agent routing | accepted | ADR-0024 | 2026-11-15 |
| [ADR-0014](ADR-0014-repo-knowledge-graph.md) | Diff-only PR review + branch review with an incremental graph (v1.1) | accepted | ADR-0025 | 2026-11-15 |
| [ADR-0015](ADR-0015-session-capacity-and-visibility.md) | Session capacity, interface, roles, and visibility | accepted | — | 2026-11-15 |
| [ADR-0016](ADR-0016-reviewer-catalog-and-roles.md) | Reviewer catalog, repo bindings, SME roles, and fallback (v1.2) | accepted | ADR-0023, ADR-0025 | 2026-11-15 |
| [ADR-0017](ADR-0017-knowledge-sources-and-retrieval.md) | Knowledge sources, snapshots, grants, and retrieval | accepted | ADR-0027 | 2026-11-15 |
| [ADR-0018](ADR-0018-release-tiering-and-quality-first-sequencing.md) | Release tiering and quality-first sequencing | accepted | ADR-0023, ADR-0025 | 2026-11-15 |
| [ADR-0019](ADR-0019-pr-review-context-tiers.md) | PR review context tiers (T1 bounded reads) — rejected; T0+ accepted instead (ADR-0025) | rejected | — | 2026-11-15 |
| [ADR-0020](ADR-0020-install-and-update-channel.md) | Install and update channel: signed release bundle, no pipe-to-shell | accepted | — | 2026-11-15 |
| [ADR-0021](ADR-0021-runtime-configured-origin.md) | Runtime-configured public origin (domain is a setup step) | accepted | — | 2026-11-15 |
| [ADR-0022](ADR-0022-helm-chart-in-v1.md) | Helm chart (moved to v1.2 by ADR-0023; component list amended by ADR-0031) | accepted | ADR-0023, ADR-0031 | 2026-11-15 |
| [ADR-0023](ADR-0023-product-direction.md) | Product direction: the auditable review layer, not a review platform | accepted | ADR-0025, ADR-0027, ADR-0028 | 2026-11-15 |
| [ADR-0024](ADR-0024-conversation-safety-and-finding-identity.md) | Conversation safety, finding identity, and evidence-gated resolution | accepted | — | 2026-11-16 |
| [ADR-0025](ADR-0025-v1-review-pipeline.md) | v1 review pipeline: T0+ context, verifier, code-first chair, model roles | accepted | ADR-0033 | 2026-11-16 |
| [ADR-0026](ADR-0026-v1-stack.md) | v1 stack: HTTP/UI, GitHub client, parsing, crypto, observability, testing, layout | accepted | ADR-0029, ADR-0030, ADR-0035 | 2026-11-16 |
| [ADR-0027](ADR-0027-instruction-files.md) | Repository instruction files: the S11 set, read from the base SHA | accepted | — | 2026-11-27 |
| [ADR-0028](ADR-0028-v1-resolution-rights.md) | v1 resolution rights: maintainers override, the owner decides critical findings | accepted | — | 2026-11-27 |
| [ADR-0029](ADR-0029-model-capability-probes.md) | Model capability probes: test a model before a reviewer trusts it | accepted | — | 2026-11-27 |
| [ADR-0030](ADR-0030-local-provider-egress.md) | Egress rule for local model servers: a pinned, owner-only exception for the `local` kind | accepted | — | 2026-11-27 |
| [ADR-0031](ADR-0031-helm-chart-runtime-shape.md) | The Helm chart (v1.2) runs the v1 runtime shape: no scheduler Deployment, cron in `worker` | accepted | — | 2026-11-28 |
| [ADR-0032](ADR-0032-finding-severity-scale.md) | Finding severity scale (`critical`/`high`/`medium`/`low`) and ranking weights (8/4/2/1) | accepted | ADR-0033 | 2026-11-28 |
| [ADR-0033](ADR-0033-comment-volume.md) | Comment volume: no default noise budget, an optional repo cap, a fixed 50-comment safety ceiling | accepted | — | 2026-11-28 |
| [ADR-0034](ADR-0034-adr-amendments.md) | How an accepted ADR changes: frozen body, a new ADR that amends or supersedes, a status-line pointer | accepted | — | 2026-11-28 |
| [ADR-0035](ADR-0035-tenant-key-on-every-table.md) | `org_id` on every tenant-owned table, enforced by composite foreign keys | accepted | — | 2026-11-28 |

**Phase 1a (2026-11-16):** the stack ADRs were accepted from
[`../architecture/technical-approach.md`](../architecture/technical-approach.md).

**G0 (2026-11-16):** the owner accepted the product and behaviour decisions. The stack ADRs (0003,
0004, 0005, 0006, 0010, 0020) were left `proposed` at G0 as input to Phase 1a and were accepted at
the end of Phase 1a the same day (above).

**Pre-stack ADR bodies:** ADR-0003, ADR-0004, ADR-0006, and ADR-0022 were written before the stack
was accepted, and their bodies still mention a scheduler, Redis/MinIO, object storage, Postgres 16+,
or row-level security. Their status lines record what was accepted (ADR-0022's chart list is
amended by ADR-0031), and
[`technical-approach.md`](../architecture/technical-approach.md) is the binding detail. The bodies
stay as history (ADRs are never rewritten); see the
[architecture audit](../analysis/architecture-audit-2026-11-28.md).

**Before ADR-0034 (2026-11-28):** some accepted ADR bodies were edited in place, for example by the
2026-11-16 T0+ pass over ADR-0007, ADR-0014, ADR-0016, ADR-0018, and ADR-0019. Those edits are not
reverted, and git history keeps the earlier text. From 2026-11-28, accepted bodies are frozen.
`technical-approach.md` is a living document and the binding detail of ADR-0026, so an ADR that
changes it is listed under ADR-0026 in the **Amended by** column.

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
