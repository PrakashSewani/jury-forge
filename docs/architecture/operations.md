# Operations

A self-hosted product is judged on the day something goes wrong. This document defines the
operational contract: install, configure, upgrade, back up, restore, scale, diagnose, and recover.

## 1. Supported environments (proposed)

| Item | Support |
| ---- | ------- |
| OS | Linux (x86_64, arm64). macOS for development. Windows via WSL2. |
| Container | Docker Engine 24+ with Compose v2. |
| Database | PostgreSQL 16+ (bundled or external). |
| Object storage | Local volume or S3-compatible (MinIO, S3, R2, GCS via gateway). |
| Queue | PostgreSQL (default) or Redis 7+ (optional). |
| Reverse proxy | Bundled Caddy/Traefik, or an operator-provided proxy. |
| Node/runtime | Pinned LTS in the image; not required on the host. |
| Kubernetes | Later; not the reference v1 install. |

Anything outside this matrix is best-effort until an ADR extends it.

## 2. Install

### Reference: Docker Compose

```bash
git clone https://github.com/<org>/jury-forge.git
cd jury-forge
cp .env.example .env        # edit PUBLIC_URL, secrets, DB password
docker compose up -d
docker compose exec app jury-forge migrate
docker compose exec app jury-forge create-admin
```

The compose stack:

| Service | Purpose | Persistent |
| ------- | ------- | ---------- |
| `app` | Web/API + SPA | No (stateless) |
| `worker` | Review/index workers | No |
| `scheduler` | Janitor, retention, budgets | No |
| `postgres` | State | Volume |
| `redis` | Optional queue/cache | Volume |
| `minio` | Optional object storage | Volume |
| `caddy` | TLS + reverse proxy | Volumes for certs |

A single-container "all-in-one" image can bundle app, worker, scheduler, and a local Postgres for a
demo, but it is not the recommended production deployment until it is proven.

### First-run checklist

- [ ] `PUBLIC_URL` is the externally reachable HTTPS URL.
- [ ] Secrets generated (`openssl rand -base64 32`), not defaults.
- [ ] Database password is strong; Postgres is not publicly exposed.
- [ ] Encryption key backed up separately from the database.
- [ ] TLS certificate valid; HSTS enabled.
- [ ] GitHub App created and installed; webhook reachable.
- [ ] First admin created; bootstrap token disabled.
- [ ] A test repository reviews successfully.
- [ ] Backups scheduled and a restore tested.
- [ ] Metrics/alerts connected (optional but recommended).

## 3. Configuration

Configuration is environment + a versioned instance config, validated at startup. The process
refuses to start with a missing/invalid critical value.

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `PUBLIC_URL` | yes | External HTTPS origin; used for OAuth/webhook/manifest. |
| `DATABASE_URL` | yes | Postgres connection; TLS by default. |
| `ENCRYPTION_KEY` / KMS config | yes | Root key or KMS reference; never logged. |
| `SESSION_SECRET` | yes | Cookie signing/encryption. |
| `BOOTSTRAP_TOKEN` | first run | One-time, rate-limited, expires. |
| `OBJECT_STORAGE_*` | yes | Local path or S3 endpoint/bucket/credentials. |
| `QUEUE_DRIVER` | no | `postgres` (default) or `redis`. |
| `LOG_LEVEL` | no | `info` default; `debug` warns. |
| `TELEMETRY` | no | `off` default; opt-in only. |
| `TRUSTED_PROXIES` | no | CIDRs allowed to set forwarded headers. |
| `PROVIDER_EGRESS_ALLOWLIST` | no | Extra provider hosts, if any. |

Secrets can also be provided as files (Docker secrets) and are read once at startup. `.env` is for
local development only.

## 4. Upgrades

### Principles

- Backward-compatible schema changes (expand/contract), never destructive in the same release.
- The app supports the current and previous schema during the upgrade window.
- A pre-upgrade backup is automatic or explicitly required.
- The upgrade is idempotent and resumable.
- Downgrade is documented for code; data rollback is restore-from-backup.

### Procedure

```bash
jury-forge backup --to /backups/pre-upgrade.dump
jury-forge upgrade --to v1.4.0     # pulls image, runs expand migrations, restarts
jury-forge doctor                  # readiness, migrations, components
```

1. Read the release notes and migration notes.
2. Back up the database and object storage.
3. Pull the new image (signed digest).
4. Run expand migrations (additive, online where possible).
5. Start the new app/workers; old workers drain.
6. Run the contract migration after the new version is healthy (separate step or next release).
7. Verify with `doctor` and a smoke review.
8. Keep the previous image for a fast code rollback.

### Rollback

- Code: redeploy the previous image digest.
- Data: restore the pre-upgrade backup. Do not attempt a down migration on production unless it is
  explicitly supported and tested.

## 5. Backups

### What to back up

- PostgreSQL (full logical dump + WAL/continuous archiving where available).
- Object storage (artefacts, raw responses, exports) or a manifest of what can be regenerated.
- Configuration and secrets (encrypted, separate from the database).
- The encryption root key (separate escrow; losing it loses credentials).

### Schedule

- Database: daily full + continuous WAL if the operator has it; retain 30 days by default.
- Object storage: daily incremental; retain per policy.
- Verify: a monthly restore drill into a scratch environment.

### Restore

```bash
jury-forge restore --from /backups/pre-upgrade.dump
jury-forge migrate
jury-forge doctor
```

A restore drill is part of the release checklist, not a documentation aspiration.

## 6. Scaling

