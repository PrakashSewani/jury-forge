# Operations

A self-hosted product is judged on the day something goes wrong. This document defines the
operational contract: install, configure, upgrade, back up, restore, scale, diagnose, and recover.

## 1. Supported environments (proposed)

| Item | Support |
| ---- | ------- |
| OS | **Ubuntu 24.04 LTS** (confirmed 2026-11-15). Other Linux best-effort; macOS dev, Windows via WSL2. |
| Arch | **amd64 + arm64** (confirmed 2026-11-15). |
| Container | **Docker Engine 24+ with Compose v2** (confirmed). |
| Database | PostgreSQL 16+ (bundled or external). |
| Object storage | Local volume or S3-compatible (MinIO, S3, R2, GCS via gateway). |
| Queue | PostgreSQL (default) or Redis 7+ (optional). |
| Reverse proxy | Bundled Caddy/Traefik, or an operator-provided proxy. |
| Node/runtime | Pinned LTS in the image; not required on the host. |
| Kubernetes | **v1:** Helm chart on Kubernetes 1.29+ / Helm 3.14+ (ADR-0022); external/operator Postgres and S3 required. |

Anything outside this matrix is best-effort until an ADR extends it.

## 2. Install

### Reference: Docker Compose

Before the first start you need **a domain that GitHub can reach** — but you do not set it in
`.env`; the wizard does (ADR-0021). GitHub calls `POST {ORIGIN}/api/webhooks/github` and
`GET {ORIGIN}/api/auth/github/callback`; a laptop on a private network needs a tunnel or the
documented local/evaluation mode. Ports 80/443 must be open for ACME and webhooks. Docker itself
exposes no webhook URL. Until the domain is set, setup is reachable only on the loopback listener.

```bash
# 1. Fetch a signed release bundle and verify it BEFORE extracting (ADR-0020)
curl -fLO https://github.com/PrakashSewani/jury-forge/releases/download/vX.Y.Z/jury-forge-vX.Y.Z.tar.gz
curl -fLO https://github.com/PrakashSewani/jury-forge/releases/download/vX.Y.Z/jury-forge-vX.Y.Z.tar.gz.sha256
curl -fLO https://github.com/PrakashSewani/jury-forge/releases/download/vX.Y.Z/jury-forge-vX.Y.Z.tar.gz.minisig
jury-forge verify --release jury-forge-vX.Y.Z.tar.gz   # checksum + signature

tar -xzf jury-forge-vX.Y.Z.tar.gz && cd jury-forge-vX.Y.Z

# 2. Generate .env and secret files (0600, refuses to overwrite, prints fingerprints only)
jury-forge init
#    Optional: pre-seed the origin for the setup wizard (does not freeze it).
#    jury-forge init --origin-hint jury.example.com
#    Optional: freeze the origin now (pre-provisioned/air-gapped only; equivalent to PUBLIC_URL).
#    jury-forge init --freeze-origin jury.example.com
$EDITOR .env                 # usually nothing to change; set PUBLIC_URL only to freeze the origin

# 3. Run migrations once (one-shot, safe to re-run), then start the stack
docker compose run --rm app jury-forge migrate
docker compose up -d

# 4. Verify the host before creating anything on GitHub
jury-forge doctor
```

The git fallback is `git clone --branch vX.Y.Z` of a **signed tag**, then `jury-forge init`. Do not
use `curl … | sh`; ADR-0020 records why and the one allowed alternative (download, verify, then
execute an explicit script).

Then reach setup on the **loopback listener** (`SETUP_BIND`; Compose binds `0.0.0.0:8080` inside the
container and publishes `127.0.0.1:8080:8080`; a native install binds `127.0.0.1:8080`) — via an SSH
tunnel, `curl` on the host, or `jury-forge setup domain <host>` — enter the bootstrap token printed
once by the app on first boot (`docker compose logs app | grep 'setup token'`; re-print with
`jury-forge setup token`), and follow the wizard: **set and validate the domain** → create/verify the
GitHub App → pick the installation → claim as owner with GitHub OAuth → add a provider key → bind the
first reviewer → post the first review.

The domain is set in the wizard (ADR-0021), so there is nothing to edit in `.env` for a normal
install. `PUBLIC_URL` exists only to freeze the origin for pre-provisioned/air-gapped deployments.

`jury-forge create-admin` is a **recovery** command (host access, audited), not the normal install
path. The normal path never asks the operator to create an admin manually.

The compose stack:

