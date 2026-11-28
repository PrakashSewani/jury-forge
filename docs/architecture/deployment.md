# Deployment models

Jury Forge is container-first and self-hosted. This document defines the supported deployment
models, the required public surface, the reference topology, and the day-2 operations the stack
must support. The model choice is recorded in ADR-0003; the v1 stack in
[`technical-approach.md`](technical-approach.md) (ADR-0026) §2, §3.13, and §14; install behaviour in
[`../product/specs/first-run-setup.md`](../product/specs/first-run-setup.md).

**One sentence:** Docker Compose on one Linux host, behind Caddy on a public HTTPS origin, with
Postgres as the only durable state — everything else is replaceable.

## 1. Deployment models

| Model | Origin | State | Who it is for | Status |
| ----- | ------ | ----- | ------------- | ------ |
| **A. Compose, bundled** | Public HTTPS, Caddy + Let's Encrypt | Bundled Postgres 17, local volume | Default: small team on a VPS/VM/homelab | Reference (v1) |
| **B. Compose, external Postgres** | Public HTTPS, operator proxy or bundled Caddy | Operator's Postgres (17; 16 is tested, technical-approach TQ-4) | Teams with an existing database platform, HA | Supported (v1) |
| **C. Compose behind an existing LB** | Operator's LB, or an outbound tunnel (§4 C1), terminates TLS | As A or B | Orgs that already run ingress/SSO; hosts that should open no inbound port | Supported (v1); the tunnel variant is untested until M1.2 |
| **D. All-in-one, local** | `http://localhost:PORT` or a tunnel | Bundled Postgres | Evaluation, personal use, demos | Labelled evaluation mode, after G1 (Q-030) |
| **E. Kubernetes / Helm** | Operator ingress (cert-manager or TLS secret) | Operator Postgres | Platform teams, scale | **v1.2** (ADR-0022 as amended by ADR-0023); none in v1 |
| **F. Air-gapped** | Internal HTTPS | Local model + mirrored images | Regulated/classified | Not in v1 (technical-approach §3.11: v1.1+; Q-018) |

Rules that apply to every model:

- **Only the proxy is public.** Postgres, `app`, and `worker` are bound to the internal network,
  never `0.0.0.0`. The setup listener is published on host loopback only (§2).
- **`app` and `worker` are stateless.** All state is in Postgres: relational data, the queue, the
  audit log, and artefacts (bounded `bytea`). There are no sticky sessions, no local session files,
  and no artefact volume. The only other volume is Caddy's certificate store, which can be re-issued.
- **Workers need outbound egress, not inbound HTTP.** The only inbound path is the proxy → `app`.
- **Migrations run once**, in the one-shot `migrate` container, never on `app` or `worker` start.
- **The instance must survive a restart of any single service** without losing a claimed setup or an
  in-flight job. Jobs live in Postgres; a job interrupted by a crash runs again, and the steps it
  had finished are read back rather than redone (technical-approach §3.3).

## 2. The public surface GitHub requires

A GitHub App cannot be created until the instance has a public origin: the manifest records the
webhook, OAuth callback, and redirect URLs. The origin is therefore a **setup step**, not an `.env`
precondition (ADR-0021).

The origin (e.g. `https://review.example.com`) is:

- **set during first launch**, before the GitHub App step, and stored in Postgres; a
  `PUBLIC_URL` env var, if present, **freezes** it for pre-provisioned installs;
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
| Metrics | `/metrics` on `METRICS_BIND` (internal network) | Optional |

### Origin lifecycle

| Situation | Behaviour |
| --------- | --------- |
| **Unset (cold start)** | Only the loopback bootstrap listener and `/healthz` answer; `:443` has no certificate yet |
| **Set during setup** | Validate DNS/TLS → write `instance.public_url` with audit `origin.set` → Caddy issues on-demand → all other hosts `421` |
| **Frozen by `PUBLIC_URL` env** | UI shows the origin read-only; changing it requires changing env + restart; `doctor` explains |
| **Changed by an owner** | Re-auth, validate new origin, audit `origin.changed`, `PATCH /app` to move hook/callback/redirect URLs, sessions re-login, banner until webhook self-test passes |
| **Wrong/typo origin** | Webhook self-test fails; setup stays incomplete and shows the exact URLs to compare; no `ready` |

The origin change is capped (3 per hour) and audited. Certificates are issued only for the single
configured host: Caddy's `on_demand_tls { ask … }` asks the app, which approves only that host and
at most 5 times per 2 minutes, so an attacker cannot turn the instance into an ACME proxy. Caddy 2.11
no longer has `interval` and `burst`, so the limit is the app's alone
([ADR-0038](../decisions/ADR-0038-app-side-issuance-limit.md), proposed).

Notes:

