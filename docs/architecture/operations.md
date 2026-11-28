# Operations

A self-hosted product is judged on the day something goes wrong. This document defines the
operational contract: install, configure, upgrade, back up, restore, scale, diagnose, and recover.
It follows the accepted v1 stack in [`technical-approach.md`](technical-approach.md) (ADR-0026); the
topology and Compose file are in [`deployment.md`](deployment.md).

## 1. Supported environments

| Item | Support |
| ---- | ------- |
| OS | **Ubuntu 24.04 LTS** (confirmed 2026-11-15). Other Linux best-effort; macOS dev, Windows via WSL2. |
| Arch | **amd64 + arm64** (confirmed 2026-11-15). |
| Container | **Docker Engine 24+ with Compose v2** (confirmed). |
| Database | PostgreSQL 17, bundled or external; an external 16 is tested (ADR-0004, technical-approach TQ-4). |
| Object storage | None in v1: artefacts are bounded `bytea` in Postgres. An S3-compatible adapter is v1.2 (technical-approach §2). |
| Queue | PostgreSQL only (graphile-worker; ADR-0006, technical-approach §3.3). No Redis: none in v1. |
| Scheduler | None in v1 as a separate service: cron runs inside `worker` (technical-approach §2). |
| Reverse proxy | Bundled Caddy, or an operator-provided proxy/LB (deployment model C). |
| Node/runtime | Node 24 LTS pinned in the image; not required on the host. |
| Kubernetes | **v1.2:** Helm chart (ADR-0022 as amended by ADR-0023); none in v1. |
| Air-gapped | Not in v1 (v1.1+, technical-approach §3.11). |

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
#    Optional: freeze the origin now (pre-provisioned installs only; equivalent to PUBLIC_URL).
#    jury-forge init --freeze-origin jury.example.com
$EDITOR .env                 # usually nothing to change; set PUBLIC_URL only to freeze the origin

# 3. Start the stack. The one-shot migrate container runs first; app and worker wait for it.
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
install. `PUBLIC_URL` exists only to freeze the origin for pre-provisioned deployments.

`jury-forge create-admin --recover` is a **recovery** command (host access, audited), not the normal
install path. The normal path never asks the operator to create an admin manually.

The compose stack (technical-approach §2, §3.13):

| Service | Purpose | Persistent |
| ------- | ------- | ---------- |
| `caddy` | TLS (on-demand) + reverse proxy | Volumes for certs |
| `migrate` | One-shot SQL migrations; exits before `app` and `worker` start | No |
| `app` | Web/API + SPA + webhook ingest; the setup listener on host loopback | No (stateless) |
| `worker` | Jobs, review turns, publishing, and cron | No (stateless) |
| `postgres` | All state: data, queue, audit, artefacts | Volume |

