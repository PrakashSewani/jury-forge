# Risk register

Risks for the **new product**, not the PoC. Scored qualitatively; revisit at every milestone.
Owner column is the role responsible for the mitigation, not a person.

Likelihood / impact: H = high, M = medium, L = low.

| ID    | Risk                                                                 | L   | I   | Mitigation                                                                 | Owner        | Trigger to revisit |
| ----- | -------------------------------------------------------------------- | --- | --- | -------------------------------------------------------------------------- | ------------ | ------------------ |
| R-001 | Scope explodes; the product becomes an AI platform before it reviews code well | H   | H   | One wedge: excellent PR review for GitHub. Capabilities backlog is gated by ADRs and the owner. | Product      | Any "while we're here" feature |
| R-002 | The owner's final capability list invalidates the architecture       | M   | H   | Keep the architecture modular (forge, provider, pipeline, policy). Document assumptions and revisit triggers. | Architect    | Capability intake |
| R-003 | Self-hosting is too hard for the target user                         | H   | H   | One-command Compose install, env validation, diagnostics, upgrade/backup docs, a hosted demo. | Ops          | First 10 installs |
| R-004 | Review quality is worse than a single strong model                   | M   | H   | Evaluation harness, grounding, verification, consensus, feedback, prompt versioning. | AI pipeline  | First benchmark |
| R-005 | Model spend is unpredictable or excessive                            | H   | M   | Token/cost budgets, estimates, per-repo policies, local-model support, alerts. | AI pipeline  | First production run |
| R-006 | Prompt injection causes a bad or harmful review                      | H   | H   | Trust labels, delimited/escaped data, injection test suite, output validation, preview/approve mode. | Security     | Every prompt change |
| R-007 | A secret leaks to a model provider                                   | M   | H   | Redaction, per-repo data policy, local-model option, audit of sends.        | Security     | Before first enterprise user |
| R-008 | Credential exfiltration through a malicious provider URL             | M   | H   | Key-to-origin binding, egress allowlist, SSRF protection, re-auth for credential changes. | Security     | Before multi-user |
| R-009 | Multi-user authorization is retrofitted too late                     | H   | H   | Design roles, membership, and scopes in the first data model; single-operator is a mode, not an assumption. | Architect    | Milestone 1 |
| R-010 | Job pipeline loses or duplicates a review                            | M   | H   | Idempotency keys, leases, heartbeats, DLQ, exactly-once publish, fault-injection tests. | Backend      | Before beta |
| R-011 | Data loss during upgrade or migration                                | M   | H   | Backups, restore drills, expand/contract migrations, migration lock, rollback plan. | Ops          | First upgrade |
| R-012 | Vendor lock-in reappears (queue, storage, auth, model)               | M   | H   | Interfaces for forge, provider, queue, storage; default implementations are replaceable; no proprietary required service. | Architect    | Every dependency ADR |
| R-013 | MIT licensing is undermined by a proprietary dependency              | M   | H   | Dependency licence audit in CI; prefer permissive licences; document exceptions. | Legal/Ops    | Every new dependency |
| R-014 | Supply-chain compromise (npm package, container image)               | M   | H   | Lockfiles, provenance, signed images, SBOM, dependency review, least-privilege CI. | Security     | Before release |
| R-015 | Documentation drifts from the product                               | H   | M   | Docs-as-code checks, ADR links to tests, release checklist, status file.    | Docs         | Every release |
| R-016 | The team optimises for demo, not install/upgrade/diagnose            | H   | M   | Treat install, upgrade, backup, and diagnostics as first-class features with tests. | Product      | Every milestone |
| R-017 | Provider APIs change or deprecate                                    | M   | M   | Capability registry, conformance tests, adapter versioning, graceful degradation. | AI pipeline  | Provider change |
| R-018 | GitHub API limits or policy changes block reviews                    | M   | M   | Backoff, rate-limit budgets, conditional requests, caching, clear failure states. | Backend      | First rate-limit incident |
| R-019 | The product is perceived as "just another AI reviewer"               | H   | M   | Sharpen the wedge: self-hosted, BYOK, jury, auditability, evaluation, knowledge packs. | Product      | Positioning review |
| R-020 | A security incident destroys trust in a self-hosted product          | L   | H   | Threat model, disclosure policy, signed releases, audit export, incident runbook. | Security     | Before public launch |
| R-021 | The single maintainer becomes the bottleneck                         | H   | M   | Docs-first, agent chain, small PRs, automated checks, explicit ownership.   | Owner        | Ongoing |
| R-022 | Cost of maintaining N provider/forge adapters                        | M   | M   | Adapter interface + conformance suite; support matrix; community plugins.  | Architect    | Second adapter |
| R-023 | Data residency or compliance requirements emerge                     | M   | H   | Self-hosted by default, no telemetry, region-agnostic, export/delete, deployment guide. | Product      | Enterprise conversation |
| R-024 | The PoC's stale docs are inherited as truth                          | M   | M   | This knowledge base marks PoC facts and explicitly separates "what was" from "what will be". | Docs         | Every doc review |
| R-025 | Over-engineering the first release                                   | H   | M   | Milestone gates, a walking skeleton, "smallest thing that proves the wedge" rule. | Architect    | Each milestone |
| R-026 | Agent loop cost/latency explodes | H | M | Per-turn/session budgets, tool caps, graph context reuse, model routing, cancellation. | AI pipeline | First agentic milestone |
| R-027 | Premature or wrong resolution destroys trust | M | H | `suggest` default (human resolves); `auto` guard with evidence/user-response thresholds; false-resolve metric; reopen. | Product/security | Before beta |
| R-028 | Prompt injection in user replies or comments | H | H | Trust labels, nonce delimiters, tool allowlist, resolve guard, injection corpus. | Security | Every prompt/tool change |
| R-029 | GitHub review-thread/reply/resolve permissions or APIs are insufficient | M | H | Spike the exact events/mutations; fallback to PR comments; least-privilege App permissions. | Backend | Phase 1 spike |
| R-030 | Provider model catalog drifts or a provider is down | M | M | Live `/models`, cache + staleness, deprecation states, health checks, explicit config errors. | Platform | First provider release |
| R-031 | Repo graph is stale or wrong | M | H | Commit-scoped index, incremental validation, stale badge, rebuild, benchmark. | AI pipeline | v1.1 build |
| R-032 | Manual trigger is undiscoverable | H | M | Mode/capability labels, Check Run/details link, UI affordance, docs; no slash commands; measure first-trigger rate. | Product | First onboarding test |
| R-033 | Session/conversation data retention or privacy fails | M | H | Retention policy, scoping, redaction, export/delete, audit. | Security | Before beta |
| R-034 | Harness lock-in or licence surprise | M | H | MIT/Apache-only, session of record in Postgres, harness adapter, licence review. | Architect | ADR-0010 spike |

