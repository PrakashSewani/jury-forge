---
description: Run the Jury Forge documentation chain (research → product → architecture → security/quality → critic → docs) for a topic
argument-hint: "[topic or question]"
---

Run the Jury Forge documentation chain for: ${@:-the current milestone}

If a subagent extension is available, use the project agents in `.pi/agents/` in this order. If
not, perform each stage yourself, writing the artefact before moving to the next stage. Do not
skip a stage because the topic "seems simple".

1. **research-scout** — gather evidence for `${@:-the topic}`. Cite `file:line`, decisions, and
   command output. Do not edit anything.
2. **product-strategist** — turn the evidence into a spec draft: problem, users, behaviour, edge
   cases, non-goals, acceptance criteria, metrics, security/privacy, open questions.
3. **architect** — propose the design and ADR drafts. Apply the principles and the PoC flaw
   register. Name invariants, failure modes, and operational impact.
4. **security-red-team** and **review-quality-designer** — review the frozen design in parallel.
   One produces a threat model and findings; the other produces the AI pipeline and evaluation
   design.
5. **critic** — adversarially review all drafts. Report must-fix, should-fix, and open questions.
6. **docs-editor** — merge into `docs/`, fix links, update `docs/delivery/status.md`, and prepare
   the human gate summary.

Rules:

- One writer at a time: only the docs editor writes docs; only an implementer writes code.
- Every handoff uses the handoff block in `docs/delivery/agent-chain.md`.
- Evidence is not proof: check a cited file before it becomes a decision.
- Stop and ask the owner if a capability is missing, a security finding is S1, or an accepted ADR
  would be contradicted.
- Do not write product code. Phase 0 is documentation only.

Finish with:

- what was produced (paths),
- what was decided or proposed,
- what needs the owner,
- the single next action.
