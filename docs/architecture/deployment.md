# Deployment models

Jury Forge is container-first and self-hosted. This document defines the supported deployment
models, the required public surface, the reference topology, and the day-2 operations the stack
must support. The model choice is recorded in ADR-0003; install behaviour is specified in
[`../product/specs/first-run-setup.md`](../product/specs/first-run-setup.md).

**One sentence:** Docker Compose on one Linux host, behind Caddy on a public HTTPS origin, with
Postgres as the only durable state — everything else is replaceable.

## 1. Deployment models

| Model | Origin | State | Who it is for | Status |
| ----- | ------ | ----- | ------------- | ------ |
| **A. Compose, bundled** | Public HTTPS, Caddy + Let's Encrypt | Bundled Postgres, local volume | Default: small team on a VPS/VM/homelab | Reference (v1) |
| **B. Compose, external services** | Public HTTPS, operator proxy or bundled | External Postgres + S3-compatible | Teams with an existing database/object platform, HA | Reference (v1) |
| **C. Compose behind an existing LB** | Operator's LB terminates TLS | As A/B | Orgs that already run ingress/SSO | Supported (v1) |
| **D. All-in-one, local** | `http://localhost:PORT` or a tunnel | Embedded/bundled Postgres | Evaluation, personal use, demos | Labelled evaluation mode, post-G1 (Q-030) |
| **E. Kubernetes / Helm** | Operator ingress (cert-manager or TLS secret) | External/operator Postgres + S3 | Platform teams, scale | **Supported in v1 (ADR-0022)** |
| **F. Air-gapped** | Internal HTTPS | Local model + mirrored images | Regulated/classified | TBD (Q-018) |

Rules that apply to every model:

- **Only the proxy is public.** Postgres, Redis, MinIO, app and worker ports are bound to the
  internal network, never `0.0.0.0`.
- **The app is stateless.** All state is Postgres + object storage; no sticky sessions, no local
  session files, no in-memory queue as a source of truth.
- **Workers need outbound egress, not inbound HTTP.** The only inbound path is the proxy → app.
- **Migrations run once**, as a one-shot command/job, never on replica start.
- **The instance must survive a restart of any single service** without losing a claimed setup or an
  in-flight job (leases make jobs re-claimable).

## 2. The public surface GitHub requires

A GitHub App cannot be created until the instance has a public origin: the manifest records the
webhook, OAuth callback, and redirect URLs. The origin is therefore a **setup step**, not an `.env`
precondition (ADR-0021).

The origin (e.g. `https://review.example.com`) is:

- **set during first launch**, before the GitHub App step, and stored in Postgres; an
  `PUBLIC_URL` env var, if present, **freezes** it for pre-provisioned/air-gapped installs;
- **absolute HTTPS**, no trailing slash, **no path prefix** (sub-path deployments are unsupported
  in v1; use a subdomain) — DEP-08;
- **validated before it is saved**: DNS resolves to this host (or an operator-confirmed proxy/CDN),
  ports 80/443 are open, and Caddy can issue a certificate via on-demand TLS;
- **reachable from GitHub's egress**, not just the operator's laptop or VPN;
- **never derived from the `Host` header**. Requests to any other host get `421`; OAuth redirects,
  CSRF checks, and webhook URLs all use the stored origin;
- **not behind SSO or a bot-challenge/WAF** on the webhook and OAuth paths.

Before an origin exists, setup is served on a **loopback-only** listener (`SETUP_BIND`). In Compose
the app binds `0.0.0.0:8080` inside the container and publishes `127.0.0.1:8080:8080` on the host;
a native install binds `127.0.0.1:8080`. The host publish is the loopback boundary. The listener is
protected by the bootstrap token: SSH tunnel, `curl` on the host, or `jury-forge setup domain <host>`.
The bootstrap surface is never exposed publicly.

