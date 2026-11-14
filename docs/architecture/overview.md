# Architecture overview

This is the target architecture for Jury Forge. It is **vendor-neutral and self-hosted first**. It
is deliberately independent of the PoC's Cloudflare runtime. The stack choices are proposed in
ADRs and require the owner's approval; the boundaries below are the durable part.

## One-page picture

```
                         ┌──────────────────────────────────────────────┐
                         │              Operator's infrastructure      │
                         │                                              │
  GitHub ──webhook──▶    │  ┌─────────────┐      ┌──────────────────┐  │
  GitHub ◀──publish──    │  │  Web/API    │      │  Review workers  │  │
                         │  │  (BFF)      │─────▶│  (queue consumers)│  │
  Browser ──HTTPS──▶     │  │  React SPA  │      │                  │  │
                         │  └──────┬──────┘      └────────┬─────────┘  │
                         │         │                      │            │
                         │         ▼                      ▼            │
                         │  ┌─────────────┐      ┌──────────────────┐  │
                         │  │ PostgreSQL  │      │  Object storage  │  │
                         │  │ (state)     │      │  (artefacts)     │  │
                         │  └─────────────┘      └──────────────────┘  │
                         │         │                      │            │
                         │         ▼                      ▼            │
                         │  ┌─────────────┐      ┌──────────────────┐  │
                         │  │ Queue       │      │  Code index      │  │
                         │  │ (durable)   │      │  (symbols, deps) │  │
                         │  └─────────────┘      └──────────────────┘  │
                         │                                              │
                         │  Optional: OTel collector, Prometheus,      │
                         │  reverse proxy, SSO, S3-compatible storage   │
                         └──────────────────────────────────────────────┘
                                        │
                                        ▼
                         Model providers (operator-configured)
                         OpenAI-compatible · Anthropic-compatible · local
```

## Design stance

1. **A modular monolith for the control plane.** One web/API service, one worker service, one
   database. Not microservices. The boundaries are module seams (forge, provider, policy,
   pipeline), not network hops.
2. **The queue is the spine.** Every review is a durable job with a state machine, not a long
   request and not a named actor. Workers are stateless and replaceable.
3. **PostgreSQL is the source of truth.** It holds tenancy, configuration, runs, steps, findings,
   audit, and idempotency records. Object storage holds large artefacts (raw diffs, model
   responses, reports).
4. **One codebase, one language for v1.** TypeScript across web, API, workers, and indexer is the
   default recommendation because it reuses the contract discipline and the team's existing
   knowledge. A CPU-heavy indexer can be extracted later behind an interface.
5. **Replaceable edges.** Forge, provider, queue, object storage, notifier, and identity are
   interfaces with default implementations. No proprietary required service.
6. **Security is a pipeline property.** Trust labels, redaction, egress policy, grounding, and
   authorization live in code, not in prompts.

## Services (logical)

| Service | Responsibility | First implementation |
| ------- | -------------- | -------------------- |
| **Web/API** | Auth, dashboard API, SPA, webhook ingress, admin endpoints | One container: API + static SPA |
| **Review worker** | Consume jobs, run pipeline steps, call providers, publish | One container, N replicas |
| **Indexer** | Build and refresh the repository index (symbols, imports, tests) | Same image, separate queue/worker type |
| **Scheduler/janitor** | Lease expiry, retries, stuck-run recovery, retention, budgets | A worker loop or a scheduled job |
| **PostgreSQL** | Durable state, queue (or an external queue), audit | Operator-managed or bundled |
| **Object storage** | Raw diffs, model responses, reports, exports | Local volume or S3-compatible |
| **Reverse proxy** | TLS, host routing, security headers | Caddy/Traefik/Nginx; optional built-in |

A single-container "all-in-one" mode can bundle the web, worker, scheduler, and an embedded
Postgres-compatible store later, but the reference deployment is Compose with separate services.

## Data flow

### Review

1. GitHub sends a webhook. The web/API verifies the signature, persists a `webhook_event`, and
   enqueues a `review.requested` job in one transaction (transactional outbox).
2. A worker claims the job with a lease, creates a `run` with a generation number, and executes
   the pipeline steps. Each step is idempotent and recorded in `run_steps`.
3. The context step fetches the diff, the repository index, instructions, and knowledge packs. It
   builds a token-budgeted plan.
4. Reviewer steps call providers through the gateway. Raw responses go to object storage; parsed
   findings go to Postgres.
5. The grounding/verification step checks every finding against the reviewed SHA.
6. The jury step de-duplicates, resolves disagreement, and assigns confidence.
7. The publish step creates one review (idempotency key = run id), records the review id, and
   emits audit events.
8. The run completes. The janitor cleans up leases and applies retention.

### Setup

1. Operator installs and configures `PUBLIC_URL`, secrets, database, and provider keys.
2. A bootstrap token authorizes the first owner.
3. The owner creates a GitHub App via the manifest flow; the app credentials are encrypted.
4. The owner installs the app; the installation is discovered or explicitly selected.
5. Repositories are imported; the owner enables them and defines a policy.

### Dashboard

The browser talks to the same origin (`/api/*`). Sessions use OIDC/GitHub OAuth. All responses are
validated against shared schemas. The SPA is static and cacheable; the API is the only dynamic
surface.

## Boundaries and invariants

- **Tenant boundary:** every row is scoped to an organisation/installation. A query without a
  tenant scope is a bug. The single-operator mode is a tenant with one member, not a special case.
- **Trust boundary:** PR content, repository files, packs, and provider output are untrusted. They
  never become instructions. The pipeline enforces this in code.
- **Egress boundary:** only the configured forge and provider endpoints are reachable, subject to
  the egress policy. No arbitrary URL fetch from user input.
- **Publish boundary:** a run produces at most one review. Publishing is idempotent and
  generation-checked. A stale run cannot overwrite a newer verdict.
- **Contract boundary:** one schema source; every API response is validated; the dashboard never
  casts.
- **Operational boundary:** every long-running operation has a lease, a heartbeat, a timeout, a
  retry policy, and a terminal state. There are no immortal `running` rows.

## What is explicitly not in the architecture

- A per-run actor/object (the PoC's Durable Object model).
- A byte-budgeted prompt builder as the primary context strategy.
- A single "owner" bypass for authorization.
- A model-specific prompt path that cannot use structured output or tools.
- A central control plane, telemetry endpoint, or licence server.

## Decision status

| Decision | Status | ADR |
| -------- | ------ | --- |
| Self-hosted, MIT, vendor-neutral | Accepted by owner directive | ADR-0001 |
| PoC is reference only | Accepted | ADR-0002 |
| Compose-first deployment | Proposed | ADR-0003 |
| PostgreSQL source of truth | Proposed | ADR-0004 |
| TypeScript-first runtime | Proposed | ADR-0005 |
| Queue + worker job model | Proposed | ADR-0006 |
| Token-aware context + retrieval | Proposed | ADR-0007 |
| Roles + trust boundaries | Proposed | ADR-0008 |

Read next: [`components.md`](components.md) → [`job-pipeline.md`](job-pipeline.md) →
[`security.md`](security.md) → [`ai-pipeline.md`](ai-pipeline.md).