- **There is no "Docker webhook URL".** Docker does not publish an address. GitHub calls the
  operator's domain, Caddy terminates TLS and forwards to `app`, and `app` verifies the
  `X-Hub-Signature-256` header. The same path works behind any proxy or LB that preserves the body
  byte-for-byte.
- **Webhook requests must be answered fast** (GitHub times out at ~10 s and retries). The route
  verifies the HMAC, inserts the `webhook_deliveries` row and its job in one transaction, and returns
  `202`; no forge API calls and no model calls happen inside the request (technical-approach §5.1).
- **Do not rewrite the body.** Compression, charset conversion, or an auth portal in front of
  `/api/webhooks/github` breaks the signature. Exempt these paths from SSO and from body-rewriting
  middleware.
- **The OAuth callback host must match the stored origin exactly** (scheme, host, port; `PUBLIC_URL`
  when frozen). A mismatch is the second-most-common failure; `doctor` compares them and refuses setup
  on a mismatch.
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
│  Host loopback ─8080─▶ app setup listener (before the origin)    │
│                                                                  │
│  internal network only:                                          │
│    migrate ×1   (one-shot: SQL migrations, then exits)           │
│    app ×1       (web/API + SPA + webhook ingest, /healthz /readyz)│
│    worker ×1–N  (jobs, turns, cron; no inbound)                  │
│    postgres ×1  (all state: data, queue, audit, artefacts)       │
│                                                                  │
│  Egress: api.github.com, github.com, configured provider origins,│
│          optional OTel collector                                 │
└──────────────────────────────────────────────────────────────────┘
```

| Service | Image | Replicas | Ports | Health | Persistent |
| ------- | ----- | -------- | ----- | ------ | ---------- |
| `caddy` | `caddy:2` (pinned by digest) | 1 | `80`, `443` public | HTTP probe | `caddy-data`, `caddy-config` |
| `migrate` | Jury Forge image, migrate command | one-shot | none | exits `0` | none |
| `app` | Jury Forge image, `ROLE=app` | 1 | `3000` internal; `127.0.0.1:8080` setup | `/healthz`, `/readyz` | none |
| `worker` | Jury Forge image, `ROLE=worker` | 1–N | none (`METRICS_BIND` internal) | process up; queue lag in `/metrics` and `doctor` | none |
| `postgres` | `postgres:17` | 1 | `5432` internal | `pg_isready` | `postgres-data` |

These are the four long-running containers plus the one-shot `migrate` of technical-approach §2 and
§3.13. None in v1: no Redis, no object store, no message broker, and no separate scheduler; the cron jobs
of technical-approach §3.3 run inside `worker`.

**Artefacts live in Postgres.** Raw diffs, model requests and responses, and exports are stored as
`bytea` rows in `artefacts`, each at most 2 MB, with `expires_at` and a daily retention job
(technical-approach §3.2, §17). The Postgres volume is therefore the one to size and back up (§8,
§9). An optional S3-compatible adapter is v1.2; none in v1.

Hardening defaults, encoded in the compose file rather than documented as advice:

- Non-root user, `read_only: true` with `tmpfs` for `/tmp`, `cap_drop: [ALL]`,
  `security_opt: [no-new-privileges:true]`.
- `restart: unless-stopped` (except `migrate`, which runs once); CPU/memory limits; log rotation
  (`max-size`, `max-file`).
- `depends_on`: `migrate` waits for `postgres` to be healthy; `app` and `worker` wait for `migrate`
  to complete successfully; `caddy` waits for `app` to be healthy.
- Images pinned by **digest** in the shipped compose file; `VERSION` tags are for reading.
- Secrets as files with `0600` or Docker secrets; nothing secret in the image, in `.env`, or in an
  environment value.
- `migrate`, `app`, and `worker` share one image, so migrations and both processes always match the
  same code version.

Compose shape (illustrative, not the final file; the final file lands with M1.2):

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
      - caddy-config:/config
    networks: [edge, internal]
    depends_on: { app: { condition: service_healthy } }
    restart: unless-stopped

  migrate:
    image: ghcr.io/jury-forge/app@sha256:...
    command: ["migrate"]                 # one-shot; the image runs `node /app/dist/main.js <command>`
    environment:
      DATABASE_URL_FILE: /run/secrets/database_url
    secrets: [database_url]
    networks: [internal]
    read_only: true
    depends_on: { postgres: { condition: service_healthy } }
    restart: "no"

  app:
    image: ghcr.io/jury-forge/app@sha256:...
    environment:
      ROLE: app
      # PUBLIC_URL is optional: set it only to freeze the origin (pre-provisioned installs).
      # Without it, the origin is written by setup (ADR-0021).
      SETUP_BIND: 0.0.0.0:8080          # inside the container; host publish is the loopback boundary
      DATABASE_URL_FILE: /run/secrets/database_url
      JURY_MASTER_KEY_FILE: /run/secrets/master_key
      TRUSTED_PROXIES: 172.28.0.0/24        # the pinned internal subnet, not 172.16.0.0/12
    secrets: [database_url, master_key]
    networks: [internal]
    expose: ["3000"]
    ports: ["127.0.0.1:8080:8080"]     # host loopback only; do not publish on 0.0.0.0
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    depends_on: { migrate: { condition: service_completed_successfully } }
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
      JURY_MASTER_KEY_FILE: /run/secrets/master_key
    secrets: [database_url, master_key]
    networks: [internal]
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    depends_on: { migrate: { condition: service_completed_successfully } }
    # Only for a `local` model server on the Docker host (ADR-0030):
    # extra_hosts: ["host.docker.internal:host-gateway"]
    restart: unless-stopped
    deploy: { replicas: 1, resources: { limits: { memory: 2g } } }   # raise replicas to scale (§9)

  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: jury_forge
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password   # read by the postgres image itself
    secrets: [db_password]
    volumes: ["postgres-data:/var/lib/postgresql/data"]
    networks: [internal]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U jury_forge"], interval: 10s, retries: 6 }
    restart: unless-stopped

volumes:
  postgres-data:
  caddy-data:
  caddy-config:

secrets:
  database_url: { file: ./secrets/database_url }
  master_key: { file: ./secrets/master_key }
  db_password: { file: ./secrets/db_password }
```

