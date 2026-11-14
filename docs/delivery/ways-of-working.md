# Ways of working

The process exists to keep a small, agent-assisted team honest. It is intentionally lightweight:
one source of truth, one decision log, one tracker, one check.

## 1. Documentation first

- A non-trivial change starts with a document: a spec, an ADR, or a section update.
- The document states the problem, the users, the behaviour, the non-goals, the acceptance
  criteria, and the risks.
- Code follows the approved document. If the code needs to deviate, update the document first.
- Trivial edits (typos, broken links, formatting) do not need a spec.

## 2. The document types

| Type | When | Location | Template |
| ---- | ---- | -------- | -------- |
| **Spec** | A feature or capability | `docs/product/specs/<slug>.md` | Problem, users, behaviour, edge cases, non-goals, acceptance, metrics, risks, open questions |
| **ADR** | A durable architectural or product choice | `docs/decisions/ADR-XXXX-<slug>.md` | Context, options, decision, consequences, security/ops, revisit trigger |
| **Runbook** | An operational procedure | `docs/architecture/runbooks/<slug>.md` | Symptoms, impact, diagnosis, mitigation, verification, follow-up |
| **Research** | Evidence gathering | `docs/analysis/` or `docs/poc/` | Question, method, evidence, findings, confidence |
| **Status** | The live handoff | `docs/delivery/status.md` | Phase, done, verified, blocked, next |

## 3. The spec template

```md
# <Capability>

## Problem
What hurts, for whom, and why now.

## Users and jobs
Which persona(s), which job-to-be-done.

## Behaviour
What the product does, step by step. Include the happy path and the important edge cases.

## Non-goals
What this deliberately does not do.

## Acceptance criteria
Testable statements. Each one maps to a test or a manual check.

## Metrics
How we know it worked (quality, reliability, cost, adoption).

## Security and privacy
Trust boundaries, data touched, egress, retention, authz.

## Risks and open questions
What could go wrong; what we need the owner to decide.

## Rollout
Feature flag, migration, docs, support.
```

## 4. The ADR template

```md
# ADR-XXXX: <Title>

- Status: proposed | accepted | superseded by ADR-YYYY | rejected
- Date: YYYY-MM-DD
- Owners: <role>
- Supersedes: <ADR or —>
- Revisit trigger: <event/date>

## Context
The forces at play. What problem are we solving? What constraints apply?

## Options
1. <Option> — pros, cons, cost, risk.
2. ...

## Decision
The chosen option, in one paragraph.

## Consequences
What becomes easier, harder, more expensive, or impossible.

## Security and operations
Threat model impact, deployment impact, migration impact.

## Evidence
Links to docs, spikes, benchmarks, or file:line.

## Follow-ups
What must happen next; what is explicitly deferred.
```

## 5. The pull request

Every PR states:

- **What** changed and **why**.
- **Docs** touched (or why none).
- **Evidence**: commands run, results, screenshots for UI, benchmark numbers.
- **Risk**: security, data, migration, rollback.
- **Open questions**.
- **Checklist**: tests, docs, status, licence, secrets.

PR rules:

- One logical change. Small enough to review in one sitting.
- No direct pushes to `dev`.
- No secrets, no customer data, no generated build output.
- A bug fix includes a regression test that fails without the fix (mutation-checked where
  practical).
- A prompt change includes a benchmark result.

## 6. Code review

The reviewer checks:

1. **Correctness:** does it do what the spec says, including edge cases?
2. **Security:** trust boundaries, authz, egress, secrets, injection.
3. **Reliability:** failure modes, idempotency, retries, timeouts, observability.
4. **Simplicity:** the smallest change that solves the problem; no speculative abstraction.
5. **Tests:** do they prove the behaviour, not just the wiring?
6. **Docs:** spec/ADR/status updated; links valid.
7. **Licence:** new dependencies are compatible with MIT.

Review etiquette: comment on the code, not the author; ask a question when intent is unclear; block
only on correctness, security, or a broken gate.

## 7. Branching and commits

- `dev` is the integration branch; feature branches target it.
- Branch names: `docs/<topic>`, `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.
- Commit messages: imperative, scoped: `docs(analysis): add flaw register`,
  `feat(review): add grounded finding verifier`.
- One logical change per commit. Rebase before merge; no merge-commit noise unless the repo
  convention says otherwise.
- Release tags: SemVer, signed, with a changelog.

## 8. Status cadence

- Update `docs/delivery/status.md` after each meaningful milestone, not retrospectively.
- Exactly one phase `in progress`.
- "Done" is what landed; "Verified" is what was run and observed; "Blocked" is the exact question;
  "Next action" is one concrete step.
- A stale status file is a bug.

## 9. Decision process

1. Someone proposes a choice with context and options.
2. The architect writes an ADR draft.
3. Security/quality/critic review it if relevant.
4. The owner decides (or accepts the default with a revisit date).
5. The ADR is accepted and linked from the affected docs.
6. If reversed later, a new ADR supersedes it; history is not rewritten.

## 10. Documentation consistency

- Every link resolves; every referenced file exists.
- Every ADR referenced by an architecture doc exists and has a status.
- No doc claims a capability that is not in `capabilities.md` or a spec.
- PoC facts are labelled as PoC facts; target decisions are labelled as proposed.
- A release checklist includes a docs review.

## 11. Definition of ready

A task is ready to implement when:

- The spec is approved and its acceptance criteria are testable.
- The ADRs it depends on are accepted.
- The security/privacy impact is documented.
- The migration/rollout plan exists.
- The test plan exists.
- The owner has passed the relevant gate.

## 12. Definition of done

A task is done when:

- Acceptance criteria pass; tests cover them.
- The check command passes.
- Docs (spec, ADR, status, runbook) are updated.
- Security/privacy review is complete for the change.
- Observability is in place (logs/metrics/traces) for new failure modes.
- No secrets or generated artefacts in the repo.
- The PR description states what changed and what was verified.

## 13. What we do not do

- No code before the gate.
- No silent scope growth.
- No undocumented architectural decisions.
- No "temporary" bypass of auth, egress, or validation.
- No prompt change without a benchmark.
- No release without a restore drill.
- No telemetry without consent.
- No CLA.

## 14. When in doubt

Ask one focused question, write down the default assumption, and continue with the part that does
not depend on the answer. Do not block the whole project on a decision that can be revisited.
