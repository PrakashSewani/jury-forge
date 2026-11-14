# Roadmap

The path from documentation to a first supported release. Each phase has a goal, deliverables, and
an exit gate. The owner approves each gate before the next phase starts.

## Phase 0 — Product definition and documentation (current)

**Goal:** agree on what we are building, why, and the architecture that can deliver it.

**Deliverables:**

- PoC study: architecture, behaviour, deployment, data model, API, decisions, testing,
  retrospective.
- Flaw register with evidence and severity.
- Product vision, personas, principles, capabilities, scope, success metrics.
- Target architecture: components, data model, job pipeline, security, AI pipeline, extensibility,
  observability, operations, deployment.
- ADR drafts for the durable choices.
- Agent chain, skills, and workflow prompts.
- MIT licence, README, AGENTS.md.

**Exit gate (G0):** the owner has reviewed the docs, answered the open questions that block
architecture, and approved the scope and principles.

**Not in this phase:** product code, infrastructure, dependencies.

## Phase 1 — Foundation and walking skeleton

**Goal:** prove the self-hosted runtime with a manual, diff-only, one-agent review **and a persisted
conversation** — not a one-shot review.

**Deliverables:**

- Stack ADRs accepted: runtime, deployment, storage, queue, auth, agent harness (ADR-0010).
- Repository structure and the one-command check.
- Compose install (app, worker, scheduler, Postgres) with migrations and a bootstrap admin.
- Shared contracts (schemas), error taxonomy, OpenAPI generation.
- Provider onboarding: key validation, `/models` discovery, encrypted storage, catalog (ADR-0011).
- GitHub App setup, webhook ingress, queue, manual `/jury review` on an installed repo.
- One agent bound to a catalog model; diff-only context; one review publish.
- Per-PR session, one thread reply, and a guarded resolve after a human reply (ADR-0012).
- Session/turn/tool-call/finding records, a basic session timeline, health/readiness, logs.
- A clean-machine install test and a deterministic test suite.

**Exit gate (G1):** a new operator installs on a clean Linux host, adds a provider key, sees the
model catalog, triggers `/jury review` on a test PR, replies to the thread, gets a second agent
response, and sees a guarded resolve. The PoC can be turned off.

## Phase 2 — Trust and security

**Goal:** make the product safe for a real team.

**Deliverables:**

- Roles, memberships, scopes, authorization matrix and tests.
- Credential-to-origin binding, egress policy, SSRF defenses; provider key encryption/rotation.
- Secret/PII redaction and a pre-send manifest.
- Trust-labelled prompts, nonce delimiters, output validation.
- Prompt-injection defenses for **user replies and PR comments**, not only diffs.
- Resolution guard: bot-owned thread, human response, evidence, verifier, audit (ADR-0012).
- Audit stream with export; retention and deletion for sessions/messages/graph.
- Preview/approve mode; suppression rules.
- Session revocation, re-auth for sensitive actions, security headers.
- Prompt-injection and SSRF test suites.
- `SECURITY.md`, threat model review, hardening checklist.

**Exit gate (G2):** the security review signs off; the injection/SSRF/authz suites pass; a
red-team exercise finds no S1 issues.

## Phase 3 — Review quality

**Goal:** make the jury measurably better than a single strong model with a good prompt.

**Deliverables:**

- Repository knowledge graph: symbols, imports, references, tests, configs, ownership; incremental
  update on every review run and default-branch push (ADR-0014).
- Token-aware context planner with a manifest and cost estimate; context reuse via content hashes.
- Multi-agent router: explicit request > repo config > path/language/label scope > availability;
  record why each agent ran or was skipped (ADR-0013).
- Diff-only default; explicit context review with estimate/cancel.
- Structured output, repair, grounding, verification, confidence.
- Deduplication, disagreement, optional chair/consensus.
- Suggested fixes with patch validation.
- Evaluation benchmark (golden PRs, metrics, scorecards).
- Agent versioning, activation gates, rollback, run-time snapshots.
- Feedback capture and agent scorecards.
- Knowledge-pack retrieval (not wholesale injection).

**Exit gate (G3):** the benchmark beats the baseline on precision, recall, grounding, and
acceptance; the dogfood repo runs on itself; cost per accepted finding is within budget.

## Phase 4 — Operations and release

**Goal:** a product an operator can run, upgrade, back up, and recover.

**Deliverables:**

- Backups, restore drill, upgrade/rollback, migration safety.
- `jury-forge` CLI: install, migrate, doctor, backup, restore, rotate-key, export/import,
  create-admin, reconcile.
- Metrics, traces, dashboards, alerts, SLOs, support bundle.
- Signed images, SBOM, provenance, changelog, SemVer.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates.
- Documentation: install, upgrade, security, troubleshooting, runbooks.
- Load/soak tests and a support matrix.

**Exit gate (G4):** a release candidate passes the install/upgrade/restore drills on the support
matrix; the operations docs are complete; the security checklist is green.

## Phase 5 — v1 launch

**Goal:** the first supported, MIT-licensed release.

**Deliverables:**

- v1.0.0 tag, signed images, release notes.
- Public docs site and a read-only demo.
- A public benchmark scorecard.
- A security disclosure process.
- At least one external dogfood team (with permission) and a case study.
- A support policy and a roadmap for v1.x.

**Exit gate (G5):** the owner signs off; the release checklist is complete; no open S1/S2 security
issues; the docs are consistent.

## Post-v1

Ordered by expected demand, not committed:

1. GitHub Enterprise Server (if not in v1).
2. GitLab adapter.
3. OIDC/SSO and group-to-role mapping.
4. Kubernetes/Helm.
5. Outbound integrations (Slack, Teams, PagerDuty) and a signed webhook catalogue.
6. Cross-repository context for platform teams.
7. Multi-installation/multi-tenant improvements.
8. Air-gapped install.
9. A plugin model (out-of-process; no arbitrary code in the core).
10. A reviewer/pack registry (only if the core is trusted).

## Milestone map

| Milestone | Phase | Proves |
| --------- | ----- | ------ |
| M0 | 0 | We agree on the product and the architecture. |
| M1 | 1 | The self-hosted runtime can do a manual, conversational review. |
| M2 | 2 | A real team can use the sessions/providers safely. |
| M3 | 3 | The jury/router/graph are measurably better. |
| M4 | 4 | An operator can run it. |
| M5 | 5 | It is a product, not a project. |

## Dependencies and critical path

```
G0 docs ──▶ ADRs (runtime/storage/queue/auth) ──▶ M1 walking skeleton
                                                   │
                     ┌─────────────────────────────┼─────────────────────────────┐
                     ▼                             ▼                             ▼
              M2 security                    M3 quality                    M4 operations
                     └─────────────────────────────┼─────────────────────────────┘
                                                   ▼
                                                M5 v1 launch
```

Security and quality can run in parallel after M1, but both must pass before M5. Operations work
starts at M1 (install, health, logs) and hardens at M4.

## What could change the plan

- The owner's final capability list (Q-001) may add or remove a phase.
- The deployment/storage/runtime ADRs may choose a different stack and shift Phase 1.
- The benchmark may show that a code index is not worth the cost; then Phase 3 focuses on
  grounding and consensus instead.
- A security review may force an earlier trust/security phase.
- The harness spike (ADR-0010) may choose a thin turn runner instead of LangGraph.js; that changes
  Phase 1 implementation, not the product contract.

See [`status.md`](status.md) for the live state and [`quality-gates.md`](quality-gates.md) for the
gate checklists.