## The three risks that deserve a standing agenda item

1. **R-003 installability.** A self-hosted product that is hard to install dies in the README. Every
   milestone must end with a clean-machine install and upgrade test.
2. **R-004 review quality.** If the jury is not measurably better than one strong model with a good
   prompt, the product has no reason to exist. The benchmark is not optional.
3. **R-009 authorization.** The PoC's "everyone is the owner" assumption is the hardest thing to
   retrofit. Design it before the first table.
4. **R-027 resolution trust.** A bot that resolves a thread incorrectly is worse than a bot that
   never resolves. The guard and the false-resolve metric are release blockers.
5. **R-031 graph correctness.** A stale or wrong graph produces confident, wrong reviews; the
   index must be commit-scoped, visibly stale, and rebuildable.

## Assumptions that, if wrong, change the plan

- The target user can run Docker Compose or a single container.
- The target user has a GitHub organisation or personal account and can create a GitHub App.
- The target user is willing to pay model providers directly (BYOK).
- The target user values privacy/control enough to trade setup effort for it.
- A single-node deployment is acceptable for the first release; Kubernetes can wait.
- GitHub is the first forge; multi-forge is a later adapter, not a first-release feature.

See [`assumptions.md`](assumptions.md) and [`open-questions.md`](open-questions.md).
