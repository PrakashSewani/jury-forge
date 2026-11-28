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
| The host, the database (which also holds the queue and artefacts), and the master key file | The whole instance. |

## 2. Actors

- **Operator/owner:** installs and administers the instance.
- **Team member:** uses the dashboard within a role.
- **Auditor (v1.2):** read-only access to sessions and audit. v1 has owner, maintainer, and reader
  (ADR-0023, ADR-0028).
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
│                                                 (state, queue,      │
│                                                  audit, artefacts)  │
│                                                     ▲               │
│  Forge webhook ──signature──▶ Web/API               │               │
│                                                   Worker            │
│                                                     │               │
│                                                     ▼               │
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
- Egress allowlist; block private/link-local/loopback/metadata ranges. The one exception is a
  `local` model provider: the exact loopback/private host the owner entered, pinned; link-local and
  metadata stay blocked (ADR-0030).
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
- Tenant-scoped queries through the `store` repository layer, with cross-tenant tests. Row-level
  security is not used in v1 (technical-approach §3.2); revisit with multi-installation.
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

**Controls:** tenant-scoped repository layer, mandatory `org_id` in queries, cross-tenant tests,
a lint rule or code review checklist. `org_id NOT NULL` on every tenant-owned table, with composite
tenant foreign keys, so the database refuses a cross-tenant reference (ADR-0035). Row-level
security is not used in v1 (technical-approach §3.2).

## 5. Authentication and session design