`TRUSTED_PROXIES` must be the **pinned Compose subnet** the proxy comes from, not `0.0.0.0/0` and not
the whole `172.16.0.0/12` private range — any container on any Docker network in that range could
otherwise spoof `X-Forwarded-*`. If a host-level proxy or cloud LB sits in front, add its CIDRs and
stop publishing Caddy directly.

Secrets use **files**, not environment values: Compose interpolates env into `docker inspect` and
`/proc/1/environ`, which defeats the master-key boundary. `JURY_MASTER_KEY_FILE` and
`DATABASE_URL_FILE` are the documented forms (technical-approach §14); `POSTGRES_PASSWORD_FILE` belongs
to the `postgres` image, not to Jury Forge. There is no session secret: sessions are random IDs stored
hashed (technical-approach §3.9). The full v1 environment list is in
[`operations.md`](operations.md#3-configuration).

### The bundle as built (WP 1-13, 2026-11-28)

The files are [`deploy/compose.yaml`](../../deploy/compose.yaml), [`deploy/Caddyfile`](../../deploy/Caddyfile),
[`deploy/.env.example`](../../deploy/.env.example), and [`deploy/init-secrets.sh`](../../deploy/init-secrets.sh).
[`scripts/compose-smoke-test.sh`](../../scripts/compose-smoke-test.sh) is the exit check, and CI runs
it on fresh amd64 and arm64 runner VMs. Where they differ from the illustrative shape above:

- **Networks:** three, not two.
  - `edge` carries Caddy's published ports and its ACME egress.
  - `internal` is `internal: true` (no egress) on the pinned `172.28.0.0/24`. Every service is on
    it, and `postgres` and `migrate` are on nothing else.
  - `egress` gives `app` and `worker` their outbound calls (GitHub, providers).
- **Secrets:**
  - Compose bind-mounts a file secret with its host owner and mode, and ignores the long-syntax
    `uid`, `gid`, and `mode` for file secrets (Compose file reference, `secrets` in the container
    specification). So each file is owned by the container user that reads it, mode `0400`:
    `database_url` by 65532 (the image's `nonroot`) and `db_password` by 70 (`postgres` in the
    Alpine image).
  - `init-secrets.sh` creates them as root. It refuses to overwrite and prints fingerprints only.
    `jury-forge init` (WP 1-17) replaces it.
  - **Limitation:** a Docker daemon with user-namespace remapping or in rootless mode shifts those
    uids, so the files are unreadable there. It is not supported until `init` handles it.
- **Users:**
  - `postgres` runs as `70:70`, so it needs no capability. A new volume inherits the image's data
    directory, which that user owns. `/var/run/postgresql` is a `tmpfs`.
  - `caddy` runs as the image's root with every capability dropped except `NET_BIND_SERVICE`.
  - `migrate`, `app`, and `worker` run as `nonroot`.
  - All five run with a read-only root filesystem, `no-new-privileges`, memory and CPU limits,
    and `json-file` log rotation (10 MB × 3).
- **Health:**
  - `app` is probed by `main.js healthcheck http://127.0.0.1:3000/readyz`. The distroless image has
    no curl, and the command accepts only plain-HTTP loopback URLs.
  - `caddy` is probed by `nc -z 127.0.0.1 443`. A probe of its admin API would log a line every
    10 s.
  - `postgres` is probed by `pg_isready` over TCP, since the image's first-start initialisation
    answers on the socket only.
  - `worker` has no probe: process up, as the table above says.
- **Roles:** the command is the role (`migrate`, `app`, `worker`). The image reads no `ROLE`
  variable.
- **Stop:** `worker` has a 15 s stop grace period, above graphile-worker's 5 s abort timeout (spike
  S-A R4). On `SIGTERM` it stops in about a second when idle, exits 0, and removes its heartbeat.
