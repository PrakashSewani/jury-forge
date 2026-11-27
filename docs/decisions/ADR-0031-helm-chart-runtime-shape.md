# ADR-0031: The Helm chart runs the v1 runtime shape

- Status: proposed (2026-11-28, architecture audit Q-B; needs the owner's decision before the v1.2
  chart is specified)
- Date: 2026-11-28
- Owners: operations + architecture
- Supersedes: — (amends ADR-0022's component list and support matrix only)
- Revisit trigger: the v1.2 chart spike, or a cron or migration behaviour that cannot run inside a
  `worker` Deployment.

## Context

ADR-0022 (accepted as amended: Helm moves to v1.2 per ADR-0023) was written on 2026-11-15, the day
before the stack was accepted. Its decision says the chart deploys "app, worker, scheduler, and a
migration Job", with "a single-replica Deployment guarded by a Postgres advisory lock" for the
scheduler. It names Redis and object storage as external dependencies and "Postgres 16+".

The accepted stack ([`technical-approach.md`](../architecture/technical-approach.md), ADR-0026) has
no scheduler:

- cron runs inside `worker` through graphile-worker (§2, §3.3);
- there is no Redis;
- artefacts are bounded `bytea` in Postgres, with an optional S3 adapter in v1.2 (§2, §9);
- Postgres 17 is bundled and 16 is tested for bring-your-own (§3.2, TQ-4).

Compose and the chart run the same image and must keep the same runtime contract (ADR-0022:
"over the same images and the same runtime contract"). As written, ADR-0022 would need a
`scheduler` role the image does not have. The architecture audit
([`../analysis/architecture-audit-2026-11-28.md`](../analysis/architecture-audit-2026-11-28.md), Q-B)
found this; nothing accepted resolves it.

## Options

1. **Keep a scheduler Deployment in the chart.** It needs a new `ROLE=scheduler` that Compose does
   not have, so the two install paths diverge. It also duplicates graphile-worker's cron.
2. **The chart runs the Compose roles.** An `app` Deployment, a `worker` Deployment with cron inside
   it, and a migration Job. External Postgres 17 (16 tested); the S3 adapter is optional. One
   runtime contract.
3. **Run cron as Kubernetes CronJobs.** That is a second scheduling mechanism, and the CronJobs would
   need their own idempotency against graphile-worker's queue.

## Decision

Option 2 (proposed). The v1.2 chart deploys:

- an `app` Deployment (`ROLE=app`);
- a `worker` Deployment (`ROLE=worker`), whose graphile-worker cron runs the reconciler, retention,
  stalled-session, and reaction-poll jobs;
- a pre-install/pre-upgrade migration Job.

It needs an external PostgreSQL 17 (16 tested) and no Redis; the S3 artefact adapter is an optional
value. Everything else in ADR-0022 stands: no bundled state, ingress TLS, the origin rule,
`existingSecret`, NetworkPolicy, `securityContext`, `helm test`, and the `kind` e2e gate.

## Consequences

- Compose and Helm share one image, one role set, and one runtime contract; the chart adds no role.
- Scaling `worker` must not duplicate cron ticks. That depends on graphile-worker firing each tick
  once across workers, which the M1.1 two-worker test must show (audit Q-E). If it fails, this ADR
  is revisited before the chart is built.
- The ADR-0022 support matrix changes from "Postgres 16+ and object storage" to "Postgres 17 (16
  tested); S3 optional".

## Security and operations

- No new component and no new secret. The NetworkPolicy egress list shrinks: there is no Redis, and
  object storage applies only when the S3 adapter is configured.
- The PodDisruptionBudget for workers stays. No advisory-lock leader election is needed, because
  graphile-worker handles cron and job locking.

## Evidence

- ADR-0022 §Decision; technical-approach §2, §3.2, §3.3, §9, TQ-4; ADR-0023 (Helm in v1.2).
- `architecture/deployment.md` §4 E, which no longer restates ADR-0022's component list.

## Follow-ups

- Owner decision: accept, amend, or reject.
- If accepted: add a status-line pointer on ADR-0022 to this ADR, and use this shape when the v1.2
  chart is specified.