| Purpose | URL | Required |
| ------- | --- | -------- |
| GitHub App **webhook** | `POST {ORIGIN}/api/webhooks/github` | Yes — set by the manifest |
| OAuth **callback** | `GET {ORIGIN}/api/auth/github/callback` | Yes — login and first-owner claim |
| OAuth **start** | `GET {ORIGIN}/api/auth/github` | Internal route, linked by the UI |
| Setup / claim entry | `GET {ORIGIN}/setup` | Yes — pre-auth, disabled after claim |
| Manifest callback | `GET {ORIGIN}/api/setup/github/manifest/callback` | Yes — only when using the manifest flow |
| TLS authorization (`ask`) | `GET http://app:3000/api/internal/tls/allow?domain=…` | Internal only — on-demand certs |
| Health / readiness | `/healthz`, `/readyz` | Internal or LB only |
| Metrics | `/metrics` on the internal network | Optional |

### Origin lifecycle

| Situation | Behaviour |
| --------- | --------- |
| **Unset (cold start)** | Only the loopback bootstrap listener and `/healthz` answer; `:443` has no certificate yet |
| **Set during setup** | Validate DNS/TLS → write `instance.public_url` with audit `origin.set` → Caddy issues on-demand → all other hosts `421` |
| **Frozen by `PUBLIC_URL` env** | UI shows the origin read-only; changing it requires changing env + restart; `doctor` explains |
| **Changed by an owner** | Re-auth, validate new origin, audit `origin.changed`, `PATCH /app` to move hook/callback/redirect URLs, sessions re-login, banner until webhook self-test passes |
| **Wrong/typo origin** | Webhook self-test fails; setup stays incomplete and shows the exact URLs to compare; no `ready` |

The origin change is capped (3 per hour) and audited. Certificates are issued only for the single
configured host, with Caddy `on_demand_tls { ask … interval 2m burst 5 }` plus an app-side limit, so
an attacker cannot turn the instance into an ACME proxy.

Notes:

- **There is no "Docker webhook URL".** Docker does not publish an address. GitHub calls the
  operator's domain, Caddy terminates TLS and forwards to `app`, and `app` verifies the
  `X-Hub-Signature-256` header. The same path works behind any proxy or LB that preserves the body
  byte-for-byte.
- **Webhook requests must be answered fast** (GitHub times out at ~10 s and retries). The route
  verifies, persists `webhook_events`, enqueues, and returns `202`; no forge API calls and no model
  calls happen inside the request.
- **Do not rewrite the body.** Compression, charset conversion, or an auth portal in front of
  `/api/webhooks/github` breaks the signature. Exempt these paths from SSO and from body-rewriting
  middleware.
- **The OAuth callback host must match `PUBLIC_URL` exactly** (scheme, host, port). A mismatch is
  the second-most-common failure; `doctor` compares them and refuses setup on a mismatch.
- **Paths are versioned in the app, not in the URL.** The webhook, OAuth, and manifest paths are
  stable interfaces; they are recorded in the manifest and must not change in a patch release.

GitHub App surface (least privilege; pinned by the setup spec and the security review):

| Kind | Value | Why |
| ---- | ----- | --- |
| Events | `pull_request`, `issue_comment`, `pull_request_review_comment`, `check_run`, `installation`, `installation_repositories` | Reviews, conversational replies, manual triggers, installation discovery |
| Permissions | Repository: contents read, pull requests write, issues write, checks write, metadata read | Read code/diff; post reviews/comments/checks |
| Auth | OAuth on the same App (`request_oauth_on_install`) or a separate OAuth app | Dashboard login and owner claim |
| Webhook secret | Generated per instance, stored encrypted | Signature verification |

### Enterprise org blockers (check before promising an install)

These do not appear on a personal test account and are the most common enterprise first-run
failures. `doctor` and the setup preflight warn about them; the fix is always an org-side action.

