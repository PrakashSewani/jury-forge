# Jury Forge knowledge base

This directory is the single source of truth for **what we are building, why, and how**. It is
written to be read by humans and agents. Start at the layer you need; do not read everything.

## The four layers

| Layer          | Question it answers                                      | Start here                                         |
| -------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **PoC study**  | What did the proof of concept actually build and prove?  | [`poc/overview.md`](poc/overview.md)               |
| **Analysis**   | What is wrong with it, what do we keep, what do we reject? | [`analysis/flaws.md`](analysis/flaws.md)          |
| **Product**    | Who is this for, what does it do, what is out of scope?  | [`product/vision.md`](product/vision.md)           |
| **Architecture** | How will the product be built and operated?            | [`architecture/overview.md`](architecture/overview.md) |
| **Delivery**   | What happens next, in what order, and who owns it?       | [`delivery/roadmap.md`](delivery/roadmap.md)       |

## Map

### 1. PoC study

- [`poc/overview.md`](poc/overview.md) — what the PoC is, its timeline, its promises.
- [`poc/architecture.md`](poc/architecture.md) — components, runtime, data flow, run engine.
- [`poc/code-review.md`](poc/code-review.md) — module-by-module code structure, technical decisions, and code-level defects.
- [`poc/live-instance.md`](poc/live-instance.md) — the live deployment, its real run history, and the only posted review, verified against the PR code.
- [`poc/behavior.md`](poc/behavior.md) — setup, auth, webhooks, review lifecycle, UI.
- [`poc/deployment.md`](poc/deployment.md) — Cloudflare deployment, secrets, CI/CD, constraints.
- [`poc/data-model.md`](poc/data-model.md) — every table, migration, and stored shape.
- [`poc/api.md`](poc/api.md) — the HTTP surface, auth rules, and error taxonomy.
- [`poc/decisions.md`](poc/decisions.md) — the 34 decisions the PoC recorded, distilled.
- [`poc/testing.md`](poc/testing.md) — how it was tested and what the tests did not cover.
- [`poc/retrospective.md`](poc/retrospective.md) — honest lessons from the build.

### 2. Analysis

- [`analysis/flaws.md`](analysis/flaws.md) — the flaw register, with severity and evidence.
- [`analysis/risks.md`](analysis/risks.md) — product, delivery, security, and operational risks.
- [`analysis/inherit-reject.md`](analysis/inherit-reject.md) — the keep / reject / rethink ledger.
- [`analysis/open-questions.md`](analysis/open-questions.md) — questions the owner must answer.
- [`analysis/assumptions.md`](analysis/assumptions.md) — assumptions we are currently making.

### 3. Product

- [`product/vision.md`](product/vision.md) — the thesis and the wedge.
- [`product/personas.md`](product/personas.md) — who we serve and what they need.
- [`product/principles.md`](product/principles.md) — the tie-breakers.
- [`product/capabilities.md`](product/capabilities.md) — capability backlog, status, and TBDs.
- [`product/scope.md`](product/scope.md) — in, out, and deferred.
- [`product/success.md`](product/success.md) — what "better than the PoC" means, measurably.
- [`product/specs/`](product/specs/) — one spec per approved capability (template and index).
  - [`agentic-review-sessions.md`](product/specs/agentic-review-sessions.md) — per-PR sessions, manual triggers, routing, resolution.
  - [`provider-model-discovery.md`](product/specs/provider-model-discovery.md) — provider keys, `/models`, catalog, no free text.
  - [`repo-knowledge-graph.md`](product/specs/repo-knowledge-graph.md) — diff-first + context graph, incremental updates.
  - [`session-capacity-and-visibility.md`](product/specs/session-capacity-and-visibility.md) — interface, concurrency, roles, visibility, budgets.
  - [`reviewer-assignment-and-roles.md`](product/specs/reviewer-assignment-and-roles.md) — reviewer catalog, repo bindings, SME/admin roles, fallback.
  - [`knowledge-system.md`](product/specs/knowledge-system.md) — skills/docs/doc links, snapshots, grants, retrieval, citations.
  - [`v1-ui.md`](product/specs/v1-ui.md) — v1 website control plane and session UI scope.

### 4. Architecture

- [`architecture/overview.md`](architecture/overview.md) — the target system in one page.
- [`architecture/agentic-review.md`](architecture/agentic-review.md) — PR sessions, turns, agent harness, routing, resolution, provider/graph integration.
- [`architecture/tech-depth/branch-review.md`](architecture/tech-depth/branch-review.md) — deferred branch-review design (default branch comparison, graph diff, open questions).
- [`architecture/components.md`](architecture/components.md) — services, responsibilities, boundaries.
- [`architecture/data-model.md`](architecture/data-model.md) — target entities and storage choices.
- [`architecture/job-pipeline.md`](architecture/job-pipeline.md) — webhook to verdict, reliably.
- [`architecture/security.md`](architecture/security.md) — threat model and controls.
- [`architecture/ai-pipeline.md`](architecture/ai-pipeline.md) — context, reviewers, verification, evaluation.
- [`architecture/extensibility.md`](architecture/extensibility.md) — providers, forges, rules, plugins.
- [`architecture/observability.md`](architecture/observability.md) — logs, metrics, traces, cost.
- [`architecture/operations.md`](architecture/operations.md) — install, upgrade, backup, troubleshoot.
- [`architecture/deployment.md`](architecture/deployment.md) — supported deployment models.
- [`architecture/runbooks/`](architecture/runbooks/) — operational procedures (index).

### 5. Delivery

- [`delivery/roadmap.md`](delivery/roadmap.md) — phases and milestones.
- [`delivery/status.md`](delivery/status.md) — the live tracker and handoff.
- [`delivery/agent-chain.md`](delivery/agent-chain.md) — how the specialist agents hand off.
- [`delivery/ways-of-working.md`](delivery/ways-of-working.md) — docs, PRs, ADRs, reviews.
- [`delivery/quality-gates.md`](delivery/quality-gates.md) — what must be true before code and release.

### 6. Reference and decisions

- [`reference/glossary.md`](reference/glossary.md) — shared vocabulary.
- [`reference/sources.md`](reference/sources.md) — where the evidence came from.
- [`decisions/README.md`](decisions/README.md) — the ADR process and index.

## Reading paths

**New contributor**: `poc/overview` → `analysis/inherit-reject` → `product/vision` →
`architecture/overview` → `delivery/ways-of-working`.

**Designing a feature**: `product/scope` → `product/capabilities` → relevant architecture doc →
`decisions/README` → write a spec → ADR if durable → implementation after the gate.

**Security review**: `analysis/flaws` → `architecture/security` → `architecture/ai-pipeline` →
`architecture/operations`.

**Shipping**: `delivery/roadmap` → `delivery/quality-gates` → `delivery/status` →
`architecture/operations`.

## Conventions

- Documents are normative unless marked as a draft or an open question.
- Claims about the PoC cite a file and, where useful, a line.
- Decisions are append-only ADRs in [`decisions/`](decisions/). Supersede; never rewrite.
- Unknowns are written as **TBD** with an owner and the evidence needed to close them.
- A document that no longer matches the code or the accepted decisions is a bug. Fix it in the
  same pull request.
