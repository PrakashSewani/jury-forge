# Assumptions

Assumptions are not decisions. They are the beliefs the current plan rests on. If one becomes
false, the plan changes. Each has a validation method and an owner.

| ID    | Assumption | Confidence | Validate by | If false |
| ----- | ---------- | ---------- | ----------- | -------- |
| A-001 | The target user can run Docker Compose or a single container on a Linux host. | High | Install spike with 3 non-authors; time-to-first-review. | Provide a managed/hosted path or a one-click marketplace image; simplify to a binary. |
| A-002 | The target user can create a GitHub App and install it. | High | Onboarding usability test. | Offer a shared app with per-installation routing (major architecture change). |
| A-003 | BYOK is a feature, not a bug, for the target user. | Medium | Interviews; support tickets; conversion. | Offer a managed key/gateway option, carefully. |
| A-004 | Privacy/control is worth setup effort. | Medium | Positioning tests; install completion. | Compete on quality and price, not privacy. |
| A-005 | A jury of specialist reviewers produces better outcomes than one strong model. | Medium | Benchmark: precision/recall, acceptance, false positives, operator preference. | Collapse to one reviewer with tooling and roles; keep the interface. |
| A-006 | Grounding + verification materially reduce hallucinations. | Medium | Benchmark with/without the verifier. | Invest in retrieval and model choice instead. |
| A-007 | A single-node Postgres + queue is enough for the first release. | High | Load test at 10× expected volume. | Add horizontal workers; keep Postgres, scale the queue. |
| A-008 | GitHub is the dominant forge for the target user. | High | Survey/interviews. | Move the first adapter earlier. |
| A-009 | Model providers will keep offering OpenAI/Anthropic-compatible APIs. | High | Provider conformance suite. | Adapter-per-provider cost rises; prioritize the most used. |
| A-010 | The operator will pay providers directly and accept variable cost. | Medium | Cost telemetry; interviews. | Add budgets, estimates, and a local-model default. |
| A-011 | A code index is feasible to build and operate on a single node for a mid-size repo. | Medium | Indexing spike: time, size, memory, query latency. | Start with symbol/import graph only; defer embeddings. |
| A-012 | Incremental review since the last SHA is what users want. | Medium | Dogfood + interviews. | Keep full-diff review, optimize cost differently. |
| A-013 | One instance per organisation is acceptable for v1. | High | Sales/community feedback. | Add multi-installation tenancy earlier. |
| A-014 | MIT + no CLA attracts contributors and users. | Medium | Community response. | Revisit governance, not the licence. |
| A-015 | A documentation-first, agent-assisted process can sustain a small team. | Medium | Delivery retrospectives. | Reduce process, automate more, or add contributors. |
| A-016 | Self-hosters want upgrade/backup/diagnostics as much as features. | High | Support requests. | Invest more in operations, less in surface area. |
| A-017 | The PoC's product shape (readiness, templates, try runs, packs) transfers. | High | Usability tests on the new UI. | Keep the concepts, change the presentation. |
| A-018 | A browser-based diff/review UI is worth building rather than linking to GitHub. | Medium | Triage-time measurement. | Keep GitHub as the primary review surface; build a lighter dashboard. |
| A-019 | Users want a conversational review on the PR, not only a one-shot comment. | Medium | Dogfood + user interviews; session engagement. | Make conversation optional; keep a one-shot mode. |
| A-020 | An agentic loop improves outcomes enough to justify the cost/latency. | Medium | Benchmark one-shot vs agentic on the same PRs. | Simplify the loop; keep the session shell. |
| A-021 | GitHub Apps can reply to and resolve review threads with acceptable permissions. | Medium | Platform spike (events, GraphQL mutations, permissions). | Fall back to PR-level comments; no thread resolve. |
| A-022 | Provider `/models` is reliable enough to be the only model source. | Medium | Provider conformance tests; fallback manifest. | Add a signed provider manifest as a first-class path. |
| A-023 | The repo graph materially improves full-repo review quality. | Medium | Benchmark diff vs graph-assisted. | Keep diff-only; make full review optional. |
| A-024 | Docker Compose is enough for the first agentic release. | High | Install spike + 10× load test. | Add K8s/Helm earlier. |

## Assumptions we reject

- "The Cloudflare free tier is the deployment target." No.
- "A single owner is the only user." No for the product; yes for a single-operator mode.
- "Byte budgets are good enough." No.
- "A prompt is a security boundary." No.
- "The PoC's docs are current." No; see
  [`../poc/deployment.md`](../poc/deployment.md#documentation-drift-in-the-poc).

## How to challenge an assumption

1. Find the cheapest experiment that could falsify it.
2. Record the result in this file (date, evidence, confidence change).
3. If the confidence drops below Medium and the assumption is load-bearing, write an ADR and ask
   the owner before continuing.
