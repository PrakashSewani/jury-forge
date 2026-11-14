# Deployment models

Jury Forge is container-first and self-hosted. This document defines the supported deployment
models, their trade-offs, and the reference topology. The final choice is an ADR.

## 1. Reference: Docker Compose on a single host

The default for a team that wants a working instance in under an hour.

```
┌─────────────────────────────────────────────────────────────┐
│ Host (Linux, Docker Engine + Compose)                       │
│                                                             │
│  caddy (TLS, reverse proxy)                                 │
│    ├── app        (web/API + SPA)      × 1–N                │
│    ├── worker     (review + index)     × 1–N                │
│    ├── scheduler  (janitor, retention) × 1                  │
│    ├── postgres   (state)              × 1                  │
│    ├── redis      (optional queue)     × 1                  │
│    └── minio      (optional artefacts) × 1                  │
│                                                             │
│  Volumes: postgres-data, minio-data, caddy-data             │
└─────────────────────────────────────────────────────────────┘
```

**Pros:** one host, one compose file, easy backup, easy TLS, no cloud account, works on a VPS,
homelab, or on-prem VM.

**Cons:** single point of failure unless the host is redundant; vertical scaling only; the
operator owns OS patching.

**When to choose:** v1 default; teams up to a few hundred PRs/day; pilots; air-gapped-ish setups.

## 2. Single all-in-one container

One image with app, worker, scheduler, and an embedded Postgres-compatible store (or SQLite for a
single-user mode).

**Pros:** the easiest possible demo and personal install; one command; no Compose.

**Cons:** not recommended for teams; backups and upgrades are less clean; embedded DB limits
concurrency and scale.

**When to choose:** evaluation, personal use, a small team that values simplicity over scale.
Treat it as a supported but limited mode, clearly labelled.

## 3. Compose with external managed services

The same Compose stack, but `DATABASE_URL` and object storage point at the operator's managed
Postgres and S3-compatible bucket.

**Pros:** durable state managed by the operator's platform; easier backups and HA; no local
database to run.

**Cons:** more configuration; network egress and TLS; provider-specific quirks.

**When to choose:** teams with an existing database platform; production deployments that need HA.

## 4. Kubernetes / Helm (later)

App, worker, scheduler as Deployments; a Job/CronJob for migrations; Postgres via an operator or an
external service; object storage via S3; secrets via the cluster's secret store.

**Pros:** horizontal scaling, rolling upgrades, scheduling, policy.

**Cons:** a significant operational surface; not the first release; easy to over-engineer.

**When to choose:** platform teams that already run Kubernetes; large installations. Ship a Helm
chart only after Compose operations are proven.

## 5. Air-gapped / offline (TBD)

- Mirror images and dependencies into the environment.
- Use a local model server (OpenAI-compatible) for reviews.
- Forge connectivity is still required unless the forge is self-hosted (GHES/Gitea) inside the
  network.
- No telemetry; licence/update checks must not exist.

**When to choose:** regulated or classified environments. Requires a dedicated install test.

## 6. Reference topology (Compose)

### Services

| Service | Image | Replicas | Notes |
| ------- | ----- | -------- | ----- |
| `caddy` | `caddy:2` | 1 | TLS, reverse proxy, security headers. |
| `app` | `jury-forge/app:VERSION` | 1–3 | Stateless; `/healthz`, `/readyz`. |
| `worker` | `jury-forge/worker:VERSION` | 1–N | Review + index; no inbound HTTP except metrics/health. |
| `scheduler` | `jury-forge/worker:VERSION` | 1 | Janitor, retention, budgets; leader election or a DB lock. |
| `postgres` | `postgres:16` | 1 | Persistent volume; not exposed publicly. |
| `redis` | `redis:7` | 1 | Optional; only if `QUEUE_DRIVER=redis`. |
| `minio` | `minio/minio` | 1 | Optional; S3-compatible artefacts. |

### Networks

- `edge`: caddy + app.
- `internal`: app + worker + scheduler + postgres + redis + minio.
- Only `caddy` publishes ports (80/443). Postgres/Redis/MinIO are internal.

### Volumes

- `postgres-data` — the database.
- `object-data` — artefacts if using local/MinIO.
- `caddy-data` — certificates.
- `backups` — a host-mounted backup target (or external).

### Resource sizing (starting point)

| Deployment | vCPU | RAM | Disk | Notes |
| ---------- | ---- | --- | ---- | ----- |
| Personal / demo | 2 | 4 GB | 40 GB | All-in-one or Compose without MinIO. |
| Small team | 4 | 8 GB | 100 GB | Compose, Postgres, 2 workers. |
| Team + index | 8 | 16 GB | 250 GB | Dedicated index worker, object storage. |
| Larger | 16+ | 32 GB+ | 500 GB+ | External Postgres, S3, multiple workers. |

These are estimates; the load test sets the real numbers.

## 7. TLS and reverse proxy

- Terminate TLS at Caddy/Traefik/Nginx or the operator's load balancer.
- Set `PUBLIC_URL` to the external HTTPS origin.
- Configure `TRUSTED_PROXIES` so forwarded headers are only trusted from the proxy.
- Security headers: HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`.
- Webhook path must be reachable from GitHub; do not put it behind SSO.
- Dashboard can be behind SSO at the proxy as an extra layer, but the app has its own auth.

## 8. Identity

- v1: GitHub OAuth (same app as the integration or a separate OAuth app) + app roles.
- Later: OIDC/SSO (Keycloak, Authentik, Entra ID, Okta) with group-to-role mapping.
- The proxy may provide an identity header, but the app must not trust it unless explicitly
  configured and the proxy is trusted.
- Service accounts/API tokens for automation.

## 9. Networking and egress

Required egress:

- The forge API and OAuth endpoints (e.g. `api.github.com`, `github.com`).
- The configured provider endpoints.
- Optional: object storage, SMTP, notification webhooks, OTel collector, SSO.

Everything else is blocked by default in a hardened deployment. Provide a documented allowlist and
an egress proxy option.

Inbound:

- HTTPS to the reverse proxy.
- Webhook path from the forge.
- Optional metrics endpoint from the monitoring network only.

## 10. Upgrade and rollback topology

- App and worker images are versioned and signed.
- Migrations run as a one-shot job/command, not on every app start.
- Expand/contract: add columns/tables first, deploy code, backfill, remove old fields later.
- Keep the previous image available for rollback.
- Database rollback = restore from backup, not down migrations.

## 11. Deployment anti-patterns

- Exposing Postgres/Redis/MinIO to the internet.
- Running as root or with a privileged container.
- Baking secrets into the image or committing `.env`.
- Trusting `X-Forwarded-*` from any source.
- Running migrations automatically on every replica start.
- A single worker with no health check or restart policy.
- No backup target on a separate disk/host.
- Using the all-in-one demo image for a team production deployment.

## 12. Decision

The proposed default is **Compose on a single host with external Postgres optional**, with an
all-in-one image for evaluation and a Helm chart deferred. This is recorded as ADR-0003 and
requires the owner's approval.