Only `caddy` publishes public ports; `app` publishes the setup listener on `127.0.0.1` only.
`/api/webhooks/*` and `/api/auth/*` must not sit behind SSO or a body-rewriting proxy; see
[`deployment.md`](deployment.md#2-the-public-surface-github-requires).

A single-container "all-in-one" image can bundle app, worker, and a local Postgres for a demo, but it
is a labelled evaluation mode after G1 (Q-030), not a production deployment.

### Kubernetes / Helm (v1.2)

Not in v1: Compose is the only supported v1 install (ADR-0023). The chart and its constraints are
summarised in [`deployment.md`](deployment.md#e-kubernetes-and-helm-v12); install, upgrade, and
release-gate procedures are written when the v1.2 chart is specified.

### First-run checklist

- [ ] The origin was set and validated in setup (or `PUBLIC_URL` is set intentionally to freeze it).
- [ ] The `migrate` container exited `0` before `app` and `worker` started.
- [ ] The GitHub App was created before the owner claim.
- [ ] The setup listener was reachable on host loopback only.
- [ ] TLS issued after the origin was saved; any other `Host` returns `421`.
- [ ] Secrets were generated by `jury-forge init` into `secrets/` files, not defaults or env values.
- [ ] The database password is strong; Postgres is not publicly exposed.
- [ ] The master key file is backed up separately from the database.
- [ ] TLS certificate valid; HSTS enabled.
- [ ] GitHub App created and installed; webhook reachable.
- [ ] First owner claimed via GitHub OAuth; bootstrap token disabled.
- [ ] Dashboard login works with GitHub (sign-out revokes the session).
- [ ] A test repository reviews successfully.
- [ ] Backups scheduled and a restore tested.
- [ ] Metrics/alerts connected (optional but recommended).

## 3. Configuration

Configuration has three layers (technical-approach §14): environment and files for bootstrap and
infrastructure only, instance settings in Postgres (set through the UI, versioned, audited), and
`.jury-forge.yml` read from the base SHA. The process refuses to start with a missing or invalid
critical value.

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `PUBLIC_URL` | no | Optional: **freezes** the origin (pre-provisioned installs). Normally unset and configured in setup (ADR-0021). |
| `SETUP_BIND` | no | Bootstrap listener. Compose binds `0.0.0.0:8080` inside the container and publishes `127.0.0.1:8080:8080`; a native install binds `127.0.0.1:8080`. The host publish is the loopback boundary. |
| `DATABASE_URL` / `DATABASE_URL_FILE` | yes | Postgres connection; TLS by default. Prefer the file form — a DSN in env leaks the password via `docker inspect`. |
| `JURY_MASTER_KEY_FILE` | yes (`app`, `worker`) | The 32-byte master key (KEK): one line, 32 random bytes in base64 (owner, 2026-11-28). A Docker secret or file, mode 0400, never group- or world-readable (refused at start); in Compose owned by 65532. Never an env value, never logged. A malformed or non-random value is refused; a key that does not open the stored probe stops the process with `encryption_key_mismatch`. `migrate` does not read it. |
| `TRUSTED_PROXIES` | yes behind a proxy | CIDRs allowed to set forwarded headers: the pinned Compose subnet of the bundled Caddy, or the operator load balancer. Never `0.0.0.0/0`. |
| `LOG_LEVEL` | no | `info` default; `debug` warns. |
| `METRICS_BIND` | no | Prometheus listener; internal network only. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | Optional OpenTelemetry export to the operator collector; off when unset. |
| `HTTPS_PROXY` | no | Optional outbound proxy. |
| `ROLE` | — | Not read. The image's command is the role: `migrate`, `app`, or `worker` (one image; WP 1-13). |

This is the complete v1 list ([`technical-approach.md`](technical-approach.md) §14, amended
2026-11-27). Everything else lives in the database. Names from earlier drafts that v1 does not read
(none in v1): `ENCRYPTION_KEY[_FILE]` (use `JURY_MASTER_KEY_FILE`), `SESSION_SECRET[_FILE]` (sessions
are random IDs stored hashed), `BOOTSTRAP_TOKEN` (always generated), `QUEUE_DRIVER` (Postgres only),
`TELEMETRY` (v1 has no telemetry), `PROVIDER_EGRESS_ALLOWLIST` (derived from the configured provider
origins), and `OBJECT_STORAGE_*` (arrives with the v1.2 S3 adapter). The bundled `postgres` container
reads its own `POSTGRES_PASSWORD_FILE`; that variable belongs to the `postgres` image, not to Jury
Forge.

Secrets are **files** in the reference Compose file (Docker secrets, `/run/secrets/*`), read once
at startup; `*_FILE` variables are the documented form. `.env` holds only the non-secret variables
above (for example `PUBLIC_URL` and `LOG_LEVEL`) and, in local development only, throwaway values.
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
jury-forge upgrade --to v1.4.0     # verifies signature, pulls digests, runs the migrate container, restarts
jury-forge doctor                  # readiness, migrations, components
```

1. Read the release notes and migration notes.
2. Back up the database (one dump includes the artefacts) and confirm the master key backup;
   confirm the backup restores (spot check).
3. Run `--dry-run`: it reports the signature/digest check, the migration list, and whether any step
   takes a write lock on a large table.
4. Announce the maintenance window. Expect **a short write pause** during expand migrations; reads
   continue. `app` serves a maintenance page instead of 5xx while the schema lock is held.
5. Pull the new images by digest and run expand migrations in the `migrate` container (additive,
   online where possible).
6. Restart `app` and `worker` on the new image. Webhook deliveries and jobs that arrive during the
   pause wait in Postgres and run afterwards.
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

- **PostgreSQL**: one logical dump (`pg_dump -Fc`) covers everything durable — relational data, the
  queue, the audit log, and the artefacts.
- **The master key file** (`JURY_MASTER_KEY_FILE`), in a separate escrow: losing it loses every
  stored credential. `jury-forge backup` leaves it out unless `--include-key` is passed
  (technical-approach TQ-3).
- **`secrets/` and `.env`**, encrypted and kept apart from the database dump.
- Optionally `caddy-data`: certificates re-issue on their own, within ACME rate limits.

### Schedule

- Database: daily full dump; retain 30 days by default. WAL archiving/pgBackRest is the documented
  upgrade for a team or HA install (deployment model B), not a v1 default.
- Verify: a monthly restore drill into a scratch environment; CI runs a nightly restore drill with
  receipt-chain verification (technical-approach §18).

The target is **RPO 24 h, RTO 4 h** with a daily `pg_dump` (accepted, DEP-04). The install docs state
the 24 h exposure explicitly rather than implying zero loss.

### Restore

```bash
jury-forge restore --from /backups/pre-upgrade.dump   # asks for the master key file unless the backup includes it
docker compose run --rm migrate
jury-forge doctor
```

A restore drill is part of the release checklist, not a documentation aspiration.

## 6. Scaling

| Bottleneck | First move | Later |
| ---------- | ---------- | ----- |
| Queue backlog | Add worker replicas | Separate queues by priority/tenant |
| Provider rate limits | Lower concurrency, add keys | Gateway pool / routing |
| Database CPU/IO | Indexes, connection pooling, read replica for dashboards | Partition runs/findings by time |
| Database disk (artefacts) | Shorter artefact retention; grow the Postgres volume | Optional S3 adapter (v1.2) |
| Indexing (v1.1 branch review) | The index worker queue | Extract the indexer service |
| API traffic | `app` replicas behind an LB (deployment model C) | CDN for static assets |

`app` and `worker` are stateless; Postgres is the only shared state. No sticky sessions.

## 7. Diagnostics and troubleshooting

### `jury-forge doctor`

Checks (technical-approach §3.12, first-run-setup acceptance criterion 2):

- config validity and weak or group/world-readable secret files;
- origin set, HTTPS, and matching the request `Host`; untrusted proxy headers;
- database connectivity, migration version, locks;
- queue lag;
- master key presence and key version;
- GitHub App auth and webhook reachability;
- GitHub org **IP allowlist** and **SAML/OAuth app restrictions** for the installed org (warn before
  setup, because both block login or API calls after the fact);
- provider reachability (no key in logs), and each `local` provider's pinned addresses and whether it
  uses plain HTTP (ADR-0030);
- setup left incomplete for 7 days or more, with the stage reached (also `jf_setup_incomplete_seconds`
  on `/metrics`);
- certificate expiry, disk space, and clock skew.

### Common failure modes

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Setup page loops / OAuth fails | Origin wrong or stale after a move | Re-run the origin step; `PATCH /app` updates URLs; verify webhook delivery. |
| Origin cannot be saved | DNS/ports/TLS validation failed | Fix the typed reason (`dns_mismatch`, `tls_unreachable`, `host_mismatch`); nothing is stored on failure. |
| Setup reachable only on the host | Bootstrap is loopback-only by design | SSH tunnel to `127.0.0.1:8080`, or `jury-forge setup domain <host>` |
| `app` and `worker` never start | The `migrate` container failed | `docker compose logs migrate`; fix the cause and re-run `docker compose up -d`. |
| Login redirects to GitHub then fails with `sso_required` | Org enforces SAML SSO or restricts OAuth apps | Authorize the App/OAuth app in the org; re-auth via `X-GitHub-SSO`; admin approves the app |
| GitHub API 403 `ip_allow_list` | Org IP allowlist blocks the instance | Add the instance egress IPs to the org allowlist (or the App's allowlist entry) |
| Webhook never arrives, API works | Org/repo webhook blocked or URL unreachable | Test “Redeliver” in the App's Advanced page; check DNS/TLS and the stored origin |
| Webhook 401 | Wrong webhook secret or body modified by proxy | Re-enter secret; disable body rewriting. |
| Tunnel (C1): every request gets `421` | The tunnel sends a `Host` other than the origin | Set the tunnel's HTTP Host Header to the origin hostname ([deployment.md §4 C1](deployment.md#c1-outbound-tunnel-cloudflare-tunnel-as-the-worked-example)). |
| Tunnel (C1): GitHub shows failed deliveries with an HTML challenge page | Bot Fight Mode, a WAF challenge, or Access in front of `/api/webhooks/*` | Turn Bot Fight Mode off for the zone (it cannot be skipped per path); remove challenges and Access from `/api/webhooks/*` and `/api/auth/*`. |
| Setup stays `tls_front_unverified` | TLS ends in front (`front` mode) and no signed webhook delivery has arrived, or the App's `insecure_ssl` is `1` | Fix the proxy or tunnel path, then use "Redeliver" in the App's Advanced page; set `insecure_ssl` back to `0` (ADR-0036). |
| Tunnel (C1): live progress stops with `524` | Cloudflare's 125 s proxy read timeout | The stream must send keepalive data well inside 125 s (checked in M1.7). |
| Jobs stuck queued | `worker` not running or cannot reach Postgres | Check worker logs, queue age in `/metrics`, DB connectivity. |
| A job stays locked after a crash | The worker died mid-job | The stuck-turn sweep releases it within about 7 minutes once the worker's heartbeat has been silent for 2 minutes ([ADR-0037](../decisions/ADR-0037-dead-worker-lock-release.md)); graphile-worker on its own would wait 4 hours. `doctor` lists the worker pools and any release. Finished steps are skipped when it runs again. |
| A worker restarts itself with "fenced" in its log | Its heartbeat was silent for 2 minutes (a stall or a database outage), so its locks were released | Expected and safe (ADR-0037). If it repeats, check worker CPU and memory limits and database latency. |
| Publish 422 | Review body/comment limit, stale SHA | Inspect the publish plan; budget/limits. |
| Provider 401 | Wrong key or base URL | Check credential binding, re-enter key. |
| Provider 429 | Rate limit | Lower concurrency, add capacity, retry. |
| `local` provider refused | Address not pinned, changed DNS answer, link-local/metadata, or plain HTTP to a public address | Re-save the provider with the exact host; see ADR-0030. |
| High cost | Too much context or too many reviewers | Check token budgets, context manifest, model choice. |
| Review quality dropped | Prompt/model change | Compare prompt hash, run the benchmark, roll back. |
| Disk full | Artefacts and retention on the Postgres volume | Shorten artefact retention; grow the volume; `doctor` reports disk. |
| Slow dashboard | DB indexes, large run lists | Add indexes, paginate, read replica. |

### Support bundle

`jury-forge doctor --bundle` produces a redacted archive (see
[`observability.md`](observability.md#10-support-bundle)). Never ask a user to paste secrets or
full diffs into an issue.

## 8. Security operations

- Rotate credentials on a schedule and on suspicion; `jury-forge rotate-key` rewraps the data keys
  under a new master key.
- Review audit events for role changes, credential changes, exports, and deletions.
- Keep images and dependencies patched; subscribe to advisories.
- Run the security checklist in [`security.md`](security.md#11-deployment-hardening-checklist).
- Have a disclosure channel and an incident runbook.
- Test restore and key rotation at least once per quarter.

## 9. Agentic operations

These run as `worker` jobs and cron (technical-approach §3.3); there is no separate janitor or
scheduler process (none in v1).

- **Turn queue:** one active turn per session (`queue_name = session:<id>`); replies coalesce
  within 30 s (`job_key` replace mode); a push advances the generation and cancels stale jobs. Jobs
  that exhaust their attempts stay in the queue tables as failed, inspectable, and retryable by an
  admin with audit (ADR-0006). Replay of a stored turn is v1.1.
- **Reconciler (every 10 min):** lists open PRs with pending triggers (labels, checkboxes) and
  enqueues what a missed webhook would have, and syncs human thread resolutions
  ([capability deep dive](../analysis/capability-deep-dive-2026-11-16.md) 2.8, 8.3).
- **Stalled sessions (hourly):** after 30 days waiting a session is marked `needs human`; it is
  archived only when its PR closes (ADR-0015).
- **Retention (daily):** expires artefacts and other rows past their retention.
- **Reaction poll (every 5 min, open sessions only):** picks up feedback reactions GitHub sends no
  webhook for.
- **Stuck-turn sweep (every 5 min):** a turn `running` longer than 20 min (configurable;
  `review-progress-and-completion` RP-03) is failed with reason `stuck`, and its Check Run is
  completed with the remedy, so no Check Run spins forever.
- **Provider catalog refresh (daily, plus on demand):** mark stale/removed models; surface affected
  reviewers (`configuration_error`); never silently switch a bound model.
- **Repository graph (v1.1):** incremental update on branch review and default-branch push; full
  rebuild on parser upgrade or manual action; per-repo lock; stale badge.
- **Resolution audit:** report bot resolutions, human resolutions, reopens, and false-resolve
  feedback; investigate outliers weekly.
- **Cost watches:** per-session/turn/repo budgets; alert on runaway loops and provider errors.
- **Troubleshooting additions:**

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Session waits forever | `worker` down, or its turn job failed | Check worker health and the failed job; retry it; the hourly stalled-sessions job flags it. |
| Agent answers an old commit | Stale generation/turn | Cancel stale turn; verify generation check. |
| Same comment answered twice | Missing idempotency/debounce | Check event/delivery id, turn key, bot filter. |
| Resolve refused | Guard failed (no human reply/evidence) | Inspect resolution guard reason; do not bypass. |
| Model missing | Provider catalog refreshed | Rebind the reviewer from the catalog; check deprecation. |
| Branch review is slow/expensive (v1.1) | Graph cold or budget too high | Check index status, estimate, budget; rebuild or lower scope. |
| Graph stale (v1.1) | Index job failed | Inspect index job, rebuild; review should warn, not silently use stale. |

## 10. Runbooks to write

- [ ] First install and first review.
- [ ] Upgrade and rollback.
- [ ] Backup and restore drill.
- [ ] Key rotation.
- [ ] Stuck job / queue backlog.
- [ ] Provider outage.
- [ ] Forge outage / webhook storm.
- [ ] Budget exceeded.
- [ ] Suspected secret leak.
- [ ] Account compromise / session revocation.
- [ ] Data deletion request.
- [ ] Migration failure.
- [ ] Disk full / Postgres volume growth.
- [ ] Stuck session / turn backlog.
- [ ] Agent resolution refused or wrong.
- [ ] Model catalog refresh removed a model.
- [ ] Repository graph rebuild / stale index (v1.1).

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
