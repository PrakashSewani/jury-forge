# Inherit, reject, rethink

The PoC is a reference, not a base. This ledger is the default answer to "should we carry this
over?" until an ADR says otherwise.

## Inherit (the idea is right; keep it)

| Idea | Why it survives | Where it lands |
| ---- | --------------- | -------------- |
| Self-hosted, single-tenant deployment | The core promise: the operator owns the data and the keys. | Deployment model; one instance per org, with optional multi-installation support. |
| BYOK, provider-agnostic | No reseller margin, no central custody, works with local models. | Provider registry and adapters. |
| Reviewers as configurable agents | The product's identity: a jury, not a fixed bot. | Reviewer studio, versions, templates. |
| Reviewers are opt-out per enabled repository | Correct default: repository consent, reviewer convenience. | Repository policy model. |
| One consolidated review per run | Keeps the PR thread readable and attributable. | Publish planner; configurable publish modes. |
| Per-reviewer and per-run inline caps | Noise control is a real product feature. | Policy engine with severity-aware caps. |
| Priority file ordering under a budget | Truncation should drop the least valuable diffs. | Token-aware context planner. |
| Scope enforced at consolidation, not just prompted | A prompt is not a boundary. | Grounding/verification and output validation. |
| Resolution buckets (Resolved / Still present / New) | Makes the jury feel stateful. | Stable finding fingerprints + semantic matching. |
| Instance settings with bounds and defaults | Operators need knobs without editing code. | Typed settings + per-repo policy. |
| Computed readiness from the database | The checklist cannot lie. | Onboarding derived from state. |
| Reviewer templates as prefill | Lowers the blank-page problem without a marketplace. | Template library, local only. |
| Manual try runs that publish nothing | A safe way to evaluate a prompt and a provider. | "Dry run" mode in the review studio. |
| Knowledge packs with immutable versions and provenance | A real differentiator for team knowledge. | Pack registry, signing, pinning, retrieval. |
| Audit trail and activity view | Operators need to explain changes. | Append-only audit stream. |
| Contract-first zod schemas on both sides | Eliminates a class of drift bugs. | Shared contracts + OpenAPI generation. |
| One human error taxonomy | No machine codes in the UI. | Shared error model with request ids. |
| Accessibility harness with measured assertions | Quality you can prove. | Browser matrix + a11y checks in CI. |
| Seeded local instance | Makes demos and tests realistic. | Deterministic seed/reset. |
| Docs-first + decision log + status file | The repository stays understandable. | ADR process, docs checks, tracker. |
| Mutation-checked fixes | Cheap proof that a test guards the bug. | Required for every bug fix. |

## Reject (do not carry it forward)

| Idea | Why it goes | Replacement |
| ---- | ----------- | ----------- |
| Cloudflare Workers / D1 / Durable Objects as the runtime | The constraints shaped the product; vendor lock-in. | Container-first services, Postgres, a real queue/worker. |
| Byte budgets as the primary context measure | Not model-aware; no cost control. | Token and cost budgeting with a model registry. |
| One Durable Object per run, never deleted | Proliferation, cold starts, retained payloads. | Durable job records + ephemeral workers + retention. |
| No queue/backpressure/cancellation | Unbounded spend and stale work. | Queue, leases, concurrency limits, cancel, DLQ. |
| `installations[0]` setup | Wrong installation, lockout. | Explicit installation selection + change flow. |
| Single-owner authorization for teams | Unsafe and unextendable. | Roles, membership, scopes, audit. |
| Hard-coded `Secure` cookie / public-origin assumptions | Breaks self-hosting behind proxies and on LAN. | Configurable external URL + trusted proxy policy. |
| Manual key rotation with re-registration | Operational burden and risk. | Envelope encryption + rotation without re-registering. |
| Latest-always knowledge packs with no pinning | Unreproducible reviews. | Pinned versions, channels, signed packs. |
| Cumulative-diff-only reviews | Repeated cost and noise. | Incremental review since last SHA, full on demand. |
| A single prompt per reviewer with no verification | Hallucinations and ungrounded advice. | Grounding, cross-review, consensus, confidence. |
| A global `blockingMode` boolean only | Cannot express per-repo policy. | Policy engine. |
| Review comments as the only output | Cannot gate merges or integrate. | Checks, SARIF, labels, webhooks, notifications. |
| Committed account ids / custom domains | Not installable by anyone else. | Instance configuration. |
| Full `octokit` dependency with no imports | Dead weight. | Minimal, explicit GitHub client. |
| Monolithic `radix-ui` + no code splitting | Bundle bloat. | Per-primitive imports + route splitting. |

## Rethink (the intent was right; the implementation was constrained)

| PoC approach | What was right | What we change |
| ------------ | -------------- | -------------- |
| Alarm-driven state machine | Durable, resumable steps | The same step contract, driven by a queue worker with leases and an idempotent step log. |
| Parallel reviewers | Latency and independence | Keep parallel execution, add per-provider concurrency limits and a deliberation stage. |
| Byte-budgeted context | Bounded prompts and truncation notes | Token-aware context planner with retrieval, model windows, and cost estimates. |
| Path-glob scope + literal reference paths | Cheap, predictable relevance | Keep globs as an explicit rule; add semantic retrieval and dependency context. |
| JSON output contract | Structured findings | Provider-native structured output + repair + grounding, not just tolerant parsing. |
| Activity log | Explains changes | Append-only audit + a separate best-effort activity feed. |
| Reviewer CRUD | Operator control | Versioned reviewers with draft/active, prompt diffs, rollback, and run-time snapshots. |
| Per-instance settings | Operator knobs | Typed settings + per-repo/branch policy + budgets. |
| GitHub App manifest onboarding | Low-friction setup | Keep the manifest flow; support multiple installations, GHES, and a local demo mode. |
| Static SPA served by the API | Simple deployment | Separate web tier or same container with clear boundaries; CSP and security headers. |
| Auto-deploy on merge | Fast delivery | Versioned, signed container images; canary; documented upgrade. |

## The one-sentence test

Before carrying anything over, ask:

> Does this survive because it is good for the product, or because it was convenient on
> Cloudflare?

If the answer is the second, it belongs in the reject or rethink column.
