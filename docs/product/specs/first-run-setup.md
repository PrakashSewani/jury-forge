# Spec: First-run setup and instance bootstrap

- Status: **MVP gate — MVP-tier rows approved by the owner on 2026-11-28.** Later tiers stay draft and are approved before their milestone (per-milestone approval, 2026-11-27). Revised 2026-11-27 in the MVP spec review (release tiers, ADR alignment; see `delivery/status.md`).
- Date: 2026-11-15
- Owner: product + operations + security
- Principles: 1 (operator owns the instance), 4 (secure and private by default), 6 (secure by
  default), 8 (fail visibly)
- Related: ADR-0003 (Compose reference deployment), ADR-0011 (provider discovery), ADR-0016
  (reviewer catalog/bindings), ADR-0018 (tiers), ADR-0021 (origin), ADR-0023 (direction); [`../v1-ui.md`](v1-ui.md),
  [`provider-model-discovery.md`](provider-model-discovery.md),
  [`../../architecture/deployment.md`](../../architecture/deployment.md),
  [`../../architecture/operations.md`](../../architecture/operations.md),
  [`../../architecture/security.md`](../../architecture/security.md)
- Source: owner request 2026-11-15 — "we need first time setup for users plan that".

## Problem

Every other capability is unreachable until an operator gets from "I have a Linux host and a GitHub
org" to "a review landed on a test PR". Today that path is described in four places — the
deployment topology, the operations checklist, the security auth section, and the Setup page row in
the v1 UI — and in none of them end to end. The gaps that matter:

- **Chicken-and-egg.** The GitHub App manifest flow needs a public `PUBLIC_URL` and a reachable
  webhook before the app exists; DNS, TLS, and egress are the most common first-run failures, and
  nothing validates them before the operator is asked to create an app.
- **No owned setup state.** The PoC stored `installations[0]` (F-011) and gated the claim with a
  plain `SETUP_CODE` with no rate limit (F-012). The docs require a bootstrap token, an explicit
  first owner, and readiness derived from the database, but there is no state machine or recovery
  path: a half-finished setup currently has no name and no way forward.
- **No install modes for the evaluation path.** Drafts assume a public HTTPS origin. ADR-0003
  option 2 (all-in-one) and Q-030 exist, but the first-run flow for "laptop, no domain, no tunnel"
  is unspecified, so the fastest way to try the product is also the least defined (F-042: setup
  requires GitHub to reach the instance).
- **No funnel.** We cannot say how long setup takes, where operators abandon, or whether G1's
  "clean-machine install" is met, because no step is instrumented.

## Users and jobs

- **P1 Platform engineer** (primary): "Give me a working instance in under an hour, with secrets I
  generated, a TLS origin I own, and no vendor account."
- **P2 Security lead**: "Prove what the setup wrote, where keys live, and that the bootstrap window
  closed."
- **P3 Staff engineer / evaluator**: "Let me see a review on a throwaway repo today, without a
  domain or a tunnel."
- **P6 Auditor**: "Show who claimed the instance, when, from where, and which configuration
  changed afterwards."

## Release tiers

- **MVP (G1):** Stages 0–7 for the Compose public-host mode, one built-in reviewer, a single
  operator (the claimed owner), and every acceptance criterion except 11.
- **v1:** the three-reviewer default jury, the review receipt on success, member invites.
- **After G1 (Q-030):** the labelled all-in-one / local evaluation mode and criterion 11.
- **v1.2:** Helm (ADR-0023). Air-gapped and pre-provisioned installs stay out of v1.

## Behaviour

Setup is a **resumable, idempotent, server-owned state machine**, not a wizard that lives in browser
state. The browser renders the current step; the server decides it.

### State model

`instance.setup_state` (single row, single-tenant v1):

