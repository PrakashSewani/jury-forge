---
name: self-host-ops
description: Review a Jury Forge design for self-hosted operability and security: install, upgrade, backup, restore, scaling, egress, secrets, and troubleshooting. Use when proposing infrastructure, deployment, auth, storage, or any change an operator must run.
---

# Self-host ops

A self-hosted product is judged on the day something goes wrong. Use this skill to pressure-test a
design before it becomes code.

## The operator's questions

1. How do I install it on a clean Linux host?
2. How do I upgrade without downtime or data loss?
3. How do I back up and restore it? When was the last drill?
4. How do I know it is healthy? What alerts should I set?
5. How do I rotate a credential?
6. How do I diagnose a failed review?
7. What egress does it need? What inbound?
8. What happens when the database/queue/object storage/provider is down?
9. How do I scale workers? What is the bottleneck?
10. How do I delete my data?

If a design cannot answer these, it is not ready.

## Install checklist

- [ ] One documented path (Compose) that works on a clean host.
- [ ] `.env.example` with every variable, no secrets.
- [ ] Startup validates config and refuses weak/missing critical values.
- [ ] TLS via a reverse proxy; `PUBLIC_URL` documented.
- [ ] Database not exposed publicly; least-privilege role.
- [ ] Migrations run as a one-shot job, not on every replica.
- [ ] First admin/bootstrap flow is explicit and rate-limited.
- [ ] Health and readiness endpoints.
- [ ] A smoke test: connect a repo, open a PR, see a review.
- [ ] Time-to-first-review measured and documented.

## Upgrade checklist

- [ ] Pre-upgrade backup is automatic or required.
- [ ] Expand/contract migrations; app supports current + previous schema during the window.
- [ ] Migrations are versioned, locked, and resumable.
- [ ] Previous image is available for rollback.
- [ ] Data rollback is restore-from-backup, documented and tested.
- [ ] Release notes include migration notes and breaking changes.
- [ ] A post-upgrade `doctor` and smoke review.

## Backup/restore checklist

- [ ] What is backed up: database, object storage, config, encryption key (separately).
- [ ] Schedule and retention.
- [ ] Encryption at rest for backups.
- [ ] Restore procedure tested in a scratch environment.
- [ ] RPO/RTO stated.
- [ ] A drill is part of the release checklist.

## Security checklist

- [ ] Secrets via env/files/secret store; never in the image or repo.
- [ ] Encryption at rest for credentials; envelope encryption and rotation.
- [ ] Egress allowlist; block private/link-local/loopback/metadata.
- [ ] Credential bound to an allowed origin.
- [ ] Roles and tenant scoping; authz test per mutation.
- [ ] Session revocation and re-auth for sensitive actions.
- [ ] Security headers/CSP; TLS/HSTS.
- [ ] Rate limits and budgets.
- [ ] Audit stream with export.
- [ ] Container non-root, read-only FS where possible, no privileged mode.
- [ ] Signed images, SBOM, dependency review.

## Observability checklist

- [ ] `/healthz` and `/readyz` with dependency breakdown.
- [ ] Metrics with bounded cardinality.
- [ ] Traces per run/step/provider call.
- [ ] Structured logs with request/run ids, no secrets.
- [ ] Run timeline for debugging.
- [ ] Dashboards and alerts; SLOs.
- [ ] Support bundle (`doctor --bundle`) redacted.
- [ ] No telemetry to the project by default.

## Scaling checklist

- [ ] App and workers stateless; no sticky sessions.
- [ ] Queue backpressure and per-provider concurrency limits.
- [ ] Per-tenant fairness.
- [ ] Database indexes and connection pooling.
- [ ] Object storage for large artefacts.
- [ ] Index workers separate from review workers.
- [ ] Load test at 10× expected volume.

## Failure-mode review

For every new component, ask:

| Failure | Behavior | User sees | Recovery |
| ------- | -------- | --------- | -------- |
| Process crash | | | |
| DB down | | | |
| Queue down | | | |
| Object storage down | | | |
| Provider down/429 | | | |
| Forge down/429 | | | |
| Disk full | | | |
| Clock skew | | | |
| Bad migration | | | |
| Lost encryption key | | | |

## Anti-patterns

- "It works on my machine" as the install story.
- Migrations on app startup across replicas.
- A required managed service.
- Secrets in `.env` committed or baked into the image.
- Exposing Postgres/Redis/MinIO publicly.
- Trusting `X-Forwarded-*` from any source.
- No backup/restore drill.
- Health that always returns OK.
- A design that needs a manual DB edit to recover.