| Blocker | Symptom | Fix |
| ------- | ------- | --- |
| **Org IP allowlist** | GitHub API returns `403` with an `ip_allow_list` reason; webhooks may still arrive | Add the instance's egress IPs (or the App's allowlist entry) to the org's IP allow list; for dynamic IPs, use a static egress/NAT |
| **SAML SSO enforced** | OAuth login returns `sso_required`; token lacks org access | Authorize the App/OAuth app in the org; re-authorize on `X-GitHub-SSO`; org owner grants access |
| **OAuth app restrictions** | Login fails or is denied for the org | Org owner approves the OAuth app; or use the same App with `request_oauth_on_install` |
| **Repository access policy** | Installation succeeds but the repo is missing | Grant the installation access to the repo; re-check `installation_repositories` |
| **Webhook blocked at the edge** | API works, no deliveries | Open 443 to GitHub; test “Redeliver” in the App settings; no WAF challenge on the path |

## 3. Reference topology (Compose, model A)

```
┌──────────────────────────────────────────────────────────────────┐
│ Host (Linux, Docker Engine 24+ and Compose v2)                   │
│                                                                  │
│  Internet ──443──▶ caddy (TLS, HSTS, security headers)           │
│                      ├── /api/webhooks/*  ──▶ app  (no SSO)      │
│                      ├── /api/auth/*      ──▶ app  (no SSO)      │
│                      └── everything else  ──▶ app  (SPA + /api/v1)│
│                                                                  │
│  internal network only:                                          │
│    app ×1–3      (web/API + SPA, /healthz /readyz)               │
│    worker ×1–N   (review + index, no inbound)                    │
│    scheduler ×1  (janitor, retention, budgets, leader lock)      │
│    postgres ×1   (state; volume)                                 │
│    redis ×1      (optional queue; volume)                        │
│    artefacts     (local volume default; MinIO/S3 optional)       │
│                                                                  │
│  Egress: api.github.com, github.com, provider endpoints,         │
│          optional S3/SMTP/OTel/SSO                               │
└──────────────────────────────────────────────────────────────────┘
```

| Service | Image | Replicas | Ports | Health | Persistent |
| ------- | ----- | -------- | ----- | ------ | ---------- |
| `caddy` | `caddy:2` | 1 | `80`, `443` public | HTTP probe | `caddy-data`, `caddy-config` |
| `app` | `jury-forge/app:VERSION` | 1–3 | `3000` internal | `/healthz`, `/readyz` | none |
| `worker` | `jury-forge/worker:VERSION` | 1–N | none | process + job heartbeat | none |
| `scheduler` | `jury-forge/worker:VERSION` (`role=scheduler`) | 1 | none | lease/lock heartbeat | none |
| `postgres` | `postgres:16` | 1 | `5432` internal | `pg_isready` | `postgres-data` |
| `redis` | `redis:7` | 1 (optional) | `6379` internal | `redis-cli ping` | `redis-data` |
| `minio` | `minio/minio` | 1 (optional) | `9000` internal | `/minio/health/live` | `object-data` |

**Artefact storage is required; the backend is not.** Raw diffs, model responses, and exports must be
stored somewhere. The default driver is a local volume (`OBJECT_STORAGE_DRIVER=local`); MinIO/S3 is
an optional backend, not an optional capability.

Hardening defaults, encoded in the compose file rather than documented as advice:

- Non-root user, `read_only: true` with `tmpfs` for `/tmp`, `cap_drop: [ALL]`,
  `security_opt: [no-new-privileges:true]`.
- `restart: unless-stopped`; CPU/memory limits; log rotation (`max-size`, `max-file`).
- `depends_on` with `condition: service_healthy` for `postgres` (and `redis`/`minio` when enabled).
- Images pinned by **digest** in the shipped compose file; `VERSION` tags are for reading.
- Secrets via env files with `0600` or Docker secrets; nothing secret in the image or committed
  `.env`.
- `app` and `worker` share one image with a `role` argument, so migrations and both processes always
  match the same code version.

