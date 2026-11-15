---
description: Turn a capability statement into a Jury Forge product spec and capability-table update
argument-hint: "<capability statement or source>"
---

The owner has supplied this capability:

> ${@:-<paste the capability statement>}

Do the following, in order:

1. **Quote and classify.** Record the owner's statement verbatim, with the date and source. Mark it
   `TBD`, `planned`, `deferred`, or `out` in `docs/product/capabilities.md`.
2. **Trace it.** Name the persona and job-to-be-done it serves. If it traces to none, say so and
   ask whether it belongs in scope.
3. **Check the principles.** Name the principles it serves and any it bends.
4. **Check the PoC.** Is there a PoC precedent? What did it get right/wrong? Cite the flaw register.
5. **Write the spec** in `docs/product/specs/<slug>.md` using the product-spec template. Include
   behaviour, edge cases, non-goals, testable acceptance criteria, metrics, security/privacy,
   failure modes, rollout, and open questions.
6. **Decide the ADR need.** If the capability is durable or architectural, draft an ADR and mark it
   proposed.
7. **Stop at the gate.** Do not implement. Ask the owner to approve the spec and the ADR.

Rules:

- Do not invent requirements the owner did not state.
- Do not expand the wedge without an explicit decision.
- Do not write code.
- If the capability conflicts with an accepted decision, stop and record the conflict.
- Keep the spec 1–3 pages.