- **Not yet in the file:**
  - the master key (`JURY_MASTER_KEY_FILE`, WP 1-15);
  - `TRUSTED_PROXIES`, `PUBLIC_URL`, and the `front` variant (WP 1-14);
  - digest-pinned Jury Forge images: until the release pipeline (WP 4-05), `build` makes
    `jury-forge:local` from the checkout.
- **Caddy:** the Caddyfile is the minimum for WP 1-13. Health, metrics, and `/api/internal/*`
  answer 404 on the public listener. WP 1-14 added the `ask` endpoint (below); with no origin it
  refuses every name, so `:443` refuses every handshake.
- **Setup listener:** `0.0.0.0:8080` inside the container, published on `127.0.0.1:8080` only. The
  other containers on `internal` can also reach it; the bootstrap token (WP 1-15) is what guards it
  from them.

Measured in the WP 1-13 smoke test:
- First start: `migrate` applies 6 migrations, and the stack is healthy in about 40 s
  (Docker-in-Docker, amd64).
- After `down` and `up`: `migrate` applies 0, and the volume is kept.
- A `SIGKILL`ed `app` is restarted by the restart policy.

### The origin and TLS as built (WP 1-14, 2026-11-28)

WP 1-14 is split (owner, 2026-11-28). The origin plumbing is built. The setup route that sets the
origin waits for the bootstrap token (WP 1-15), and the `front` proof's GitHub calls wait for the
App (WP 1-16). Until then the origin is set only by `PUBLIC_URL` (in `.env`; `compose.yaml` passes
it to `app`).

- **The origin:**
  - `parseOrigin` (`domain`) accepts `https://<host>` only. It refuses, each with a typed reason:
    `not_a_url`, `not_https`, `has_credentials`, `has_port` (including an explicit `:443`),
    `has_path`, `ip_address` (DEP-10), and `not_public_name` (one label, `localhost`, non-LDH).
  - It stores a canonical form: lowercase, punycode, no trailing dot or slash.
  - The stored origin is the `origin` row of `instance_settings`: `{url, tls_mode}`, written with
    a compare-and-set on `version`. Each write audits `origin.set`, `origin.changed`, or
    `origin.tls_mode_set`, only for what changed.
  - `PUBLIC_URL` freezes the URL, not the mode. An invalid `PUBLIC_URL` stops `app` at start.
- **`ask`** (`GET /api/internal/tls/allow?domain=`):
  - `200` only for the origin's host, case- and trailing-dot-insensitive, in `caddy` mode, within
    5 approvals per 2 minutes;
  - otherwise `403` (`not_configured`, `other_name`, `front_mode`) or `429` (`rate_limited`), and
    `503` when the setting cannot be read;
  - every decision is logged.
- **`Host` pinning** on port 3000:
  - every route except the internal ones answers `503 origin_unset` before an origin exists, and
    `421 misdirected_request` for any other `Host`;
  - `:443` and a trailing dot are accepted, and `X-Forwarded-Host` is ignored;
  - internal routes (`/healthz`, `/readyz`, `ask`) skip pinning but answer `404` to any request
    carrying forwarding headers (`Forwarded`, `X-Forwarded-*`, `Via`). Caddy adds them to
    everything it proxies, so these routes cannot be reached through Caddy even if the Caddyfile
    block on them were removed.
- **Issuance check:** the app opens a TLS connection to `caddy:443` over the internal network, with
  the origin as SNI. It verifies the chain against the public roots Node trusts, and the name.
  - No hairpinning and no new egress (owner, 2026-11-28). The handshake also starts on-demand
    issuance.
  - Results are reused for 30 s while pending and 10 min once issued.