Compose shape (illustrative, not the final file):

```yaml
networks:
  edge:
  internal:
    ipam:
      config: [{ subnet: 172.28.0.0/24 }]   # pin it, so TRUSTED_PROXIES can be exact

services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    networks: [edge, internal]
    depends_on: { app: { condition: service_healthy } }

  app:
    image: ghcr.io/jury-forge/app@sha256:...
    environment:
      ROLE: app
      # PUBLIC_URL is optional: set it only to freeze the origin (pre-provisioned/air-gapped).
      # Without it, the origin is written by setup (ADR-0021).
      SETUP_BIND: 0.0.0.0:8080          # inside the container; host publish is the loopback boundary
      DATABASE_URL_FILE: /run/secrets/database_url
      ENCRYPTION_KEY_FILE: /run/secrets/encryption_key
      SESSION_SECRET_FILE: /run/secrets/session_secret
      TRUSTED_PROXIES: 172.28.0.0/24        # the pinned internal subnet, not 172.16.0.0/12
      QUEUE_DRIVER: postgres
      OBJECT_STORAGE_DRIVER: local
    secrets: [database_url, encryption_key, session_secret]
    networks: [internal]
    expose: ["3000"]
    ports: ["127.0.0.1:8080:8080"]     # host loopback only; do not publish on 0.0.0.0
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD", "jury-forge", "healthcheck", "--url", "http://localhost:3000/readyz"]
      interval: 10s
      timeout: 3s
      retries: 6
    restart: unless-stopped

  worker:
    image: ghcr.io/jury-forge/app@sha256:...
    environment:
      ROLE: worker
      DATABASE_URL_FILE: /run/secrets/database_url
      ENCRYPTION_KEY_FILE: /run/secrets/encryption_key
    secrets: [database_url, encryption_key]
    networks: [internal]
    read_only: true
    restart: unless-stopped
    deploy: { replicas: 2, resources: { limits: { memory: 2g } } }

  scheduler:
    image: ghcr.io/jury-forge/app@sha256:...
    environment: { ROLE: scheduler, DATABASE_URL_FILE: /run/secrets/database_url }
    secrets: [database_url]
    networks: [internal]
    restart: unless-stopped

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: jury_forge
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
    volumes: ["postgres-data:/var/lib/postgresql/data"]
    networks: [internal]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U jury_forge"], interval: 10s, retries: 6 }
    restart: unless-stopped

secrets:
  database_url: { file: ./secrets/database_url }
  encryption_key: { file: ./secrets/encryption_key }
  session_secret: { file: ./secrets/session_secret }
  db_password: { file: ./secrets/db_password }
```

`TRUSTED_PROXIES` must be the **pinned Compose subnet** the proxy comes from, not `0.0.0.0/0` and not
the whole `172.16.0.0/12` private range — any container on any Docker network in that range could
otherwise spoof `X-Forwarded-*`. If a host-level proxy or cloud LB sits in front, add its CIDRs and
stop publishing Caddy directly.

Secrets use **files**, not environment values: Compose interpolates env into `docker inspect` and
`/proc/1/environ`, which defeats the encryption-key boundary. `ENCRYPTION_KEY_FILE`,
`SESSION_SECRET_FILE`, and `POSTGRES_PASSWORD_FILE` are the documented forms.

### Reference `Caddyfile` (on-demand TLS for a runtime-configured origin)

```caddyfile
{
    on_demand_tls {
        ask http://app:3000/api/internal/tls/allow
        interval 2m
        burst 5
    }
}

:80 {
    # ACME HTTP-01 + redirect; the app only serves bootstrap on loopback.
    redir https://{host}{uri} permanent
}

:443 {
    tls {
        on_demand
    }

    encode zstd gzip

    # Webhook and OAuth must not be buffered, compressed, or rewritten.
    @forge path /api/webhooks/* /api/auth/*
    handle @forge {
        reverse_proxy app:3000 {
            flush_interval -1
            transport http { read_timeout 30s }
        }
    }

    # Streaming (SSE) needs flushing; everything else is normal API + SPA.
    handle /api/* {
        reverse_proxy app:3000 { flush_interval -1 }
    }

    handle {
        reverse_proxy app:3000
        header {
            Strict-Transport-Security "max-age=31536000; includeSubDomains"
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            -Server
        }
    }
}
```

