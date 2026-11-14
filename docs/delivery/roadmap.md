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

**Goal:** prove the self-hosted runtime with a manual PR review (diff-only, one agent) **and a
persisted conversation** — not a one-shot review.

**Deliverables:**

- Stack ADRs accepted: runtime, deployment, storage, queue, auth, agent harness (ADR-0010).
- Repository structure and the one-command check.
- Compose install (app, worker, scheduler, Postgres) with migrations and a bootstrap admin.
- Shared contracts (schemas), error taxonomy, OpenAPI generation.
- Provider onboarding: key validation, `/models` discovery, encrypted storage, catalog (ADR-0011).
- GitHub App setup, webhook ingress, queue, manual `jury:pr-review`/`jury:branch-review` labels + Check Run actions on an installed repo.
- Reviewer catalog + per-repo binding with selection modes (`required`/`default`/`capability`; Phase 1 uses built-in capability IDs only); no binding = unavailable (ADR-0016).
- One agent bound to a catalog model; PR review is diff-only; one review publish.
- Per-PR session, one thread reply, and **`suggest` resolution** (agent proposes, human resolves natively/UI; `auto`/`off` opt-in; SME/admin override; ADR-0012).
- PR review is **strict T0 diff-only**; hard per-turn token/wall-clock caps (and tool-call caps for
  tool-enabled modes) (ADR-0018; ADR-0019 rejected for PR review).
- **Evaluation harness v0:** ≈20 labelled PRs (seeded bugs, clean, adversarial), deterministic stub-model
  CI, first baseline of a single strong-model prompt. Review-logic changes are measured from here.
- No-reviewers/no-match fallback comment with setup/retrigger instructions.
- Minimal control plane UI: setup, provider/model catalog, reviewer studio, repo bindings, session inbox/timeline, fallback status.
- Session/turn/tool-call/finding records, a basic session timeline, health/readiness, logs.
- A clean-machine install test and a deterministic test suite.

**Exit gate (G1):** a new operator installs on a clean Linux host, adds a provider key, sees the
model catalog, triggers the `jury:pr-review` label or Check Run action on a test PR, replies to the thread, gets a
second agent response, and resolves it natively in `suggest` mode. A runaway-loop test proves the hard caps stop a turn, and the
evaluation harness v0 runs in CI. The PoC can be turned off.

## Phase 2 — Trust and security

**Goal:** make the product safe for a real team.

**Deliverables:**

- Roles, memberships, scopes, authorization matrix and tests: owner/admin/**SME**/maintainer/member/viewer/auditor.
- Reviewer catalog approval and repo binding authorization; required-unavailable blocks the review.
- Credential-to-origin binding, egress policy, SSRF defenses; provider key encryption/rotation.
- Secret/PII redaction and a pre-send manifest.
- Trust-labelled prompts, nonce delimiters, output validation.
- Prompt-injection defenses for **user replies and PR comments**, not only diffs.
- Resolution modes: `suggest` default; `auto` guarded (bot-owned thread, human response, evidence, verifier, audit); SME/admin override (ADR-0012).
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

- Benchmark v1 first: strict diff-only PR review vs a single strong-model baseline; decide on
  evidence whether the graph is built (ADR-0018). Repository knowledge graph (symbols, imports,
  references, tests, configs, ownership; incremental update; ADR-0014) is **v1.1 and benchmark-gated**.
- Token-aware context planner with a manifest and cost estimate; context reuse via content hashes.
- Multi-agent router with `required`/`default`/`capability` selection, path/language/label scope, and
  availability; record why each agent ran or was skipped (ADR-0013/ADR-0016).
- Capability registry + `jury:cap:<id>` labels (built-in/custom, one-level groups, every installed
  repo); capability labels alone default to PR review; no slash commands.
- PR review default (strict T0 diff-only). Explicit branch review (default-branch comparison + graph
  diff, estimate/cancel) is **v1.1**.
- Structured output, repair, grounding, verification, confidence.
- Deduplication, disagreement, optional chair/consensus.
- Suggested fixes with patch validation.
- Evaluation benchmark (golden PRs, metrics, scorecards).
- Agent versioning, activation gates, rollback, run-time snapshots.
- Feedback capture and agent scorecards.
- Knowledge system: packs/skills, capability/repo/reviewer grants, retrieval with citations. Repo docs at SHA (T2), live doc links with snapshots, and the Knowledge UI are v1.1.
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

## v1.1 (benchmark-gated)

Repository knowledge graph, branch review, repo docs at SHA (T2), live doc links with snapshots,
Knowledge UI, GHES, signed packs (ADR-0018). Each enters only with benchmark evidence or an owner decision.

## Post-v1

Ordered by expected demand, not committed:

1. GitHub Enterprise Server (v1.1).
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
