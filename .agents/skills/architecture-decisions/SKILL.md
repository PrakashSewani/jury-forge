---
name: architecture-decisions
description: Write, review, and supersede Jury Forge ADRs and architecture documents. Use when a durable technical or product choice is proposed, when comparing stack/deployment/storage options, or when an existing decision needs to be revisited.
---

# Architecture decisions

An ADR is the durable memory of a choice. It exists so a future maintainer does not have to
reconstruct the argument from a diff.

## When to write an ADR

Write one when the choice is:

- durable (hard to reverse),
- cross-cutting (more than one module or team),
- a stack, dependency, deployment, storage, security, or data-model decision,
- a deliberate departure from the PoC or a previous ADR.

Do **not** write one for a reversible implementation detail. Use the spec or a code comment.

## Process

1. Read the relevant architecture doc and the existing ADRs. Check for a prior decision.
2. State the context and the forces.
3. List at least three options, including "do nothing" and the PoC's approach where relevant.
4. Compare them on: correctness, quality, security, operations, cost, effort, reversibility,
   lock-in, and licence.
5. Recommend one. State the trade-off honestly.
6. Write the consequences: easier, harder, impossible, new invariants.
7. Record security/operations impact and a revisit trigger.
8. Mark it `proposed`; get the owner's decision; mark it `accepted`.
9. Update the affected docs and the status file.
10. Link the code/tests that enforce it once they exist.

## Template

Use `docs/delivery/ways-of-working.md#4-the-adr-template`. Keep it to one decision.

## Review checklist

- [ ] One decision, not a bundle.
- [ ] Context explains the forces, not just the preference.
- [ ] At least three options, with real trade-offs.
- [ ] The PoC's approach is considered (keep/adapt/reject) when relevant.
- [ ] Security and operations consequences are explicit.
- [ ] Revisit trigger is concrete (date, scale, benchmark, provider change).
- [ ] No hand-wavy "industry standard" or "best practice" without evidence.
- [ ] The licence impact is considered.
- [ ] The decision does not contradict an accepted ADR (or explicitly supersedes it).
- [ ] The doc index and status are updated.

## Option comparison matrix

| Criterion | Option A | Option B | Option C |
| --------- | -------- | -------- | -------- |
| Correctness | | | |
| Review quality | | | |
| Security | | | |
| Operations | | | |
| Cost | | | |
| Effort | | | |
| Reversibility | | | |
| Lock-in | | | |
| Licence | | | |
| PoC fit | | | |

## Superseding

- Never edit an accepted ADR's decision.
- Write a new ADR that says `Supersedes: ADR-XXXX`.
- Mark the old one `superseded by ADR-YYYY`.
- Update the index and any docs that linked the old decision.
- Explain what changed in the context, not just the new choice.

## Anti-patterns

- An ADR that is really a design doc.
- A decision with no alternatives (it is a preference, not a decision).
- A "temporary" choice with no revisit trigger.
- A stack choice justified by familiarity alone.
- Ignoring the PoC's flaws when adapting an idea.
- A decision that requires a central service without an owner override.
- Linking a decision to code that does not exist yet without marking it proposed.

## Architecture doc review

When reviewing `docs/architecture/*`:

- Every component has a responsibility and a non-responsibility.
- Every boundary is enforceable in code, not only in a diagram.
- The data model is tenant-scoped and versioned.
- The job pipeline has leases, idempotency, retries, DLQ, and cancellation.
- Security has a threat model and a control per threat.
- Operations has install, upgrade, backup, restore, and diagnosis.
- Observability has logs, metrics, traces, and a run timeline.
- The doc says what is proposed vs accepted.