The `ask` endpoint returns `200` only for the single configured origin and `403` otherwise, so a
stranger's domain cannot obtain a certificate here. The origin is saved after pre-save DNS/port
validation and before TLS issuance; `ask` authorizes `public_url` only. During setup the UI shows
`tls_pending` until Caddy issues; `ready` waits for issuance, but the origin does not need to be
re-entered if issuance is slow or blocked. If the operator uses a fixed domain instead (model C, or a
pre-provisioned `PUBLIC_URL`), replace `:443` with the literal site address and drop `on_demand_tls`;
no other change is needed.

Request bodies are capped at the app (webhook ≤ 25 MB, knowledge pack ≤ 50 MB) and the proxy must
not impose a smaller limit. Do not enable response compression on `/api/webhooks/*` or SSE paths.

## 4. Variants

### A. Compose, bundled (default)

One host, one compose file, Caddy with **on-demand TLS** so the domain can be set during setup
(ADR-0021). Requires public DNS A/AAAA records and inbound 80/443; the origin is validated by setup
before the GitHub App is created. Backups are a `pg_dump` + object-storage snapshot to a target
outside the host.

### B. Compose, external services

Same stack with `DATABASE_URL` and `OBJECT_STORAGE_*` pointing at the operator's managed Postgres
and S3-compatible bucket; drop the `postgres`/`minio` services. Validate TLS to the database
(`sslmode=require`/`verify-full`), network egress, and that the bucket is not public. This is the
path to HA: two hosts, external Postgres, shared object storage, N workers.

### C. Behind an existing load balancer

Terminate TLS at the LB, forward to Caddy on the host (or to `app` directly on the internal network),
and set `TRUSTED_PROXIES` to the LB CIDRs. The LB must pass `Host`, preserve the body, support
WebSockets if streaming is enabled, and have generous idle timeouts for SSE. The app does not trust
`X-Forwarded-*` from any other peer. ACME is disabled in Caddy when the LB owns certificates; the
origin is still written in setup (or frozen with `PUBLIC_URL`) so redirects and webhook URLs are
built from it, not from `Host`.

### D. All-in-one / local (evaluation only)

One container with app, worker, scheduler, and a bundled Postgres. No public origin by default, so
the manifest flow is unavailable: use a fixture forge for the demo (default), manual app entry plus a
tunnel (`cloudflared`, `ngrok`) whose origin is entered as the instance origin, or a pre-provisioned
`PUBLIC_URL`. Bootstrap stays on loopback. Clearly labelled "evaluation only"; not supported for a
team production deployment.

### E. Kubernetes and Helm in v1 (ADR-0022)

One chart over the same images and the same runtime contract; Compose stays the reference the
product is developed against.

- **Deployables:** `app` (Deployment, 1–N), `worker` (Deployment, 1–N, HPA-friendly), `scheduler`
  (Deployment, **replicas: 1**, guarded by a Postgres advisory lock — not a CronJob), migrations as
  a pre-install/pre-upgrade **Job** with `helm.sh/hook-delete-policy` and `--atomic`.
- **No bundled state:** the chart never deploys Postgres, Redis, or object storage. Values take
  `DATABASE_URL`/external endpoint, S3, and `existingSecret` for the encryption/session keys. No
  PVCs, no StatefulSets for product data.
- **Ingress terminates TLS** (cert-manager or a pre-created secret). Caddy and on-demand TLS are not
  part of the chart. Split ingress rules so `/api/webhooks/*` and `/api/auth/*` are **not** behind
  SSO/oauth2-proxy, preserve the body, and allow long SSE timeouts.
