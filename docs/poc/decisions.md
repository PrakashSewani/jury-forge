# PoC decisions, distilled

The PoC kept an append-only decision log (`docs/decisions.md`, D-001–D-034). This page summarises
the decisions that still matter to us and states what we should do with each. The original
repository remains the authoritative record.

Legend: **Keep** = adopt the idea; **Adapt** = keep the intent, change the implementation;
**Reject** = do not carry it forward.

| ID    | Decision                                                                 | Stance   | Why / what we change |
| ----- | ------------------------------------------------------------------------ | -------- | -------------------- |
| D-001 | TypeScript monorepo; Cloudflare Workers + D1 + Durable Objects; React; Astro site | Reject runtime, keep language option | The language and contract discipline are good. The Cloudflare runtime is the constraint we are leaving. Choose the runtime in a new ADR. |
| D-002 | `dev` integration branch; label-driven releases from `main`              | Adapt    | Keep branch-based flow; replace release automation with a release process that fits self-hosted artefacts (container tags, changelog, signed images). |
| D-003 | Primary agent is architect; subagents read-only discovery                | Adapt    | Keep the chain, but make handoffs explicit documents and allow a docs-editor stage. Never let a subagent's summary be proof. |
| D-004 | Self-hosted, single-tenant, no central service                           | Keep     | Core thesis. |
| D-005 | Per-instance private GitHub App via manifest flow; encrypt credentials   | Keep     | Keep the manifest onboarding and encrypted credentials; support multiple installations and GitHub Enterprise. |
| D-006 | Per-run Durable Object as the run engine                                 | Reject   | Replace with a real job queue + worker + leases + retries + DLQ. Keep the resumable-state idea. |
| D-007 | Branch protections and `RELEASE_TOKEN`                                   | Reject   | Cloudflare-era release detail. Use GitHub Actions OIDC and signed artefacts. |
| D-008 | `SETUP_CODE` gates the one-time claim                                    | Adapt    | Keep first-run protection, but make it a proper bootstrap token with rate limits, expiry, and a recovery path. |
| D-009 | 10 inline comments per reviewer / 25 per run; overflow to summary         | Adapt    | Keep the noise ceiling, but make it policy-driven per repository and severity, with a review-body budget. |
| D-010 | 200 KB total / 32 KB per file byte budget; skip lockfiles/binaries        | Reject   | Byte budgets are not token budgets. Build a token-aware context planner with per-model windows and cost estimates. |
| D-011 | Stacked PRs, CI on every PR                                               | Keep     | Good review hygiene. |
| D-012 | Installation-access gate; no allowlist in v1                              | Adapt    | Keep installation access as one signal; add roles, teams, and explicit membership. |
| D-013 | One `COMMENT` review per run, never `REQUEST_CHANGES`                     | Adapt    | Default to non-blocking, but make the publish policy (comment / request changes / check run / label) configurable. |
| D-014 | MSW for outbound HTTP mocking                                            | Keep     | Keep contract-level tests; add recorded fixtures and provider conformance tests. |
| D-015 | Minimal client routing, no router dependency                              | Adapt    | Keep deep links and navigation blockers; a real router is fine once the UI grows. |
| D-016 | Repository opt-in, reviewer opt-out                                      | Keep     | Correct default: no review without repository consent; reviewers apply unless disabled. |
| D-017 | Post-phase-2 improvement slate                                           | Keep     | The list is a good product backlog: supersession, minimization, resolution, priority, settings, contract v2, rotation, audit, guided deploy, repo instructions, blocking, import/export. |
| D-018 | Newest run wins; minimize old reviews; priority file order                | Adapt    | Keep newest-wins and minimization. Add cancellation, not just skipping. Priority ordering becomes model-aware. |
| D-019 | Multiple slices in one PR                                                 | Neutral  | Process detail; not a product decision. |
| D-020 | Output contract v2: summary, multi-line findings, usage; resolution buckets | Adapt   | Keep structured output and resolution. Replace brittle `file+line+title` keys with stable fingerprints and verification. |
| D-021 | Instance settings + optional blocking mode                                | Keep     | Keep observable, bounded settings. Extend to token/cost budgets and per-repo policy. |
| D-022 | Repository instructions (`AGENTS.md`/`CONTRIBUTING.md`) opt-in             | Adapt    | Keep, but treat as untrusted context with a trust label; add per-repo instruction sources and precedence. |
| D-023 | Key rotation + activity trail                                             | Adapt    | Keep rotation and audit intent. Use envelope encryption/KMS, immutable audit events, and export. |
| D-024 | 7-day sessions, no stored user tokens                                     | Adapt    | Keep short sessions; add revocation, re-check on sensitive actions, and OIDC/SSO. |
| D-025 | Guided deploy + reviewer import/export                                    | Adapt    | Keep one-command install and portable definitions; replace with Compose/Helm and instance export/import. |
| D-026 | Design tokens + UI primitives + UI test harness                           | Keep     | Strong foundation. Keep semantic tokens, 44 px targets, and component tests. |
| D-027 | Shell, dark mode, measured accessibility retune                           | Keep     | Keep the accessibility harness and dark-first option. |
| D-028 | Computed readiness, templates, reviewer↔repo visibility, try runs         | Keep     | Excellent product shape. Keep readiness derived from state, templates as prefill, try runs as publish-free. |
| D-029 | Validated contracts, one error taxonomy, client routing, live runs        | Keep     | Adopt contract-first schemas and one error taxonomy; add OpenAPI generation and request ids. |
| D-030 | Auto-deploy on `dev`; `main` retired                                      | Adapt    | Keep CI/CD, but ship versioned container images and signed releases, not a single hosted Worker. |
| D-031 | Reviewer scope: path filters + bounded reference context                  | Keep     | Strong idea. Add semantic retrieval, dependency-aware context, and budget accounting. |
| D-032 | Enforce scope at consolidation; record scope; preview                     | Keep     | Enforcement at output time is the right lesson: a prompt is not a boundary. |
| D-033 | Dark-first forge UI, command palette, toasts, Radix/cmdk/sonner/lucide     | Adapt    | Keep the product feel; watch bundle size and dependency surface. |
| D-034 | Knowledge packs: immutable versions, grants, budgeted injection, provenance | Keep     | Strong differentiator. Add token budgets, signing, retrieval, per-repo pinning, and an API. |

## What the decision log did well

- Every durable choice has a number, a date, context, alternatives, and consequences.
- Decisions are append-only; later entries supersede earlier ones instead of rewriting history.
- The log is linked from the architecture and status docs.
- Each improvement slice carried its own decision entry and tests.

## What the decision log missed

- No periodic consistency review: D-030 retired `main`, but the architecture and development docs
  still describe the old release flow.
- Several "decisions" are implementation details recorded after the fact, not real forks.
- No explicit owner for closing open questions; the log accumulates but does not prune.
- No link from a decision to the tests that pin it, except in prose.
- No "revisit trigger" for most entries, so stale decisions are hard to detect.

## Our decision-log rules

- One durable choice per ADR, with status, context, options, decision, consequences, and a revisit
  trigger.
- Link the implementation and tests that enforce it.
- Supersede, never rewrite.
- Review the index quarterly and at every major release; mark stale ADRs.
- Keep a separate, short "rejected ideas" log so we do not relitigate the same options.