| State | Meaning | What is allowed |
| ----- | ------- | --------------- |
| `uninitialized` | Images start, migrations applied, no secrets confirmed | `/setup/*` only; everything else 503 with a setup link |
| `bootstrapping` | Bootstrap token activated; origin, App, and first owner claim in progress | origin, app creation, claim, preflight |
| `claimed` | First owner exists and is signed in | provider, reviewer, binding, test review |
| `ready` | Required steps complete; first review posted | everything; setup becomes a checklist |
| `degraded` | Was ready; a dependency or credential failed | full UI plus a blocking banner and a repair link |

Invariants:

1. Every transition is a conditional update on the previous state (compare-and-set), so two browser
   tabs, a retry, or a duplicate webhook cannot half-apply a step (F-074).
2. Each step is idempotent: re-running it converges to the same rows, never duplicates or overwrites
   a completed step silently.
3. The server, not the client, computes "what is next". The UI may not skip a step; the API rejects
   out-of-order writes with a typed error (`setup_step_out_of_order`).
4. Setup state is derived where possible (`readiness` from rows) and stored only for decisions that
   cannot be derived (claim actor, claim time, token rotation, dismissed warnings).

**Order:** origin → GitHub App → owner claim → provider → jury → first review. The App must exist
before the claim because the claim uses its OAuth client; the origin must exist before the App
because the manifest records its URLs. A claim without an App returns `setup_step_out_of_order`.

### Stage 0 — Preflight, before setup is opened

Run by `jury-forge doctor` (CLI) and repeated by the server at `/setup` load:

- If `PUBLIC_URL` is set, it is absolute HTTPS, parses, and matches the request `Host` (or a warning
  that the proxy rewrites it). **If it is not set, the origin is collected in Stage 1.5** — the
  instance is not misconfigured, it is simply uninitialised (ADR-0021).
- **GitHub-facing paths resolve on that origin:** `POST {ORIGIN}/api/webhooks/github` is reachable
  from outside the host and `GET {ORIGIN}/api/auth/github/callback` is the OAuth callback. There is
  no "container webhook URL"; Docker publishes nothing — GitHub calls the operator's domain and the
  proxy forwards it.