- **User auth:** GitHub OAuth in v1; OIDC/SSO is v1.2. Authorization code flow with state; PKCE if
  the provider supports it. **OAuth login is part of MVP**, not only the owner claim: the same
  GitHub App can request user authorization on install (`request_oauth_on_install`), otherwise a
  second OAuth app is configured. The callback is `{ORIGIN}/api/auth/github/callback`, built from the
  stored origin (never from `Host`), and the origin must match exactly. See
  [`deployment.md`](deployment.md#2-the-public-surface-github-requires).
- **Sessions:** random 256-bit token, stored hashed, HttpOnly/Secure/SameSite=Lax; idle timeout
  8 h, absolute 7 d (technical-approach §3.9); re-auth for sensitive actions; revocation; session
  list.
- **CSRF:** SameSite plus an origin check plus a CSRF token for state-changing forms. Do not rely
  on `Sec-Fetch-Site` alone.
- **API tokens (v1.2, the API/CLI surface):** scoped, hashed, expiring, last-used tracking,
  revocable; never a user session.
- **Origin pinning:** the public origin is an instance setting; requests with any other `Host` are
  rejected (`421`) and are never used to build OAuth redirects, CSRF origin checks, or links. This
  closes host-header injection. Bootstrap runs on a loopback-only listener (ADR-0021).
- **Re-auth:** required for credential changes, role changes, data export/delete, SSO changes, and
  **origin changes**.
- **First-run:** a bootstrap token with rate limits and expiry; the first owner is created
  explicitly, not by racing the first visitor. Claiming requires a GitHub OAuth identity; the token
  only proves host-level access. See [`first-run-setup`](../product/specs/first-run-setup.md).
- **Access re-check:** sensitive actions re-check forge installation access; membership changes
  revoke sessions.

## 6. Authorization matrix (v1)

> **Tier note (2026-11-27):** this matrix uses the full role model (ADR-0008). v1 ships only
> **owner, maintainer, and reader** (ADR-0023); the admin, viewer, and auditor columns arrive in
> v1.2. The MVP has one operator, the claimed owner. Who may accept, dismiss, or reopen a finding
> is in ADR-0028 (v1) and ADR-0012 (v1.2 roles), not in this table.

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
| Bind reviewers to repositories (no enable toggle, ADR-0013) | ✓ | ✓ | ✓ | — | — |
| Trigger a run / try | ✓ | ✓ | ✓ | — | — |
| Cancel/replay a run | ✓ | ✓ | ✓ | — | — |
| Read runs/findings | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read audit | ✓ | ✓ | — | — | ✓ |
| Export data | ✓ | ✓ | — | — | ✓ |
| Delete data | ✓ | — | — | — | — |
| Rotate/delete credentials | ✓ | ✓ | — | — | — |

Every row is enforced in the service layer, not only in the UI.

## 7. Secrets and encryption

- **Envelope encryption:** a data key (DEK, AES-256-GCM) per secret, wrapped by the 32-byte master
  key (KEK) read from `JURY_MASTER_KEY_FILE` (a Docker secret or file, mode 0400; never an env
  value). `key_id` supports rotation; `jury-forge rotate-key` rewraps the DEKs without
  re-registering the forge app (technical-approach §3.9). No KMS/HSM in v1.
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

- **Review instructions are read from the base SHA**, never the head branch (S11). A PR cannot
  rewrite the rules it is reviewed by; changed instruction files are flagged in the review.
- Linked-issue text, SARIF results, replies, and prior agent output are untrusted blocks; prior
  agent output is labelled `prior_agent_output` and is never evidence (ADR-0024 §2).
- A public **prompt-injection corpus** (diff, reply, edited comment, instruction file, linked
  issue, SARIF, pack) runs in CI and is a release gate.
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
- **Retention defaults (v1):** raw prompts/responses 30 days; findings, sessions, and receipts 1 year;
  audit 1 year; per-repo purge. All configurable.
- **Egress preview (v1):** the owner can see the exact redacted payload for a repo before the first
  provider call.
- **Receipt signing:** an instance Ed25519 key generated at install, encrypted at rest, included in
  backups; rotation starts a new chain segment; `jury-forge receipt verify` works offline (S5).
- **Abuse and cost controls:** ADR-0024 trigger authz, fork skip, turn budgets, and per-requester
  budgets that fail closed.
- Activity feed is derived and best-effort; it is not the audit source.

## 11. Deployment hardening checklist

- [ ] TLS terminated with a valid certificate; HSTS.
- [ ] Strong, unique secrets; no defaults; startup validation refuses weak config.
- [ ] Database not exposed publicly; least-privilege role.
- [ ] Database private (it also holds the queue and artefacts); credentials scoped.
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
4. **Recover:** restore from a verified backup if needed, retry failed jobs (turn replay is v1.1).
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
| F-035 single env key | Envelope encryption under a file-based master key, rotation |
| F-027 weak audit | Append-only audit, export, retention |
| F-039 no backup | Backup/restore, migration safety |
| F-030 fork abuse | Fork policy, least privilege |

## 14. Open security decisions

- *Closed:* KMS/HSM vs a local key file. v1 uses the KEK file (technical-approach §3.9); a KMS
  adapter is not planned.
- *Closed:* SSO/OIDC is v1.2; v1 is GitHub OAuth only (ADR-0023).
- Whether to support a shared GitHub App for easier onboarding (rejected in the PoC; changes the
  threat model).
- The default data policy for third-party providers (redact secrets only vs a stricter allowlist).
- Whether prompt/response bodies are retained by default (privacy vs debuggability).

## 15. Agentic sessions, providers, and resolution (2026-11-15)

New attack surface and controls:

| Threat | Control |
| ------ | ------- |
| Prompt injection in a user reply/comment | Untrusted-data labels, nonce delimiters, output validation; injection cannot trigger a resolve or a tool outside the allowlist. |
| Premature/incorrect resolve | `suggest` default: the agent proposes, the human resolves natively/UI. `auto` (opt-in) uses the server-side guard: bot-owned thread, human response, evidence, verifier, summary, audit. SME/admin can override with a reason. |
| Session hijack | Tenant/repo scoping, session authorization, short-lived tokens, audit; no session id in URLs without auth. |
| Bot loop | Ignore self, mention/reply requirement, debounce/coalesce, turn/tool/rate limits. |
| Provider key exfiltration | Envelope encryption, write-only, origin-bound, no copy-to-arbitrary-URL, re-auth for rotation. |
| Model catalog SSRF | HTTPS, block private/loopback/link-local/metadata, origin binding, timeouts/size caps. A `local` provider is the pinned, owner-only exception in ADR-0030. |
| Live doc-link fetch SSRF | Admin-curated allowlist, HTTPS, block private/link-local/metadata, recheck redirects, per-domain rate limit, timeout/size caps, per-run snapshot. |
| Graph data leakage | Tenant/repo scoping, no secrets, retention/delete, access checks on tools. |
| Runaway cost | Per-turn/session/repo budgets; stop before the next call; alert. |
| Untrusted tool output | Tool results are data, not instructions; validate and bound. |
| Sandbox escape / untrusted test execution | Ephemeral non-root container, no secrets, network off, CPU/memory/time caps, command allowlist, no push; opt-in per repo. |
| GitHub permission overreach | Least-privilege App permissions; installation-scoped tokens; verify reply/resolve mutations. |

Resolution is an authorization decision, not a model output. In `suggest`, the human resolves;
in `auto`, the server guard decides; in `off`, only humans resolve. See [`agentic-review.md`](agentic-review.md) and
[`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).

## 16. Session visibility and roles (2026-11-15)

- **Visibility never exceeds GitHub repo visibility.** A user without repo read access cannot see a
  session, even if they are an org member.
- **Session belongs to the PR**, not the trigger user. Participants (author, commenters, mentioned
  humans, maintainers) are stored and shown; the trigger user is audit.
- **Role mapping (v1.2; v1 is owner/maintainer/reader, `session-capacity-and-visibility` §4):**
  owner/admin configure; **SME** owns domain reviewers and binds them to assigned
  repos; maintainer (repo write) triggers/replies and requests reviewers; binding by maintainer is
  opt-in (`allowMaintainerBindings`, default off); member with repo read views/replies where GitHub
  permits; viewer read-only; auditor sees audit/export.
- **Reviewer binding authorization:** no reviewer runs without a repo binding; admin/SME
  (domain) bind by default; a maintainer may bind an approved catalog reviewer to their own repo only
  when `allowMaintainerBindings` is on. Every binding/approval/role change is audited. An actor cannot
  bind a reviewer to a repo they cannot access.
- **Required reviewer unavailable:** the run is blocked with a configuration fallback; never a
  partial or clean review. A `default`/`capability` reviewer that is unavailable is noted.
- **Fallback comments:** no reviewers/no match/required-unavailable are issue comments, not reviews;
  deduped by policy version; no secrets or model internals beyond reviewer name/domain.
- **Capability labels (v1.2):** a `jury:cap:*` label is a request, never a grant. It can only select from
  reviewers already bound/approved for the repo; it cannot enable an unbound/archived reviewer,
  bypass required reviewers, raise budgets, or change provider policy. Labels are parsed strictly;
  unknown/empty aliases are ignored with a note.
- **Mentions:** `@jury-forge` asks the bot; `@human` is a request for human input. The bot must not
  impersonate the human or answer on their behalf; it can provide context and wait.
- **Access checks:** use the user's installation access (`GET /user/installations/{id}/repositories`)
  and/or `GET /repos/{owner}/{repo}` with the user token; cache briefly; re-check on membership or
  installation changes.
- **Audit:** trigger, reply, resolve, role change, visibility change, export.
- **Data exposure:** session messages/findings may contain code; apply the same redaction/retention
  as prompts and restrict to repo readers.

See [`../product/specs/session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).