- **Origin:** `values.origin` freezes it (ADR-0021); otherwise bootstrap with
  `kubectl port-forward svc/app 8080:8080` and set the domain in setup. The loopback rule still
  applies — never expose the bootstrap service through the ingress.
- **Security defaults:** `securityContext` non-root/read-only/drop-all, default-deny NetworkPolicy
  with explicit egress (GitHub, DB, S3, providers), PodDisruptionBudget for workers, ServiceAccount
  with no RBAC beyond what the controller needs.
- **Install:**

```bash
helm repo add jury-forge https://prakashsewani.github.io/jury-forge   # or: oci://ghcr.io/prakashsewani/charts
helm install jury-forge jury-forge/jury-forge \
  --namespace jury-forge --create-namespace \
  --set origin=jury.example.com \
  --set existingSecret=jury-forge-secrets \
  --set database.urlSecretKey=database_url \
  --set ingress.className=nginx
kubectl port-forward -n jury-forge svc/jury-forge-app 8080:8080   # only if origin is not set
```

- **Upgrade:** `helm upgrade --atomic` runs the migration hook; on failure the release rolls back and
  `/readyz` reports `migration_incomplete`. Code rollback = `helm rollback`; data rollback = restore
  (same rules as §8).
- **Support matrix:** Kubernetes 1.29+ (n-2 window refreshed each release), Helm 3.14+, amd64 + arm64,
  Postgres 16+, same object storage. ingress-nginx is the tested controller; Traefik documented.
- **Release gate:** chart lint + `helm template` diff + e2e on `kind` (install → setup → dry run →
  upgrade → rollback), plus `values.schema.json`.
- **Not in the chart:** bundled databases, Caddy, on-demand TLS, the fixture forge, air-gapped
  mirrors (F remains out of v1).

### F. Air-gapped / offline (TBD)

Mirror images and dependencies, use a local OpenAI-compatible model server, disable telemetry and
all update/licence checks, and document that forge connectivity still needs network unless the forge
(GHES/Gitea) is also inside. Requires a dedicated install test.

## 5. Networking and egress

**Inbound:** 80 (ACME redirect), 443 (proxy) from the internet; optional metrics from the monitoring
network only. Nothing else.

**Outbound (required):**

- `github.com`, `api.github.com` — App manifest, OAuth, installation tokens, reviews/comments.
- `codeload.github.com` and the git endpoint — **branch review only (v1.1)**: clone/fetch at a SHA
  for the T2 graph. PR review (T0) needs API access only.
- Every configured provider endpoint (and only those).
- Optional: S3 endpoint, SMTP, notification webhooks, OTel collector, SSO/OIDC issuer.

**Outbound (must not happen unless configured):**

- Telemetry or update pings. `TELEMETRY=off` is the default and there is no phone-home.
- Any provider host not bound to a stored key (key-to-origin binding), or not in
  `PROVIDER_EGRESS_ALLOWLIST`.
- Link-local/metadata ranges (`169.254.0.0/16`, `fd00:ec2::254`) from provider or knowledge fetches
  (SSRF guard).

Hardened deployments should route egress through an HTTP(S) proxy (`HTTPS_PROXY`/`NO_PROXY`), and
`doctor` reports the effective egress path. GitHub does not publish a stable webhook IP list to
allowlist, so webhook security is signature verification + rate limiting, not IP allowlisting.

## 6. TLS, headers, and proxy rules

- TLS 1.2+ (prefer 1.3), HSTS after the first successful HTTPS request, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, and a CSP
  that allows only same-origin scripts/data.
- **On-demand certificates are authorized, not open:** the origin is saved after DNS/port validation
  and before TLS issuance; Caddy `ask`s the app, which returns `200` only for the stored origin
  (single host, rate-limited). `:80` serves ACME HTTP-01 and redirects. No wildcard by default.