- TLS terminates correctly; `TRUSTED_PROXIES` (technical-approach §14: the pinned Compose subnet of
  the bundled Caddy, or the operator's load balancer CIDRs) covers the actual peer; forwarded headers
  are ignored from other peers.
- Outbound reachability: `api.github.com` and `github.com`; provider origins are checked when a
  provider is added (Stage 4). There is no separate egress allowlist variable: the allowlist is the
  GitHub base URL plus the configured provider origins (technical-approach §3.11).
- **Enterprise org blockers** are surfaced before the operator spends time on OAuth: org IP
  allowlist (`ip_allow_list`), SAML SSO enforcement (`sso_required`), OAuth app restrictions, and
  repository access policy. Each is a warned, typed result with the org-side fix, not a generic
  "login failed" (see [`deployment.md`](../../architecture/deployment.md#enterprise-org-blockers-check-before-promising-an-install)).
- Postgres reachable, migrations at head, queue pollable. Artefacts live in Postgres in v1; there is
  no object storage to check (technical-approach §2; the S3 adapter is v1.2).
- The master key file (`JURY_MASTER_KEY_FILE`) exists, is readable only by the app user, is not a
  sample value, and decrypts its own probe record; a mismatch fails closed with
  `encryption_key_mismatch`. There is no session secret to check: sessions are random IDs stored
  hashed (technical-approach §3.9).
- Clock skew, disk headroom, and container user are reported, not enforced.

`doctor` prints the same checks as the UI and exits non-zero on blockers. Every failure carries a
remedy and a docs anchor; no raw stack traces.

### Stage 1 — Bootstrap token

- On first boot the server generates a single-use **bootstrap token**, writes it once to stdout/log (`setup token: …`) and stores only a hash, with `created_at`,
  `expires_at` (default 24 h), `attempts`, `last_attempt_at`. The log line is excluded from support
  bundles and redacted by the log pipeline; `jury-forge setup token` re-prints it to the operator's
  terminal only.
- There is no environment override for the token in v1 (technical-approach §14): pre-provisioned
  installs are out of v1, and an env value would sit in `/proc/1/environ` for the container's life.
- `/setup` accepts the token in a form POST only; failures are constant-time compared, rate-limited
  per IP and globally, and increment `attempts`; 5 failures in 15 minutes pauses claims and raises a
  visible alert. Every attempt is audited (no token material).
- The token is **disabled** on claim, on `jury-forge init --rotate`, after expiry, or by
  `jury-forge setup disable`. Disabled means `410` plus a documented recovery (`create-admin`).
- No claim cookie is required to bootstrap; the session cookie is only issued after GitHub OAuth
  succeeds, so plain-HTTP and LAN installs are not blocked by `Secure` (F-013, PoC cookie flaw).

### Stage 1.5 — Public origin (domain)

Runs after the bootstrap token is accepted and **before the GitHub App exists**, because the App
manifest records the webhook, callback, and redirect URLs (ADR-0021). The operator reaches setup on
the loopback listener (`SETUP_BIND`; Compose binds `0.0.0.0:8080` inside the container and publishes
`127.0.0.1:8080:8080` on the host; a native install uses `127.0.0.1:8080`) via an SSH tunnel, `curl`
on the host, or `jury-forge setup domain <host>` — never by exposing setup on the public internet.

1. Operator enters `https://<host>` (e.g. `jury.example.com`). Path prefixes, bare IPs, and
   non-HTTPS values are rejected with a typed reason (DEP-08).
2. **Pre-save validation** (the origin is not yet stored):
   - **DNS:** A/AAAA resolves; if it points elsewhere, explain the proxy/CDN case and require an
     explicit "I terminate TLS in front" confirmation.
   - **Ports:** 80/443 reachable from the public internet (best-effort; GitHub's callback is the
     authoritative test later).
3. Confirmation writes `instance.public_url` and audits `origin.set` (actor, old, new, IP).
4. **Post-save validation** (the origin is stored, so Caddy can authorize it):
   - **TLS:** Caddy's `ask` endpoint authorizes `public_url`; Caddy issues on demand. The UI shows
     `tls_pending`/`issued` and the certificate issuer, not a spinner. `ready` stays false until
     issued.
   - **Host enforcement:** a request with any other `Host` returns `421`, proving the origin is
     pinned.
   - If TLS fails, the origin remains saved; `ready` stays false with a typed error and the repair
     path (DNS, firewall, proxy). The operator does not re-enter the origin unless it is wrong.
5. If `PUBLIC_URL` is set in the environment, the field is read-only and the UI explains that the
   origin is frozen by configuration; changing it is an env + restart operation.
6. Changing the origin later is a first-class owner action: re-auth → validate → write →
   `PATCH /app` updates hook/callback/redirect URLs → banner until the webhook self-test passes.
   Capped at 3 changes/hour, audited.

Until an origin is set, `:443` has no certificate and only the loopback listener answers; `/readyz`
reports `origin_unset`. After the origin is saved but before TLS is issued, `/readyz` reports
`tls_pending`; other hosts get `421` once the app knows the origin.

### Stage 2 — GitHub App and installation

Requires a saved origin from Stage 1.5. TLS issuance may still be pending; the App can be created and
the owner claim can proceed, but `ready` waits for TLS and the webhook self-test. **The App is created
before the owner claim**, because the claim uses the App's OAuth client. **Manifest flow (default,
github.com):** the server builds the manifest from the stored origin, the operator authorizes it on
GitHub, the callback stores the app credentials **encrypted**, and the server verifies permissions and
event subscriptions against the required set below.

If the manifest flow is unavailable (GHES, air-gapped, pre-provisioned), the operator pastes the App
id, slug, private key, and webhook secret; the server verifies them and stores them encrypted. This
is the only manual path, and it still requires the bootstrap token.

Least-privilege App surface (pinned; owner approved 2026-11-15):

| Permission | Level | Why | Not needed yet |
| ---------- | ----- | --- | -------------- |
| Repository contents | read | Diff, files at SHA, instructions | write (no auto-fix) |
| Pull requests | write | Reviews, review comments, suggested fixes as comments | merge, close |
| Issues | write | Top-level PR conversation comments | labels beyond the trigger labels |
| Checks | write | Check Run trigger actions and status | — |
| Metadata | read | Mandatory for every App | — |
| Members | — | — | `members: read` only if org-role mapping ships (ADR-0008), then add an ADR |
| Workflows / actions | — | — | never in v1 |

Events: `pull_request`, `issue_comment`, `pull_request_review_comment`, `check_run`, `installation`,
`installation_repositories`. Any expansion is a security-review change, not a setup toggle.

- **Installation selection:** list every installation the app can see and require an explicit
  choice (F-011). Never `installations[0]`. v1 stores one active installation; the model keeps the
  installation boundary so multi-installation can follow. Installation selection and the webhook
  self-test may be completed after the owner claim; they gate `ready`, not the claim.
- **Webhook self-test:** after install, the server asks GitHub to deliver a ping (or reads the
  `installation` event), verifies the signature, and shows "webhook verified · <delivery id>". Until
  verified, the step stays incomplete and `ready` is false; the owner claim can still proceed.
- **Reachability failure** (webhook never arrives within N minutes) shows a targeted checklist:
  DNS, TLS chain, proxy path, origin mismatch, IP allowlist on the host, SSO/WAF on the path.

### Stage 3 — First owner claim

The App from Stage 2 supplies the OAuth client id/secret. If no App exists, the API returns
`setup_step_out_of_order` and the UI sends the operator back to Stage 2; there is no claim without
an App.

1. The bootstrap token, submitted by **form POST** on the loopback listener (Stage 1; never in a
   URL or query string), is exchanged for a short-lived **claim intent** (10 min, single use, bound
   to the token id and a nonce), then the server redirects to GitHub OAuth using the App's client.
   Only the opaque claim-intent id travels in the OAuth `state`.
2. GitHub identity is verified (`/user`, verified email, installation visibility). The UI shows the
   account that will become owner; nothing is written until the operator confirms.
3. Confirmation creates the owner in one transaction: `user`, `role=owner`, `audit.owner_claimed`
   (actor, IP, user agent, time), token disabled, state → `claimed`.
4. A second claim attempt with a valid token when an owner exists is refused (`instance_claimed`)
   and audited; ownership transfer is an admin action, not a setup action.
5. **Dashboard login is required from MVP onward.** GitHub OAuth login (same App via
   `request_oauth_on_install`, or a separate OAuth app) is the only sign-in path in v1; every later
   role/SSO feature builds on it. An instance with an owner but no working callback URL is not
   `ready`.

### Stage 4 — Provider, model, and key

Follows [`provider-model-discovery.md`](provider-model-discovery.md): key validated before storage,
write-only, origin-bound, catalog fetched, `hasKey` only in responses. Setup adds:

- A **skip** that leaves the instance `claimed` but not `ready`, with a persistent "no provider"
  state and a link back. Reviews cannot run without a provider; the UI must say so before a trigger.
- A local-model shortcut (Ollama/vLLM base URL) that runs the same discovery call, under the
  `local` provider egress rules in [ADR-0030](../../decisions/ADR-0030-local-provider-egress.md).
- **A capability probe before binding** (ADR-0029, [`provider-model-discovery.md`](provider-model-discovery.md)
  §2.1): the chosen model must pass the probe before Stage 5 can bind it. The probe's token estimate
  is shown before it runs; a failed probe shows the per-mode results and keeps the instance
  `claimed`.
- A failure path that keeps nothing: no partial provider row, no key fragment in logs.

### Stage 5 — Default jury and binding

- **Default jury:** in MVP, one built-in reviewer; in v1, the three built-in reviewers —
  **Security, Correctness, Tests** — with the option to deselect one. They are editable later; there
  is no catalog or capability registry in v1.
- **Binding:** bind the jury to one repository with `required`/`default` and optional path scopes;
  show the resolved jury preview (“this PR would run: Security, Correctness, Tests”). No binding
  means no reviewer, and the UI must say so with a one-click **Bind default jury** action.
- **Policy:** `.jury-forge.yml` is shown read-only if present; the setup step only reports what it
  will do. Automatic review stays off.

### Stage 6 — First review (the gate that matters)

- Offer three paths: a real PR the operator picks, a **sample PR** in a repo the app can see
  (created by the operator), or a **dry run** against a bundled fixture diff using the configured
  provider (no forge writes). The dry run exists so a provider/quota failure is caught before a real
  PR is touched; it is labelled and does not create a session.
- Trigger through the real path (`jury:pr-review` label, Check Run, or UI picker), then show the same
  progress the user will see in production: the **Check Run** moves
  `queued → in_progress → completed`, the session timeline fills in, and the review appears once.
  For this explicit manual trigger, the placeholder comment is on by default and is edited in place,
  not posted as a series.
- Success shows the posted review link, per-turn token/cost, and (in v1) the review receipt, then a
  “setup complete” state → `ready`.
- Failure shows the typed error (`provider_auth_failed`, `github_rate_limited`, `no_reviewers`,
  cap exceeded) with the next action, and leaves state `claimed`.

### Stage 7 — Hardening, surfaced but not blocking

Presented as a checklist with "remind me later" (advisory, not gating `ready`):

- Backups scheduled and a restore drill run.
- The bootstrap token confirmed disabled; secrets stored outside the DB; the master key file backed
  up separately.
- Metrics/alerts connected (optional).
- Retention defaults reviewed; telemetry confirmed `off`.

### Setup modes

| Mode | Origin | Difference |
| ---- | ------ | ---------- |
| **Compose, public host** (default) | HTTPS, set in Stage 1.5 (or frozen by `PUBLIC_URL`) | Full flow above. |
| **Compose, external Postgres** | HTTPS | Stage 0 validates the external database (TLS, version, migration rights); no local database volume. An S3 artefact adapter is v1.2. |
| **All-in-one / local** (post-G1, Q-030) | `http://localhost:PORT` | Manifest flow unavailable; **fixture forge is the default demo path** (no tunnel, deterministic, doubles as the eval harness entry); manual app entry for a real local App; tunnel documented, not bundled. Labelled "evaluation only". |
| **Kubernetes / Helm** (v1.2, ADR-0022 as amended by ADR-0023) | HTTPS via ingress | Same flow; bootstrap via `kubectl port-forward svc/app 8080:8080` (never through the ingress); `values.origin` may freeze the origin; no on-demand TLS, no bundled databases. |
| **Pre-provisioned / air-gapped** (out of v1) | Any | Secrets supplied by env/files; no manifest; provider is local; forge is GHES or a mirror. |

### Recovery paths (first-class, not docs-only)

| Situation | Behaviour |
| --------- | --------- |
| Token lost or expired, no owner yet | `jury-forge create-admin --recover` (host access required), audited; prints a new one-time token. |
| Owner exists, claim replayed | Refused + audited; ownership transfer is a separate admin flow. |
| Master key file (`JURY_MASTER_KEY_FILE`) rotated/lost | Fail closed with `encryption_key_mismatch`; documented restore-from-backup only. |
| Wrong installation stored | "Change installation" re-runs Stage 2 safely; pending sessions on the old installation are paused with a reason. |
| Setup page loops / OAuth fails | App missing or OAuth callback wrong, or the Stage 2/3 order was skipped; create/verify the App, then claim; re-run Stage 1.5 if the origin is stale; `PATCH /app` updates URLs |
| Origin changed | Validated, audited, App URLs updated; sessions re-login; banner until webhook self-test passes |
| Bad domain / DNS not pointing at the host | Typed `dns_mismatch` with the records to create; origin is not saved |
| Ports 80/443 blocked | `tls_unreachable`; the origin may be saved but `ready` is false; checklist for firewall/security group and retry |
| TLS not issued after save | `tls_pending`; origin saved; `ready` false; fix DNS/firewall/proxy and retry; no need to re-enter the origin |
| Origin frozen by `PUBLIC_URL` | Field read-only; change env + restart, then `doctor` |
| Setup abandoned mid-way | State is `bootstrapping`/`claimed`; `/setup` resumes at the first incomplete step and shows how long it has waited; after 7 days `doctor` warns and `/metrics` reports it (no cron job; audit Q-D) |
| Reinstall on existing volumes | Detected by migrations + instance row; setup resumes, never silently re-initialises |

## Non-goals

- Hosted/multi-tenant provisioning, a signup form, or a hosted control plane (AGENTS.md 5).
- Multi-org and multi-installation setup in v1 (Q-004; the model keeps the boundary).
- **Multiple users in MVP.** MVP is a single operator (the claimed owner); member invites and role
  management are v1. This is a stated limit, not an oversight.
- Helm is a v1.2 install path (ADR-0022 as amended by ADR-0023), not the reference and ships no bundled databases
  or on-demand TLS. No Kubernetes operator/CRD; air-gapped remains out of v1.
- A marketplace or one-click cloud images at first run.
- **Sub-path hosting** (`https://host/jury-forge`). Unsupported in v1; the origin is an authority
  with no path (DEP-08). Use a subdomain.
- Auto-configuring DNS or certificates beyond the Caddy defaults.
- Letting the browser decide setup state, or letting the first visitor become owner.

## Acceptance criteria

1. On a clean Ubuntu 24.04 host with Docker 24+/Compose v2 installed and a verified release bundle
   (ADR-0020) on disk, `jury-forge init` plus setup reaches a posted test review in **≤ 15 minutes
   median (≤ 60 min p90)** without editing source or reading a troubleshooting page. The timer starts
   when the verified bundle is on the host and Docker/Compose are present; it stops when the first
   review is visible on the test PR. Docker installation, DNS propagation, provider account/key
   creation, GitHub org admin work, and test repo/PR creation are measured separately and are not
   inside the 15 minutes. No `curl … | sh` anywhere in the docs.
2. `jury-forge doctor` exits non-zero and names the remedy for each of: missing/invalid origin,
   non-HTTPS origin, unreachable Postgres, a missing, sample, or group/world-readable master key
   file, origin/`Host` mismatch, untrusted proxy header, missing secret file, and GitHub
   unreachable.
3. No secrets are written to the database in plaintext; `provider` and `github_app` ciphertext
   round-trips, and a master-key mismatch refuses to start with `encryption_key_mismatch`.
   Secrets are read from `*_FILE` paths in the reference Compose file (`JURY_MASTER_KEY_FILE`,
   `DATABASE_URL_FILE`), not from environment values.
4. Bootstrap token: single use, expires, rate-limited (5 failures/15 min pauses), audited, and
   disabled after claim; a replay returns `instance_claimed` and writes an audit row.
5. Claim never uses `installations[0]`: with two installations visible, the operator must choose,
   and the chosen id is the one stored.
6. Webhook self-test is required before `ready`; an unreachable webhook never reaches `ready` and
   shows the URL to check.
7. Every setup mutation is idempotent and safe under concurrent retries (two tabs, doubled callback,
   replayed webhook) — verified by a fault-injection test.
8. A run with no provider, or with no bound reviewer, is blocked in the UI and returns
   `no_provider`/`no_reviewers`; the instance never reports `ready` while either is missing.
9. `setup_state` transitions are audited with actor, time, and step; the audit export contains them.
10. A setup abandoned after Stage 3 (owner claimed) resumes at Stage 4 and does not re-create the
    App or owner; abandoned after Stage 2 resumes at Stage 3.
11. **(After G1, Q-030 — not part of the G1 script.)** Local/evaluation mode completes the setup
    stages (origin through first review) without a public URL (tunnel or fixture forge), and the
    instance is labelled "evaluation only".
12. Setup works at 1280 px and 375 px widths, keyboard-only, with visible focus and no colour-only
    status; screen-reader labels on every step and error.
13. Every user-facing setup error maps to a stable code, a remedy, and a docs anchor; no 500s from
    GitHub/provider failures (F-071).
14. **GitHub OAuth login works in MVP:** sign-in creates a session (HttpOnly, Secure, SameSite=Lax),
    sign-out revokes it, and the owner can reach the dashboard only through it. A wrong or
    unreachable callback URL fails Stage 0/3 with a typed error, not a loop.
15. On an org with SAML SSO enforced, OAuth-app restrictions, or an IP allowlist, setup fails with
    `sso_required` / `oauth_app_restricted` / `ip_allow_list` plus the org-side fix, and never loops
    or reports `ready`.
16. **The origin is set during setup, not in `.env`:** with `PUBLIC_URL` unset, the operator enters a
    domain on the loopback listener, pre-save DNS/port validation runs, the origin is stored and
    audited, and then TLS issuance and host pinning run post-save; the GitHub App step uses it — no
    file edit, no restart.
17. After the origin is set, a request with any other `Host` returns `421`, and no redirect, OAuth
    URL, or CSRF check is built from `Host`.
18. Changing the origin as owner: re-auth required, audit `origin.changed`, GitHub App URLs updated
    via `PATCH /app`, sessions re-login, and `ready` returns only after a webhook self-test on the
    new origin. More than 3 changes/hour is refused.
19. With `PUBLIC_URL` set in the environment, the origin field is read-only and a change requires
    env + restart; `doctor` explains the lock.
20. **The App is created before the owner claim.** A claim attempt with no App returns
    `setup_step_out_of_order`; the UI sends the operator back to Stage 2.
21. **The timing target is install-to-first-review**, as defined in criterion 1. Prerequisites are
    measured separately and reported as their own funnel.
22. **The setup listener is reachable on host loopback only.** Compose binds `0.0.0.0:8080` inside
    the container and publishes `127.0.0.1:8080:8080`; a native install binds `127.0.0.1:8080`. It is
    not reachable on the host's public interface.

## Metrics

Instrumented per step (no code content, no token material; local counters + optional operator
export; telemetry stays `off` by default):

- **Time to ready** (p50/p90), **install-to-first-review** (criterion 1), and **time to first posted
  review**.
- **Step funnel**: entered/completed/abandoned per stage, with the blocking error code.
- **First-attempt success rate** for preflight, origin/DNS, app creation, TLS issuance, claim,
  provider validation, webhook verification.
- **Support load**: doctor failures per install; recovery commands used.
- **Security**: claim attempts, rate-limit trips, `instance_claimed` replays.

Targets (to confirm with the install spike): ≥ 80 % first-attempt completion for preflight and
provider validation; < 5 % of installs needing a recovery command; zero plaintext-secret findings in
the security test.

## Security and privacy

- Trust boundaries: browser ↔ app (setup endpoints are pre-auth, so they are the most exposed
  surface), app ↔ GitHub, app ↔ provider, host operator ↔ container.
- Pre-auth surface is limited to `/setup/*` on the **loopback listener** (Compose: `0.0.0.0:8080`
  inside the container, published `127.0.0.1:8080:8080`; native: `127.0.0.1:8080`), rate-limited,
  CSRF-protected, and disabled once claimed. Exposing it beyond loopback requires an explicit env
  change, is warned by `doctor`, and still needs the bootstrap token.
- The origin is stored, not inferred: `Host` is never used to build OAuth redirects, CSRF origin
  checks, or links; other hosts get `421`. This closes host-header injection.
- The origin is saved after DNS/port validation and before TLS issuance; `ask` authorizes only
  `public_url`, so no certificate is issued for a candidate host. Issuance is capped, so the instance
  cannot be used to obtain certificates for other names.
- Bootstrap token: 256-bit random, hashed at rest, single use, expiry, attempt counters, audit; never
  in a URL after the exchange (claim intent is short-lived and single use).
- Secrets are generated, not defaulted; `jury-forge init` writes `.env` and `secrets/*` with `0600`
  (or Docker secrets), refuses to overwrite, and prints fingerprints (not values) so the operator can
  verify without leaking.
- The encryption key is never stored in the database and never logged; decryption failures are
  fail-closed.
- Provider keys follow [`provider-model-discovery.md`](provider-model-discovery.md): validated before
  storage, write-only, origin-bound.
- Setup performs no egress beyond GitHub and the provider the operator names; the preflight report
  lists each host contacted.
- Setup data retention: failed setup attempts kept 90 days; the instance row and audit are permanent.

## Risks and open questions

| ID | Question | Default assumption |
| -- | -------- | ------------------ |
| SU-01 | Is the all-in-one evaluation image in the first release (Q-030)? | After G1; the setup flow is designed so it can be enabled without a second architecture. |
| SU-02 | Do we ship a tunnel-assisted local mode, or a fixture forge? | Fixture forge for CI/demos; tunnel documented, not bundled. |
| SU-03 | Does v1 allow multiple installations at setup, or one active + later? | One active, all discovered and selectable; the schema keeps the boundary (Q-004). |
| SU-04 | Is the first owner always the GitHub account that claimed, or can an operator pre-create users? | Claim creates the owner; `create-admin` covers pre-provisioned installs. |
| SU-05 | Is the bootstrap token log line acceptable, or must it be file-only? | Log line once, plus `jury-forge setup token` to re-print; file-only if the security review asks. |
| SU-06 | Minimum supported host: does Compose install manage Docker, or assume it? | Assume Docker + Compose present; `doctor` checks versions and refuses unsupported ones. |
| SU-07 | Can the origin be changed after the GitHub App exists? | Yes, owner-only with re-auth, `PATCH /app`, audited, capped 3/hour (ADR-0021). |
| SU-08 | Is `SETUP_BIND` allowed on a non-loopback interface? | No by default; explicit override only, warned and audited. |
| SU-09 | Are bare LAN/IP origins supported? | No (DEP-10): local/homelab uses the evaluation mode with a fixture forge or a tunnel + real domain. |

Risks: (1) a setup step drifts from the real product path and only the wizard is tested — mitigate by
making Stage 6 use the same trigger API as a normal review; (2) pre-auth endpoints become an attack
surface — mitigate with rate limits, constant-time compare, audit, and security tests; (3) the
15-minute target is optimistic on slow DNS/TLS — measure before promising; the target excludes DNS
propagation and TLS issuance (see criterion 1).

## Rollout

- Ship as the only path to a working instance; no feature flag (an instance without setup is
  useless).
- Release artefacts are signed and verified before extraction (ADR-0020); no pipe-to-shell.
- Docs: a single "Install" page mirroring Stages 0–7, plus troubleshooting keyed by stable error
  codes; link from `README.md` and the release notes.
- `jury-forge init`, `doctor`, `create-admin`, `setup disable|rotate`, `backup/restore` are CLI
  commands required by this spec (roadmap Phase 1/4).
- Tests: clean-machine install test (Stage 0–6), fault injection (double submit, replayed callback,
  webhook never arrives, provider 401, GitHub 500), and an accessibility pass on every step.
- Exit gate: folded into G1 — the acceptance criteria above, except criterion 11 (evaluation mode,
  after G1), are the G1 script.
