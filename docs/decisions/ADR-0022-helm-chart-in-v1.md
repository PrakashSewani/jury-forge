# ADR-0022: Helm chart as a v1 deployment target

- Status: accepted as amended (G0, 2026-11-16): Helm ships in **v1.2**, not v1 (ADR-0023); the
  component list and support matrix are amended by ADR-0031 (2026-11-28): no scheduler Deployment,
  cron in `worker`, Postgres 17 (16 tested), S3 optional
- Date: 2026-11-15
- Owners: operations + architecture
- Supersedes: the "Kubernetes/Helm after v1" deferral in ADR-0003 (Compose stays the reference)
- Revisit trigger: the chart's support cost exceeds its adoption, or a Kubernetes API deprecation
  forces a version-policy change.

## Context

ADR-0003 made Docker Compose the reference and deferred Kubernetes/Helm. Platform teams (persona P1)
often cannot accept a second host-level deployment; they already run clusters, policies, and secret
stores. Helm was listed as a post-v1 adapter because it is an extra artefact with its own test
matrix and support promise.

The owner decided (2026-11-15, "Option 2") that **advanced deployment models may be part of v1**:
models B and C were already v1, and E (Kubernetes/Helm) now ships in v1. Air-gapped (F) stays
out of v1 — it is a different support promise (no egress, offline upgrades), not a packaging choice.

## Options

1. **Keep Helm post-v1.** Cheapest; excludes platform teams from v1.
2. **Helm chart in v1, Compose remains the reference.** One chart over the same images and the same
   runtime contract; two supported install paths, one product.
3. **Helm as the primary/most-supported path.** Reverses ADR-0003 and hurts the small-team
   self-hoster; rejected.
4. **Operator/CRD instead of a chart.** Powerful, much larger surface, needs a controller; rejected
   for v1.

## Decision

Option 2.

- Compose remains the **reference** and the install path the product is developed against.
- The Helm chart is a **first-class v1 artefact**, versioned and released with the images.
- The chart deploys **app, worker, scheduler, and a migration Job only**. It does **not** bundle
  Postgres, Redis, or object storage; those are `DATABASE_URL`/S3/reference-or-external. No
  StatefulSets, no PVCs for product data.
- Scheduler is a single-replica Deployment guarded by a Postgres advisory lock (not a CronJob).
- Secrets come from an existing Secret (`existingSecret`) or an external secret operator; the chart
  never renders plaintext keys by default.
- The public origin follows ADR-0021: `values.origin` freezes it, otherwise setup runs over
  `kubectl port-forward` on loopback and stores it in Postgres.
- **TLS terminates at the ingress** (cert-manager or a pre-created TLS secret). Caddy and on-demand
  TLS are not part of the chart. Ingress rules keep `/api/webhooks/*` and `/api/auth/*` out of any
  SSO/oauth2-proxy middleware, preserve the body, and allow long SSE timeouts.
- The chart ships a `helm test` that checks `/readyz`, a PodDisruptionBudget for workers, a
  default-deny NetworkPolicy with explicit egress, and a non-root/read-only `securityContext`.
- Supported matrix: **Kubernetes 1.29+ (n-2 window kept current each release) and Helm 3.14+**,
  amd64 + arm64, same Postgres 16+ and object storage as Compose.

## Consequences

**Easier:** platform teams install into an existing cluster with their policies and secret store;
HA becomes a replica count; upgrades are `helm upgrade --atomic`.

**Harder:** a second tested install path; chart values become an API; two upgrade/rollback stories
(migration Job hooks vs one-shot Compose command); Kubernetes version churn; air-gapped is still
not promised.

**Constraints:** no bundled database in the chart; no on-demand TLS; the migration Job runs as a
pre-install/pre-upgrade hook and must be idempotent; the chart must not require cluster-admin.

## Security and operations

- Default-deny NetworkPolicy; explicit egress to GitHub, the database, object storage, and provider
  endpoints only.
- `securityContext`: non-root, `readOnlyRootFilesystem`, `drop: [ALL]`, no privilege escalation.
- The chart never accepts a plaintext secret in `values.yaml`; `existingSecret` keys are documented
  and validated at render time.
- The migration Job has no retries beyond the configured backoff and fails the release if it
  cannot complete (`--atomic`).
- Rollback: `helm rollback` plus the ADR-0003 rule (code rollback only before a contract migration;
  data rollback is restore-from-backup).
- The ingress must not rewrite the webhook body or buffer SSE; this is a documented, tested
  annotation set for common controllers (ingress-nginx, Traefik).
- Chart, README, values schema (`values.schema.json`), and an e2e test on `kind` are release-gated.

## Evidence

- `docs/architecture/deployment.md` §1 model E and §4 E.
- `docs/architecture/operations.md` support matrix and install section.
- `docs/delivery/roadmap.md` Phase 4 and G4.
- Owner decision 2026-11-15 (Option 2); ADR-0003 revisit trigger.

## Follow-ups

- Spike: install on `kind` and on one managed cluster; time to first review; confirm migration Job
  ordering and webhook ingress behaviour.
- Decide the ingress-controller test matrix (ingress-nginx first; Traefik documented).
- Publish a values reference and a minimal/HA values example.
- Confirm the Kubernetes version policy and the upgrade test (n-1 → n).