| Service | Purpose | Persistent |
| ------- | ------- | ---------- |
| `app` | Web/API + SPA | No (stateless) |
| `worker` | Review/index workers | No |
| `scheduler` | Janitor, retention, budgets | No |
| `postgres` | State | Volume |
| `redis` | Optional queue/cache | Volume |
| `minio` | Artefact driver: S3-compatible backend (optional; local volume is the default) | Volume |
| `caddy` | TLS + reverse proxy | Volumes for certs |

Only `caddy` publishes ports. `/api/webhooks/*` and `/api/auth/*` must not sit behind SSO or a
body-rewriting proxy; see [`deployment.md`](deployment.md#2-the-public-surface-github-requires).

A single-container "all-in-one" image can bundle app, worker, scheduler, and a local Postgres for a
demo, but it is not the recommended production deployment until it is proven.

### Kubernetes / Helm (v1.x, secondary target)

One chart over the same images; Compose remains the reference. The chart deploys app, worker,
scheduler, and a migration Job only — **no bundled Postgres/Redis/object storage**. TLS terminates
at the ingress; secrets come from an existing Secret; the origin follows ADR-0021 (`values.origin`
frozen, or `kubectl port-forward` + setup). Full shape, values, and upgrade rules:
[`deployment.md`](deployment.md#e-kubernetes-and-helm-in-v1-adr-0022).

```bash
helm repo add jury-forge https://prakashsewani.github.io/jury-forge
helm install jury-forge jury-forge/jury-forge -n jury-forge --create-namespace \
  --set origin=jury.example.com --set existingSecret=jury-forge-secrets
kubectl port-forward -n jury-forge svc/jury-forge-app 8080:8080   # only if origin is not set
```

Release gate: chart lint, `values.schema.json`, and an e2e run on `kind` (install → setup → dry run →
upgrade → rollback). Air-gapped install is **not** in v1.

### Open host decisions (need owner sign-off)

- **Support matrix (DEP-05):** proposed Ubuntu 24.04 LTS + Docker 24+/Compose v2, amd64 + arm64.
- **Backup RPO/RTO (DEP-04):** proposed daily dump = 24 h RPO, 4 h RTO.

### First-run checklist

- [ ] The origin was set and validated in setup (or `PUBLIC_URL` is set intentionally to freeze it).
- [ ] Migrations ran before the app started (`jury-forge migrate`).
- [ ] The GitHub App was created before the owner claim.
- [ ] The setup listener was reachable on host loopback only.
- [ ] TLS issued after the origin was saved; any other `Host` returns `421`.
- [ ] Secrets generated (`openssl rand -base64 32`), not defaults.
- [ ] Database password is strong; Postgres is not publicly exposed.
- [ ] Encryption key backed up separately from the database.
- [ ] TLS certificate valid; HSTS enabled.
- [ ] GitHub App created and installed; webhook reachable.
- [ ] First owner claimed via GitHub OAuth; bootstrap token disabled.
- [ ] Dashboard login works with GitHub (sign-out revokes the session).
- [ ] A test repository reviews successfully.
- [ ] Backups scheduled and a restore tested.
- [ ] Metrics/alerts connected (optional but recommended).

## 3. Configuration

Configuration is environment + a versioned instance config, validated at startup. The process
refuses to start with a missing/invalid critical value.

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `PUBLIC_URL` | no | Optional: **freezes** the origin (pre-provisioned/air-gapped). Normally unset and configured in setup (ADR-0021). |
| `SETUP_BIND` | no | Bootstrap listener. Compose binds `0.0.0.0:8080` inside the container and publishes `127.0.0.1:8080:8080`; a native install binds `127.0.0.1:8080`. The host publish is the loopback boundary. |
| `DATABASE_URL` / `DATABASE_URL_FILE` | yes | Postgres connection; TLS by default. Prefer the file form — a DSN in env leaks the password via `docker inspect`. |
| `ENCRYPTION_KEY` / `ENCRYPTION_KEY_FILE` | yes | Root key; prefer the file form (Docker secret), never logged. |
| `SESSION_SECRET` / `SESSION_SECRET_FILE` | yes | Cookie signing/encryption; file form preferred. |
| `BOOTSTRAP_TOKEN` | first run | One-time, rate-limited, expires; generated if unset. |
| `DATABASE_PASSWORD_FILE` | bundled Postgres | File form for the bundled database. |
| `OBJECT_STORAGE_*` | yes | Artefact driver: `local` (default volume) or S3 endpoint/bucket/credentials. |
| `QUEUE_DRIVER` | no | `postgres` (default) or `redis`. |
| `LOG_LEVEL` | no | `info` default; `debug` warns. |
| `TELEMETRY` | no | `off` default; opt-in only. |
| `TRUSTED_PROXIES` | no | CIDRs allowed to set forwarded headers. |
| `PROVIDER_EGRESS_ALLOWLIST` | no | Extra provider hosts, if any. |

Secrets are **files** in the reference Compose file (Docker secrets, `/run/secrets/*`), read once
at startup; `*_FILE` variables are the documented form. `.env` holds non-secret instance settings
(`PUBLIC_URL`, feature switches, driver choices) and, in local development only, throwaway values.
A secret in an environment value is visible in `docker inspect` and `/proc/1/environ` and is not
the supported form.

## 4. Upgrades

### Principles

- Backward-compatible schema changes (expand/contract), never destructive in the same release.
- The app supports the current and previous schema during the upgrade window.
- A pre-upgrade backup is automatic or explicitly required.
- The upgrade is idempotent and resumable.
- Downgrade is documented for code; data rollback is restore-from-backup.

### Procedure

```bash
jury-forge upgrade --to v1.4.0 --dry-run   # signature, image digests, migration plan, write locks
jury-forge backup --to /backups/pre-upgrade.dump
jury-forge upgrade --to v1.4.0     # verifies signature, pulls digests, runs expand migrations
jury-forge doctor                  # readiness, migrations, components
```

1. Read the release notes and migration notes.
2. Back up the database and object storage; confirm the backup restores (spot check).
3. Run `--dry-run`: it reports the signature/digest check, the migration list, and whether any step
   takes a write lock on a large table.
4. Announce the maintenance window. Expect **a short write pause** during expand migrations; reads
   continue. `app` serves a maintenance page instead of 5xx while the schema lock is held.
5. Pull the new images by digest and run expand migrations (additive, online where possible).
6. Start the new app/workers; old workers drain. Automatic review may queue during the pause; it
   resumes without loss (leases + outbox).
7. Run the contract migration after the new version is healthy (separate step or next release).
8. Verify with `doctor` and a smoke review.
9. Keep the previous image for a fast code rollback.

### Rollback

- **Code:** redeploy the previous image digest. Safe while only expand migrations have run, because
  the old code ignores new nullable columns/tables. After a contract migration, code rollback
  requires a data restore — the release notes must say so before the contract step ships.
- **Data:** restore the pre-upgrade backup. Do not attempt a down migration on production unless it
  is explicitly supported and tested.
- **Failed upgrade mid-way:** the upgrade is resumable; re-run `jury-forge upgrade --to <version>`
  after fixing the cause. Never start the new app against a half-migrated schema — `/readyz` refuses
  with `migration_incomplete`.

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

Default target is **RPO 24 h, RTO 4 h** with daily `pg_dump`; the owner must confirm this is
acceptable for conversation history and findings, or approve WAL archiving/pgBackRest (DEP-04).
Until decided, the install docs state the 24 h exposure explicitly rather than implying zero loss.

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
- GitHub org **IP allowlist** and **SAML/OAuth app restrictions** for the installed org (warn before
  setup, because both block login or API calls after the fact);
- provider connectivity (optional, no key in logs);
- disk space and clock skew.

### Common failure modes

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Setup page loops / OAuth fails | Origin wrong or stale after a move | Re-run the origin step; `PATCH /app` updates URLs; verify webhook delivery. |
| Origin cannot be saved | DNS/ports/TLS validation failed | Fix the typed reason (`dns_mismatch`, `tls_unreachable`, `host_mismatch`); nothing is stored on failure. |
| Setup reachable only on the host | Bootstrap is loopback-only by design | SSH tunnel to `127.0.0.1:8080`, or `jury-forge setup domain <host>` |
| Login redirects to GitHub then fails with `sso_required` | Org enforces SAML SSO or restricts OAuth apps | Authorize the App/OAuth app in the org; re-auth via `X-GitHub-SSO`; admin approves the app |
| GitHub API 403 `ip_allow_list` | Org IP allowlist blocks the instance | Add the instance egress IPs to the org allowlist (or the App's allowlist entry) |
| Webhook never arrives, API works | Org/repo webhook blocked or URL unreachable | Test “Redeliver” in the App's Advanced page; check DNS/TLS and the stored origin |
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
- **Repository graph:** incremental update on every branch/T2 review/default-branch push; full rebuild on
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
| Branch review is slow/expensive | Graph cold or budget too high | Check index status, estimate, budget; rebuild or lower scope. |
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
