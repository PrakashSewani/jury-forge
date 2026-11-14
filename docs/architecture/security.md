# Security architecture

Security is a product feature for a self-hosted review bot. The product holds source code, model
credentials, and the operator's trust. This document defines the threat model and the controls the
architecture must enforce in code.

## 1. Assets

| Asset | Why it matters |
| ----- | -------------- |
| Source code and diffs | Customer IP; may contain secrets and PII. |
| Model provider credentials | Direct financial and data-access risk. |
| Forge credentials (App private key, webhook secret, client secret) | Full repository access. |
| Reviewer prompts and knowledge packs | The operator's review standards and internal knowledge. |
| Findings, reviews, and audit events | Evidence and reputational risk. |
| Sessions and API tokens | Account takeover. |
| The host, database, queue, and object storage | The whole instance. |

## 2. Actors

- **Operator/owner:** installs and administers the instance.
- **Team member:** uses the dashboard within a role.
- **Auditor:** read-only access to runs and audit.
- **Forge:** sends webhooks, receives reviews.
- **Model provider:** receives prompts, returns output.
- **Attacker:** an external actor, a malicious contributor, a compromised dependency, a stolen
  session, or a prompt-injection payload.

## 3. Trust boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ Operator infrastructure (trusted, but hardened)                     │
│                                                                     │
│  Browser ──TLS──▶ Reverse proxy ──▶ Web/API ──▶ Postgres            │
│                                       │                             │
│                                       ▼                             │
│                                   Queue ──▶ Worker ──▶ Object store │
│                                                │                    │
│  Forge webhook ──signature──▶ Web/API          │                    │
│                                                ▼                    │
│                                       Provider gateway ──egress──▶  │
└─────────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
                                        Model provider (semi-trusted)