| Bottleneck | First move | Later |
| ---------- | ---------- | ----- |
| Queue backlog | Add worker replicas | Separate queues by priority/tenant |
| Provider rate limits | Lower concurrency, add keys | Gateway pool / routing |
| Database CPU/IO | Indexes, connection pooling, read replica for dashboards | Partition runs/findings by time |
| Object storage | S3-compatible backend | Lifecycle policies, tiering |
| Indexing | Dedicated index workers | Extract the indexer service |
| API traffic | Horizontal app replicas | CDN for static assets |

The app and workers are stateless; the database and object storage are the shared state. No sticky
sessions.

## 7. Diagnostics and troubleshooting

### `jury-forge doctor`

Checks:

- config validity and weak secrets;
- database connectivity, migration version, locks;
- queue connectivity and depth;
- object storage read/write;
- encryption key load and key version;
- forge app credentials and webhook reachability (optional);
- provider connectivity (optional, no key in logs);
- disk space and clock skew.

### Common failure modes

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Setup page loops / OAuth fails | `PUBLIC_URL` or proxy headers wrong | Fix `PUBLIC_URL`, trusted proxies, callback URL. |
| Webhook 401 | Wrong webhook secret or body modified by proxy | Re-enter secret; disable body rewriting. |
| Runs stuck queued | Worker not running or queue misconfigured | Check worker logs, queue depth, DB connectivity. |
| Runs stuck running | Lease not heartbeating; janitor down | Check janitor, lease metrics, reclaim. |
| Publish 422 | Review body/comment limit, stale SHA | Inspect the publish plan; budget/limits. |
| Provider 401 | Wrong key or base URL | Check credential binding, re-enter key. |
| Provider 429 | Rate limit | Lower concurrency, add capacity, retry. |
| High cost | Too much context or too many reviewers | Check token budgets, context manifest, model choice. |
| Review quality dropped | Prompt/model change | Compare prompt hash, run the benchmark, roll back. |
| Disk full | Raw artefacts/retention | Adjust retention, move to object storage. |
| Slow dashboard | DB indexes, large run lists | Add indexes, paginate, read replica. |

### Support bundle

`jury-forge doctor --bundle` produces a redacted archive (see
[`observability.md`](observability.md#10-support-bundle)). Never ask a user to paste secrets or
full diffs into an issue.

## 8. Security operations

- Rotate credentials on a schedule and on suspicion.
- Review audit events for role changes, credential changes, exports, and deletions.
- Keep images and dependencies patched; subscribe to advisories.
- Run the security checklist in [`security.md`](security.md#11-deployment-hardening-checklist).
- Have a disclosure channel and an incident runbook.
- Test restore and key rotation at least once per quarter.

## 9. Agentic operations

- **Session janitor:** expire leases, recover stuck turns, archive merged/closed sessions, enforce
  retention. A session must never be left `active` without a lease.
- **Turn queue:** one active turn per session; coalesce replies; cancel stale generations; DLQ and
  replay for failed turns.
- **Provider catalog refresh:** daily and on demand; mark stale/removed models; surface affected
  agents; never silently switch a bound model.
- **Repository graph:** incremental update on every review/default-branch push; full rebuild on
  parser upgrade or manual action; per-repo lock; stale badge.
- **Resolution audit:** report bot resolutions, human resolutions, reopens, and false-resolve
  feedback; investigate outliers weekly.
- **Cost watches:** per-session/turn/repo budgets; alert on runaway loops and provider errors.
- **Troubleshooting additions:**

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Session waits forever | Turn lease expired/janitor down | Check lease/heartbeat, reclaim, inspect turn. |
| Agent answers an old commit | Stale generation/turn | Cancel stale turn; verify generation check. |
| Same comment answered twice | Missing idempotency/debounce | Check event/delivery id, turn key, bot filter. |
| Resolve refused | Guard failed (no human reply/evidence) | Inspect resolution guard reason; do not bypass. |
| Model missing | Provider catalog refreshed | Rebind the agent from the catalog; check deprecation. |
| Context review is slow/expensive | Graph cold or budget too high | Check index status, estimate, budget; rebuild or lower scope. |
| Graph stale | Index job failed | Inspect index job, rebuild; review should warn, not silently use stale. |

## 10. Runbooks to write

- [ ] First install and first review.
- [ ] Upgrade and rollback.
- [ ] Backup and restore drill.
- [ ] Key rotation.
- [ ] Stuck run / queue backlog.
- [ ] Provider outage.
- [ ] Forge outage / webhook storm.
- [ ] Budget exceeded.
- [ ] Suspected secret leak.
- [ ] Account compromise / session revocation.
- [ ] Data deletion request.
- [ ] Migration failure.
- [ ] Disk full / object storage failure.
- [ ] Stuck session / turn backlog.
- [ ] Agent resolution refused or wrong.
- [ ] Model catalog refresh removed a model.
- [ ] Repository graph rebuild / stale index.

Each runbook: symptoms, impact, diagnosis, mitigation, verification, follow-up.

## 11. What the PoC did

The PoC had a guided deploy, migrations, CI/CD, and a troubleshooting table. It did not have
backups, restore, upgrade/rollback, readiness, metrics, traces, a doctor command, a support bundle,
or a runbook set. Those are table stakes for the new product.

## 12. Operations principles

1. **No manual database edits.** Every operation has a command.
2. **Back up before you change.** Automate it; test the restore.
3. **Fail closed on configuration.** Refuse to start with weak/missing critical settings.
4. **Make failure visible.** Health, metrics, alerts, run timeline.
5. **Keep the previous version runnable.** Fast code rollback beats a long debug.
6. **Document the recovery, not just the happy path.**