- **Host enforcement:** any request whose `Host` is not the stored origin gets `421 Misdirected
  Request`; never build a redirect, OAuth URL, or link from `Host`. The loopback bootstrap listener
  is the only exception.
- Do **not** cache `/api/*`; long-cache hashed SPA assets.
- Do not put `/api/webhooks/*` or `/api/auth/*` behind SSO, basic auth, or a WAF challenge.
- Preserve `Content-Length`/body exactly for webhooks; disable compression on those routes.
- Set generous read timeouts for SSE/streaming responses; short timeouts for webhook acks.
- If the proxy provides an identity header, never trust it unless explicitly configured and the
  peer is in `TRUSTED_PROXIES`; the app's own session auth is authoritative.

## 7. Secrets

| Secret | Where | Rotation |
| ------ | ----- | -------- |
| `ENCRYPTION_KEY` / `ENCRYPTION_KEY_FILE` | File preferred (Docker secret), never in the DB; backed up separately | Envelope-encrypted data keys allow rotation; rotation is an explicit CLI step |
| `SESSION_SECRET` / `SESSION_SECRET_FILE` | File preferred | Rotate invalidates sessions; acceptable |
| `BOOTSTRAP_TOKEN` | Generated once, hashed at rest, printed once | Disabled on claim; `setup rotate` |
| GitHub App private key, client secret, webhook secret | Postgres, envelope-encrypted | Re-enter/re-issue via the UI; audited |
| Provider keys | Postgres, envelope-encrypted, origin-bound | Verify/rotate in the UI; write-only |
| DB password, S3 credentials | Secret file (`DATABASE_URL_FILE`, `*_FILE`) | Operator-managed |
| Backup encryption key | Operator's store | Out of scope for the app |

`jury-forge init` generates random secrets into `secrets/` files with `0600` (never into `.env`),
writes `.env` with the non-secret settings, refuses to overwrite, and prints fingerprints (never
values). `jury-forge doctor` fails on default or obviously weak values and on world-readable secret
files.

## 8. Lifecycle: start, health, upgrade, backup

**Start order:** `postgres` healthy → migrations job completes → `app` healthy (`/readyz`) → `worker`
and `scheduler` start → Caddy serves. The app serves `/healthz` (process alive) and `/readyz`
(migrations at head, DB reachable, encryption key loads, queue pollable; storage degraded is
reported, not fatal).