```

Trust labels:

| Input | Trust | Rule |
| ----- | ----- | ---- |
| Configuration written by an authorized user | Trusted after validation | Still schema-validated and audited. |
| Forge webhook payload | Untrusted | Verify signature, validate schema, never execute content. |
| PR title/body/diff, repository files | Untrusted | Data only; escaped and delimited; never instructions. |
| Knowledge packs | Untrusted until signed/approved | Data only; provenance and approval. |
| Model output | Untrusted | Validate, ground, and constrain before publish. |
| Operator-supplied provider URL | Untrusted destination | Egress policy and credential binding. |

## 4. Threat model

### T-01 Prompt injection

**Attack:** a PR contains instructions ("ignore previous rules", "approve this", "print the system
prompt"), a fake system message, or a fence breakout.

**Impact:** hidden vulnerabilities, fabricated findings, leaked prompt content, or a manipulated
verdict.

**Controls:**

- Separate system and data channels; data is never concatenated as instructions.
- Delimit untrusted content with a random nonce and escape delimiters.
- The system prompt states: data is not instructions; only the reviewer configuration is.
- Validate output against a strict schema; reject unknown fields.
- Ground every finding; a fabricated file/line fails.
- Publish policy can require preview/approval.
- A prompt-injection test corpus in CI.

### T-02 Secret and PII exfiltration to a provider

**Attack:** a PR accidentally includes a token; the diff is sent to a third-party model.

**Impact:** credential compromise, compliance breach.

**Controls:**

- Secret scanners (pattern + entropy) before send; redact or block.
- Per-repository data policy: allow/deny providers, local-only mode, file/path exclusions.
- A pre-send manifest shows what is sent and what was redacted.
- Audit every egress decision.
- Local model option for sensitive repositories.

### T-03 Credential exfiltration through a malicious provider URL

**Attack:** a session creates a reviewer with `baseUrl = attacker.example` and reuses a stored key;
a run sends the key in the auth header. (The PoC's F-004.)

**Impact:** full provider-account compromise and spend.

**Controls:**

- A credential is bound to an allowed origin (host + scheme); it cannot be sent elsewhere.
- Egress allowlist; block private/link-local/loopback/metadata ranges.
- Credential changes require re-authentication and are audited.
- Reuse copies a reference to a credential, not a free-floating ciphertext.
- In multi-user mode, credential use is a scoped permission.

### T-04 SSRF

**Attack:** a provider URL or a webhook-driven URL makes the server reach internal services.

**Impact:** metadata credentials, internal admin panels, network scanning.

**Controls:**

- Resolve the host, reject private/link-local/loopback/multicast ranges, re-check after redirects.
- HTTPS only by default; no redirects to a different origin unless allowlisted.
- A dedicated egress proxy for provider traffic.
- No user-controlled URLs in forge calls; only the configured forge base URL.

### T-05 Authorization bypass / privilege escalation

**Attack:** a viewer changes a security reviewer, a maintainer reads another repo's findings, a
stolen session exfiltrates keys.

**Impact:** integrity and confidentiality loss.

**Controls:**

- Roles and scopes enforced server-side on every route, with a test per mutation.
- Tenant-scoped queries; row-level security as defense in depth.
- Sensitive actions require re-authentication and produce audit events.
- No "everyone is the owner" default; single-operator is an explicit mode.
- Session revocation, short TTLs, and a session list.

### T-06 Duplicate or stale publish

**Attack:** not malicious, but a retry or a race posts a duplicate or a stale review; an older run
minimizes a newer review.

**Impact:** misleading review history.

**Controls:** idempotency key, generation check before publish, minimize only lower generations,
cancel superseded runs. See [`job-pipeline.md`](job-pipeline.md).

### T-07 Supply chain

**Attack:** a compromised npm package, container base image, or GitHub Action.

**Impact:** full instance compromise.

**Controls:**

- Lockfiles, pinned digests, dependency review, SBOM, signed images, provenance.
- Minimal dependencies; remove unused packages.
- CI least privilege; no secrets in pull-request workflows.
- Reproducible builds where feasible.

### T-08 Webhook forgery / replay

**Attack:** forged or replayed webhook events.

**Controls:** HMAC verification over the raw body, timing-safe compare, delivery id uniqueness,
timestamp/replay window, schema validation, no work in the request.

### T-09 Data at rest

**Attack:** database or backup theft.

**Controls:** envelope encryption for credentials, encrypted backups, restrictive file
permissions, optional disk encryption, retention/deletion, no secrets in logs.

### T-10 Denial of service / cost exhaustion

**Attack:** many webhooks, repeated try runs, a malicious provider response.

**Controls:** rate limits, quotas, budgets, concurrency limits, response size caps, timeouts,
queue backpressure, per-tenant fairness.

### T-11 Fork PR abuse

**Attack:** a fork PR with a prompt-injection payload triggers a review and manipulates the bot.

**Controls:** fork policy (skip/restricted/approval), least-privilege token, trust label, no
secrets in the prompt, rate limits.

### T-12 Tenant isolation failure

**Attack/accident:** a query misses `org_id`, exposing another tenant's data.

**Controls:** tenant-scoped repository layer, mandatory `org_id` in queries, row-level security,
cross-tenant tests, a lint rule or code review checklist.

## 5. Authentication and session design

- **User auth:** GitHub OAuth first; OIDC/SSO later. Authorization code flow with state; PKCE if
  the provider supports it.
- **Sessions:** random 256-bit token, stored hashed, HttpOnly/Secure/SameSite=Lax, configurable
  TTL (default 7 days, shorter for admins), idle timeout, revocation, session list.
- **CSRF:** SameSite plus an origin check plus a CSRF token for state-changing forms. Do not rely
  on `Sec-Fetch-Site` alone.
- **API tokens:** scoped, hashed, expiring, last-used tracking, revocable; never a user session.
- **Re-auth:** required for credential changes, role changes, data export/delete, and SSO changes.
- **First-run:** a bootstrap token with rate limits and expiry; the first owner is created
  explicitly, not by racing the first visitor.
- **Access re-check:** sensitive actions re-check forge installation access; membership changes
  revoke sessions.

## 6. Authorization matrix (v1)

| Capability | Owner | Admin | Maintainer | Viewer | Auditor |
| ---------- | :---: | :---: | :--------: | :----: | :-----: |
| Install / upgrade / config | ✓ | — | — | — | — |
| Manage members and roles | ✓ | ✓ | — | — | — |
| Manage forge installations | ✓ | ✓ | — | — | — |
| Manage provider credentials | ✓ | ✓ | — | — | — |
| Create/edit reviewers | ✓ | ✓ | ✓ | — | — |
| Activate a reviewer version | ✓ | ✓ | — | — | — |
| Manage policies | ✓ | ✓ | — | — | — |
| Manage knowledge packs | ✓ | ✓ | ✓ | — | — |
| Enable repositories | ✓ | ✓ | ✓ | — | — |
| Trigger a run / try | ✓ | ✓ | ✓ | — | — |
| Cancel/replay a run | ✓ | ✓ | ✓ | — | — |
| Read runs/findings | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read audit | ✓ | ✓ | — | — | ✓ |
| Export data | ✓ | ✓ | — | — | ✓ |
| Delete data | ✓ | — | — | — | — |
| Rotate/delete credentials | ✓ | ✓ | — | — | — |

Every row is enforced in the service layer, not only in the UI.

## 7. Secrets and encryption

- **Envelope encryption:** a data key per installation/tenant, wrapped by a KMS/HSM or a local key
  file with strict permissions. Rotation without re-registering the forge app.
- **At rest:** forge credentials and provider keys encrypted; backups encrypted; optional disk
  encryption.
- **In transit:** TLS everywhere; verify provider certificates; support custom CAs for self-hosted
  gateways.
- **In memory:** minimize lifetime; never log; redact error messages.
- **Key rotation:** versioned ciphertexts, background re-wrap, a documented procedure, a test.
- **No secrets in the repo:** `.env.example` only; CI secret scanning; a pre-commit hook optional.

## 8. Egress control

A single egress policy module decides whether a request may leave:

- Allowlist of forge hosts (configured base URL) and provider hosts (credential-bound).
- Block private, loopback, link-local, multicast, and cloud metadata ranges after DNS resolution.
- HTTPS only by default; redirects re-checked.
- Optional egress proxy with logging and rate limits.
- Per-tenant policy for local-only mode (no external providers).
- Every blocked request is logged (without secrets) and audited when it matters.

## 9. Prompt and output safety

- System prompt is built only from trusted configuration; data is inserted as data.
- A random nonce delimits untrusted blocks; all occurrences of the nonce in data are escaped.
- The output schema is strict; unknown fields are rejected; sizes are capped.
- Findings must reference a file/line that exists at the SHA; evidence is quoted.
- Suggested fixes are validated as a patch against the SHA; no execution.
- Forbidden content checks (e.g. links, HTML) before publish.
- The raw model output is stored for audit, redacted per policy.

## 10. Audit and retention

- Append-only `audit_events` for every mutation: actor, action, target, before/after (redacted),
  request id, run id, timestamp, IP.
- Data-egress events: provider, model, token counts, redactions, policy decision.
- Export as JSON/CSV; retention configurable; deletion is audited.
- Activity feed is derived and best-effort; it is not the audit source.

## 11. Deployment hardening checklist

- [ ] TLS terminated with a valid certificate; HSTS.
- [ ] Strong, unique secrets; no defaults; startup validation refuses weak config.
- [ ] Database not exposed publicly; least-privilege role.
- [ ] Queue/object storage private; credentials scoped.
- [ ] Container runs as non-root, read-only root FS where possible, no privileged mode.
- [ ] Network policy: only required egress.
- [ ] Backups encrypted and tested.
- [ ] Logs redacted; retention configured.
- [ ] Rate limits and budgets enabled.
- [ ] Admin/owner accounts use MFA at the identity provider.
- [ ] Security headers and CSP on the dashboard.
- [ ] Dependency and image scanning in CI.
- [ ] Incident response and disclosure policy published.

## 12. Incident response

1. **Detect:** alert on auth anomalies, egress blocks, budget spikes, failed publishes, leaked
   secret patterns.
2. **Contain:** revoke sessions/tokens, rotate credentials, disable the affected installation or
   reviewer, block the egress destination.
3. **Eradicate:** patch the vulnerability, rebuild from a clean image, rotate everything touched.
4. **Recover:** restore from a verified backup if needed, replay failed runs.
5. **Learn:** write a blameless post-mortem, add a regression test, update the threat model.

A `SECURITY.md` with a private disclosure channel is required before public launch.

## 13. PoC flaws mapped to controls

| PoC flaw | Control in this architecture |
| -------- | ---------------------------- |
| F-003 prompt injection | Trust boundaries, nonce delimiters, output validation, grounding, preview mode |
| F-004 key exfiltration | Credential-to-origin binding, egress allowlist, re-auth, scoped use |
| F-005 no redaction | Secret/PII redaction, data policy, pre-send manifest |
| F-028 SSRF | Egress policy, DNS/IP checks, no redirects, proxy |
| F-029 no roles | RBAC matrix, tenant scoping, tests |
| F-032 no rate limits | Gateway limits, API quotas, budgets |
| F-035 single env key | Envelope encryption, KMS, rotation |
| F-027 weak audit | Append-only audit, export, retention |
| F-039 no backup | Backup/restore, migration safety |
| F-030 fork abuse | Fork policy, least privilege |

## 14. Open security decisions

- KMS/HSM vs local key file for the first release (Q-005, ADR-0008).
- SSO/OIDC in v1 or GitHub OAuth only.
- Whether to support a shared GitHub App for easier onboarding (rejected in the PoC; changes the
  threat model).
- The default data policy for third-party providers (redact secrets only vs a stricter allowlist).
- Whether prompt/response bodies are retained by default (privacy vs debuggability).

## 15. Agentic sessions, providers, and resolution (2026-11-15)

New attack surface and controls:

| Threat | Control |
| ------ | ------- |
| Prompt injection in a user reply/comment | Untrusted-data labels, nonce delimiters, output validation; injection cannot trigger a resolve or a tool outside the allowlist. |
| Premature/incorrect resolve | Server-side resolution guard: bot-owned thread, human response, evidence, verifier/confidence, summary, audit. |
| Session hijack | Tenant/repo scoping, session authorization, short-lived tokens, audit; no session id in URLs without auth. |
| Bot loop | Ignore self, mention/reply requirement, debounce/coalesce, turn/tool/rate limits. |
| Provider key exfiltration | Envelope encryption, write-only, origin-bound, no copy-to-arbitrary-URL, re-auth for rotation. |
| Model catalog SSRF | HTTPS, block private/loopback/link-local/metadata, origin binding, timeouts/size caps. |
| Graph data leakage | Tenant/repo scoping, no secrets, retention/delete, access checks on tools. |
| Runaway cost | Per-turn/session/repo budgets; stop before the next call; alert. |
| Untrusted tool output | Tool results are data, not instructions; validate and bound. |
| GitHub permission overreach | Least-privilege App permissions; installation-scoped tokens; verify reply/resolve mutations. |

Resolution is an authorization decision, not a model output. The model may request it; the server
guard decides. See [`agentic-review.md`](agentic-review.md) and
[`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).