- **`/readyz`:** its status code covers the process's own dependencies only. `origin` is a field in
  the body (owner, 2026-11-28; `observability.md` §9):
  - `origin_unset`, `tls_pending` (with the handshake's reason), `tls_issued` (issuer and expiry),
    or `tls_front_unverified`;
  - `tls_front` needs the ADR-0036 proof, which arrives with WP 1-16;
  - an unreadable origin setting is `{state: "error"}`, and only then a 503.

Checked end to end by `scripts/compose-smoke-test.sh` against Pebble, Let's Encrypt's test ACME
server, which is test-only and not shipped:
- the configured name gets a valid certificate, and another name fails the handshake;
- another `Host` gets `421`, and `/readyz`, `/healthz`, `/metrics`, and `ask` answer `404` from
  outside;
- `/readyz` reports `tls_issued`.

### Reference `Caddyfile` (on-demand TLS for a runtime-configured origin)

```caddyfile
{
    on_demand_tls {
        ask http://app:3000/api/internal/tls/allow   # the app limits approvals (ADR-0038)
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

Request bodies are capped at the app (webhook ≤ 25 MB) and the proxy must not impose a smaller
limit. Do not enable response compression on `/api/webhooks/*` or SSE paths.

## 4. Variants

### A. Compose, bundled (default)

One host, one compose file, Caddy with **on-demand TLS** so the domain can be set during setup
(ADR-0021). Requires public DNS A/AAAA records and inbound 80/443; the origin is validated by setup
before the GitHub App is created. Backups are a `pg_dump` (which includes the artefacts) plus the
master key file, each stored off the host (§8).

### B. Compose, external Postgres

Same stack without the `postgres` service: `DATABASE_URL_FILE` points at the operator's Postgres 17
(16 is tested for this case). Validate TLS to the database (`sslmode=verify-full`), use a dedicated
role that owns the Jury Forge schemas (graphile-worker creates its own), and confirm network egress
from both `app` and `worker`. This is the path to HA: managed or replicated Postgres, `app` behind an
LB (model C), and N workers. There is no shared filesystem or bucket to arrange, because all state is
in the database; an external S3-compatible artefact store is v1.2.

### C. Behind an existing load balancer

Terminate TLS at the LB, forward to Caddy on the host (or to `app` directly on the internal network),
and set `TRUSTED_PROXIES` to the LB CIDRs. The LB must pass `Host`, preserve the body, and have
generous idle timeouts for SSE. The app does not trust `X-Forwarded-*` from any other peer. ACME is
disabled in Caddy when the LB owns certificates; the origin is still written in setup (or frozen with
`PUBLIC_URL`) so redirects and webhook URLs are built from it, not from `Host`.

### C1. Outbound tunnel (Cloudflare Tunnel as the worked example)

A tunnel agent on the host dials out to the tunnel provider's edge, and the edge forwards the
public hostname's traffic back through that connection. The host then opens **no inbound port**,
not even 80/443. This is model C with the tunnel edge as the load balancer: the edge terminates TLS,
and Caddy serves plain HTTP on the Docker network.

- **What it is not:** a Cloudflare dependency. The product ships no Cloudflare code, configuration,
  or required service, and Caddy with Let's Encrypt stays the default (ADR-0001 rejects Cloudflare
  as the *runtime target*; an ingress the operator chooses is the operator's network policy). Any
  tunnel that preserves the request body and the `Host` header fits the same rules.
- **Privacy trade-off, the operator's call:** TLS ends at the provider's edge, so the provider sees
  inbound traffic in plain text: webhook payloads (PR titles and bodies, comment text) and every
  dashboard page, including findings, code excerpts, and session cookies. Diffs are fetched and model
  calls are made outbound by `worker`, so they do not pass through the tunnel.
- **Status:** not tested. The first install, on the owner's 1 vCPU / 4 GB VPS in M1.2, is the test.

**Compose (illustrative).** Add a `cloudflared` service on the `edge` network only, so it can reach
Caddy and nothing else, pin the `edge` subnet, and remove the `ports` of `caddy`:

```yaml
networks:
  edge:
    ipam:
      config: [{ subnet: 172.28.1.0/24 }]   # pinned, so Caddy can trust exactly this range

services:
  caddy:
    # no `ports:` at all in this variant; the tunnel is the only way in
    networks: [edge, internal]

  cloudflared:
    image: cloudflare/cloudflared@sha256:...   # 2025.4.0 or later (needed for --token-file)
    command: ["tunnel", "run", "--token-file", "/run/secrets/tunnel_token"]
    secrets: [tunnel_token]
    networks: [edge]
    restart: unless-stopped
    # the same hardening as the other services (read_only, cap_drop, no-new-privileges),
    # to be confirmed against this image in M1.2

secrets:
  tunnel_token: { file: ./secrets/tunnel_token }   # a file, like every other secret (§7)
```

**Caddyfile.** Serve the configured hostname over plain HTTP, with no `on_demand_tls`, no `:80`
redirect, and no `tls` block; keep the `handle` blocks of the reference file. Caddy trusts only the
`edge` subnet for forwarded client IPs:

```caddyfile
{
    servers {
        trusted_proxies static 172.28.1.0/24
        client_ip_headers CF-Connecting-IP
    }
}

http://review.example.com {
    # the same @forge, /api/*, and default handle blocks as the reference Caddyfile
}
```

By default Caddy trusts no proxy and reads only `X-Forwarded-For`; `CF-Connecting-IP` holds the single
visitor IP that Cloudflare saw. `app` keeps `TRUSTED_PROXIES` at the internal subnet, so only Caddy may
set forwarded headers for it. The M1.2 test confirms which IP reaches `app` as the rate-limit key and
that a forged `X-Forwarded-For` sent from the internet is not trusted.

**Tunnel settings (Cloudflare dashboard):**

- Public hostname: the instance origin (for example `review.example.com`) → service `http://caddy:80`.
- **HTTP Host Header** (`httpHostHeader`): set it to the same public hostname. `app` answers `421` to
  any other `Host`, and Cloudflare's documentation does not say which `Host` is sent when this is unset.

**Must stay off the GitHub paths** (`/api/webhooks/*` and `/api/auth/*`), because GitHub cannot pass a
challenge or a login page:

- **Bot Fight Mode: off for the whole zone.** It cannot be skipped per path with WAF custom rules or
  Page Rules. Super Bot Fight Mode (paid plans) supports a Skip rule for the two paths instead.
- No managed challenge, "Under Attack" mode, or challenging rate-limit rule on those paths.
- **Cloudflare Access** may protect the dashboard, but those two paths must be excluded from it.
- No Workers, Transform Rules, or cache rules on `/api/*`.

**Limits checked against Cloudflare's documentation (2026-11-28):**

| Limit | Value | Effect here |
| ----- | ----- | ----------- |
| Request body, Free plan | 100 MB | Above the app's 25 MB webhook cap |
| Proxy read timeout | 125 s, then HTTP `524` (configurable on Enterprise only) | The live-progress stream (SSE) must send data well inside it; Cloudflare does not document how this applies to streams, so M1.7 tests it |

**Setup.** Reach setup over SSH as usual; the loopback listener is never routed through the tunnel.
DNS for the origin points at Cloudflare, so Stage 1.5 asks for the "I terminate TLS in front"
confirmation, which sets the origin's TLS mode to `front` (`first-run-setup` Stage 1.5,
[ADR-0036](../decisions/ADR-0036-tls-terminated-in-front.md)). Freezing the origin with `PUBLIC_URL`
is recommended for this variant; the confirmation is still asked. Setup does not wait for Caddy to
issue a certificate. `ready` comes when a signed GitHub webhook delivery has arrived through the
tunnel and the App's webhook still verifies certificates (`insecure_ssl` = `0`); until then setup
shows `tls_front_unverified`.

### D. All-in-one / local (evaluation only, after G1)

One container with app, worker, and a bundled Postgres. No public origin by default, so the manifest
flow is unavailable: use a fixture forge for the demo (default), manual app entry plus a tunnel
(`cloudflared`, `ngrok`) whose origin is entered as the instance origin, or a pre-provisioned
`PUBLIC_URL`. Bootstrap stays on loopback. Clearly labelled "evaluation only"; not supported for a
team production deployment (Q-030, ADR-0003 option 2).

### E. Kubernetes and Helm (v1.2)

Not in v1: Compose is the only supported v1 install (ADR-0023). The Helm chart ships in v1.2 under
[ADR-0022](../decisions/ADR-0022-helm-chart-in-v1.md) as amended by ADR-0023, over the same image and
the same runtime contract. The constraints that ADR fixes for the chart:

- **No bundled state:** the chart deploys no database; it takes an external Postgres through an
  existing Secret. No PVCs or StatefulSets for product data.
- **Ingress terminates TLS** (cert-manager or a pre-created secret); Caddy and on-demand TLS are not
  part of the chart. `/api/webhooks/*` and `/api/auth/*` stay out of SSO/oauth2-proxy, keep the body
  intact, and allow long SSE timeouts.
- **Origin:** `values.origin` freezes it (ADR-0021); otherwise bootstrap over
  `kubectl port-forward` on loopback and set the domain in setup. The bootstrap service is never
  exposed through the ingress.
- **Migrations** run as a pre-install/pre-upgrade Job; `helm upgrade --atomic`; code rollback is
  `helm rollback`, data rollback is restore (§8).
- **Security defaults:** non-root, read-only, drop-all `securityContext`; default-deny
  NetworkPolicy with explicit egress; no plaintext secret in `values.yaml`; no cluster-admin.

ADR-0022's component list and support matrix were written before technical-approach.
[ADR-0031](../decisions/ADR-0031-helm-chart-runtime-shape.md) (accepted 2026-11-28) reconciles them with the v1
runtime: `app` and `worker` Deployments plus a migration Job, cron in `worker`, external Postgres 17,
and an optional S3 adapter. This document does not restate them.

### F. Air-gapped / offline (not in v1)

Mirror images and dependencies, use a local OpenAI-compatible model server, and document that forge
connectivity still needs network unless the forge (GHES/Gitea) is also inside. Air-gapped installs
are v1.1+ (technical-approach §3.11; Q-018) and need a dedicated install test.

## 5. Networking and egress

**Inbound:** 80 (ACME redirect), 443 (proxy) from the internet; the setup listener on host loopback
only; optional metrics from the monitoring network only. Nothing else. With an outbound tunnel (§4
C1) there is no inbound port at all; the tunnel agent needs outbound access to its provider's edge
(see the provider's firewall requirements).

**Outbound (required):**

- `github.com`, `api.github.com` — App manifest, OAuth, installation tokens, reviews/comments.
  PR review reads the diff and files at a SHA through the API; there is no git clone in v1
  (technical-approach §3.7).
- Every configured provider origin, and only those.

**Outbound (optional, only when configured):**

- The OpenTelemetry collector at `OTEL_EXPORTER_OTLP_ENDPOINT` (off by default).
- An outbound proxy at `HTTPS_PROXY`.
- Not in v1: `codeload.github.com` and the git endpoint (branch review, v1.1); an S3 endpoint, an
  OIDC issuer, and notification webhooks (v1.2).

**Outbound (must not happen):**

- Telemetry or update pings. v1 has no telemetry and no phone-home, so there is nothing to switch
  off (ADR-0001).
- Any provider host not bound to a stored key (key-to-origin binding). The egress allowlist is the
  GitHub base URL plus the configured provider origins; there is no separate allowlist variable
  (technical-approach §3.11).
- Private, loopback, link-local, and metadata ranges (`169.254.0.0/16`, `fe80::/10`,
  `fd00:ec2::254`), with one exception below.

**Local model servers (ADR-0030).** A `local` provider may reach the loopback, private, or
Docker-host-gateway address the owner entered: that exact scheme, host, and port, with the resolved
addresses pinned when the provider is saved. Link-local and metadata ranges stay blocked, and the
instance's own listeners and database host are refused. Plain HTTP is accepted only when every
pinned address is loopback or private. In Compose, a model server on the Docker host is reached
through the host gateway (`extra_hosts: ["host.docker.internal:host-gateway"]` on the containers that
call it); `doctor` lists each `local` provider and its pinned addresses.

Hardened deployments can route egress through an HTTP(S) proxy (`HTTPS_PROXY`), and `doctor` reports
the effective egress path. GitHub does not publish a stable webhook IP list to allowlist, so webhook
security is signature verification + rate limiting, not IP allowlisting.

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
| Master key (`JURY_MASTER_KEY_FILE`) | File only (Docker secret, mode 0400), never in the DB or an env value; backed up separately | Envelope-encrypted data keys allow rotation; `jury-forge rotate-key` rewraps them |
| Bootstrap token | Generated once, hashed at rest, printed once; no env override in v1 | Disabled on claim; `setup rotate` |
| GitHub App private key, client secret, webhook secret | Postgres, envelope-encrypted | Re-enter/re-issue via the UI; audited |
| Provider keys | Postgres, envelope-encrypted, origin-bound | Verify/rotate in the UI; write-only |
| Receipt signing key | Postgres, encrypted under the master key (technical-approach §3.9) | Public key published at `/api/receipts/public-key` |
| DB password | Secret files (`DATABASE_URL_FILE`; the `postgres` image's `POSTGRES_PASSWORD_FILE`) | Operator-managed |
| Backup encryption key | Operator's store | Out of scope for the app |

`jury-forge init` generates random secrets into `secrets/` files with `0600` (never into `.env`),
writes `.env` with the non-secret settings, refuses to overwrite, and prints fingerprints (never
values). `jury-forge doctor` fails on default or obviously weak values and on group- or world-readable
secret files.

## 8. Lifecycle: start, health, upgrade, backup

**Start order:** `postgres` healthy → `migrate` exits `0` → `app` and `worker` start → `app` healthy
(`/readyz`) → `caddy` serves. The app serves `/healthz` (process alive) and `/readyz` (migrations at
head, DB reachable, master key loads, queue reachable). If `migrate` fails, `app` and `worker` do not
start, and `docker compose logs migrate` shows why.

**Migrations:** plain SQL files run by the one-shot `migrate` container (technical-approach §3.2).
`docker compose up -d` runs it first; `docker compose run --rm migrate` runs it on its own. It is
safe to re-run. Expand/contract only; the previous image must still run against the migrated schema
for the duration of the rollout. Expect a **short write pause** during expand migrations on large
tables: `app` serves a maintenance page instead of 5xx, and queued jobs wait in Postgres and resume.
`jury-forge upgrade --dry-run` reports the lock risk before the window is announced; see
[`operations.md`](operations.md#4-upgrades).

**Upgrade:**

```bash
jury-forge backup --to /backups/pre-upgrade.dump
jury-forge upgrade --to vX.Y.Z --dry-run   # signature + digest check, migration/lock plan
docker compose pull                        # digest-pinned images (signature verified per ADR-0020)
docker compose run --rm migrate            # expand migrations
docker compose up -d                       # app and worker restart on the new image
jury-forge doctor
```

`jury-forge upgrade --to vX.Y.Z` wraps the last four steps. Code rollback = redeploy the previous
digest (safe only while expand migrations have not been followed by a contract step). Data rollback =
restore from backup, never down migrations. Keep at least the previous two image digests locally.

**Graceful shutdown:** on `SIGTERM` a worker stops taking jobs and finishes or abandons its current
job within the stop-grace period. A job left locked by a crash is picked up again after the queue's
lock timeout; because each step's result is stored by `(turn_id, step)` and publishing checks a
stored `external_id`, the retry does not repeat side effects (technical-approach §3.3).

**Cron runs inside `worker`** through graphile-worker's built-in cron: reconciler (10 min),
retention (daily), stalled sessions (hourly), reaction poll (5 min, open sessions only), stuck-turn
sweep (5 min), and catalog refresh (daily) (technical-approach §3.3). graphile-worker
is designed to fire each cron tick once across all workers. The WP 1-10 integration test proves it with
two worker processes (two consecutive ticks, one run each), so more than one `worker` replica is safe
for cron; a crashed replica's jobs are released by the stuck-turn sweep (ADR-0037).

**Backups (minimum viable):**

- `pg_dump -Fc` on a schedule, encrypted, stored off-host. One dump covers everything durable: the
  relational data, the queue, the audit log, and the artefacts.
- The master key file (`JURY_MASTER_KEY_FILE`) backed up separately from the database: a restore
  without the key cannot decrypt any stored credential. `jury-forge backup` excludes it unless
  `--include-key` is passed; restore asks for the key file otherwise (technical-approach TQ-3).
- `caddy-data` is optional: certificates re-issue, within ACME rate limits.
- Default target: daily dump = **24 h RPO**, **4 h RTO** (accepted, DEP-04); WAL archiving/pgBackRest
  is the documented team/HA upgrade (model B), not a v1 default.
- A tested restore drill before v1; CI runs it nightly with receipt-chain verification
  (technical-approach §18).

## 9. Sizing

| Deployment | vCPU | RAM | Disk | Notes |
| ---------- | ---- | --- | ---- | ----- |
| **Floor** (≤ 20 developers, model A) | 2 | 4 GB | 20 GB | Release-gated (Q-048, technical-approach C2); idle RAM ≤ 1.2 GB for app + worker + Postgres |
| Small team (model A) | 4 | 8 GB | 100 GB | Postgres + 2 workers |
| Team + branch review (v1.1) | 8 | 16 GB | 250 GB | Adds the index worker queue |
| Larger (model B) | 16+ | 32 GB+ | 500 GB+ | External Postgres, multiple workers |

Disk is mostly the Postgres volume: database growth targets ≤ 50 MB per 1,000 reviews, plus the raw
model I/O kept as artefacts for 30 days (technical-approach §6). Shorter artefact retention is the
first lever on a small disk. These are starting points; the load test sets the real numbers (Q-012
support matrix, Phase 4).

## 10. Anti-patterns

- Exposing Postgres, the app port, or the setup listener to the internet.
- Running as root, privileged mode, or a writable root filesystem without need.
- Baking secrets into images, putting them in environment values, or committing `.env`.
- Trusting `X-Forwarded-*` from any peer; `TRUSTED_PROXIES=0.0.0.0/0`.
- Migrations on every replica start; destructive migrations in the same release.
- Starting `app` or `worker` against a schema the `migrate` container has not finished.
- Single worker with no restart policy or health check.
- Backups on the same disk as the database, or the master key in the same backup as the dump by
  default; no restore drill.
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
| DEP-11 | Advanced deployment models in v1 | **Decided 2026-11-15 (Option 2), amended 2026-11-16 by ADR-0023:** models A–C in v1, D after G1, **E (Helm) in v1.2**; F not in v1 |
| DEP-12 | Kubernetes support policy | **v1.2:** Kubernetes 1.29+ (n-2 window), Helm 3.14+, ingress-nginx tested, Traefik documented (ADR-0022); reconfirmed when the chart is specified |
| DEP-13 | Post-save TLS check when TLS ends in front of the instance (model C, the C1 tunnel) | **Decided 2026-11-28 ([ADR-0036](../decisions/ADR-0036-tls-terminated-in-front.md)).** The "I terminate TLS in front" confirmation sets the TLS mode to `front`; Caddy issuance is not waited for; `ready` needs a signed webhook delivery plus `insecure_ssl` = `0` on the App's webhook (`GET /app/hook/config`). A self-request to the origin was rejected: it needs NAT hairpinning and an egress exception |