**Migrations:** one-shot (`docker compose run --rm app jury-forge migrate` or a `migrate` service
with `restart: "no"`). Expand/contract only; the previous image must still run against the migrated
schema for the duration of the rollout. Expect a **short write pause** during expand migrations on
large tables: `app` serves a maintenance page instead of 5xx, and queued reviews resume from the
outbox. `jury-forge upgrade --dry-run` reports the lock risk before the window is announced; see
[`operations.md`](operations.md#4-upgrades).

**Upgrade:**

```bash
jury-forge backup --to /backups/pre-upgrade.dump
jury-forge upgrade --to vX.Y.Z --dry-run   # signature + digest check, migration/lock plan
docker compose pull          # digest-pinned images (signature verified per ADR-0020)
docker compose run --rm app jury-forge migrate
docker compose up -d         # old workers drain, new workers claim
jury-forge doctor
```

Code rollback = redeploy the previous digest (safe only while expand migrations have not been
followed by a contract step). Data rollback = restore from backup, never down migrations. Keep at
least the previous two image digests locally.

**Graceful shutdown:** workers stop claiming, finish or release leases, and exit within the
stop-grace period; the janitor reclaims anything abandoned. The scheduler uses a Postgres advisory
lock so two instances cannot run retention twice.

**Backups (minimum viable):**

- `pg_dump -Fc` on a schedule, encrypted, stored off-host.
- Object-storage copy or bucket lifecycle policy for artefacts.
- `ENCRYPTION_KEY` and proxy certs backed up separately from the database (a DB restore without the
  key is useless).
- Default target: daily dump = **24 h RPO**, **4 h RTO** (accepted, DEP-04); WAL archiving/pgBackRest
  is the documented team/HA upgrade (model B), not a v1 default.
- A tested restore drill before v1.

## 9. Sizing

| Deployment | vCPU | RAM | Disk | Notes |
| ---------- | ---- | --- | ---- | ----- |
| Personal / demo (model D) | 2 | 4 GB | 40 GB | All-in-one, no MinIO |
| Small team (model A) | 4 | 8 GB | 100 GB | Postgres + 2 workers |
| Team + index (v1.1) | 8 | 16 GB | 250 GB | Dedicated index worker, object storage |
| Larger (model B) | 16+ | 32 GB+ | 500 GB+ | External Postgres/S3, multiple workers |

These are starting points; the load test sets the real numbers (Q-012 support matrix, Phase 4).

## 10. Anti-patterns

- Exposing Postgres/Redis/MinIO or the app port to the internet.
- Running as root, privileged mode, or a writable root filesystem without need.
- Baking secrets into images or committing `.env`.
- Trusting `X-Forwarded-*` from any peer; `TRUSTED_PROXIES=0.0.0.0/0`.
- Migrations on every replica start; destructive migrations in the same release.
- Running the scheduler with more than one active replica without a lock.
- Single worker with no restart policy or health check.
- Backups on the same disk as the database; no restore drill.
- SSO/challenge in front of the webhook or OAuth callback.
- Using the all-in-one demo image for team production.
- A sub-path install (`https://host/jury-forge`) in v1.

## 11. Open decisions

| ID | Decision | Default |
| -- | -------- | ------- |
| DEP-01 | Bundled vs external Postgres default | Bundled in model A; documented external path (close ADR-0003 follow-up) |
| DEP-02 | Bundled Caddy vs "bring your own proxy" default | Caddy bundled; model C supported |
| DEP-03 | All-in-one image in v1 | After G1, labelled evaluation (Q-030) |
| DEP-04 | Backup RPO/RTO targets and tooling | **Accepted 2026-11-15:** daily dump = 24 h RPO / 4 h RTO for model A; document WAL/PITR as the team/HA upgrade (model B), revisit at the first team install |
| DEP-05 | Support matrix (distro, Docker, arch) | **Confirmed 2026-11-15:** Ubuntu 24.04 LTS, Docker 24+/Compose v2, amd64 + arm64 (Q-012) |
| DEP-06 | Required GitHub App permission set | Least privilege as in §2; pinned by the setup spec + security review |
| DEP-07 | Install/update channel | Signed release bundle, verify before extracting; no `curl \| sh` (ADR-0020) |
| DEP-08 | Sub-path hosting (`https://host/jury-forge`) | **Decided: unsupported in v1.** Use a subdomain; a path prefix breaks cookie scope, OAuth redirects, CSP, and proxy body handling for no real benefit |
| DEP-09 | Origin configuration | **Decided (ADR-0021):** set in setup, stored in Postgres; `PUBLIC_URL` env freezes it; loopback bootstrap; on-demand TLS |
| DEP-10 | Bare LAN/IP origins (`https://192.168.1.20`) | **Decided 2026-11-15: rejected.** No public TLS for a private IP; local/homelab uses the labelled evaluation mode with a fixture forge (or a tunnel with a real domain). A self-signed/pre-loaded cert mode is not in v1 |
| DEP-11 | Advanced deployment models in v1 | **Decided 2026-11-15 (Option 2):** models A–D plus **E (Helm) in v1** per ADR-0022; F (air-gapped) remains out of v1 |
| DEP-12 | Kubernetes support policy | Kubernetes 1.29+ (n-2 window), Helm 3.14+, ingress-nginx tested, Traefik documented (ADR-0022) |
