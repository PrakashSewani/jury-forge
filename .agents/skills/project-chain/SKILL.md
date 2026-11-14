---
name: project-chain
description: Orchestrate the Jury Forge specialist agent chain (research → product → architecture → security/quality → critic → docs → human gate → implement → verify). Use when starting a documentation run, a design review, or a delivery phase, and when handoffs must stay in sync.
---

# Project chain

Run Jury Forge work as a relay of specialist stages, not a single omniscient agent. The chain is
defined in `docs/delivery/agent-chain.md`; this skill is the operating procedure.

## Before you start

1. Read `AGENTS.md`, `docs/delivery/status.md`, and the relevant layer of `docs/README.md`.
2. State the stage, the input artefact, the output artefact, and the gate.
3. Decide whether the stage needs a subagent. If yes, use the project agent in `.pi/agents/`.
   If not, run the stage yourself in the same order.
4. Freeze the input: name the document and revision being reviewed. Do not edit it while others
   read it.

## The sequence

| # | Stage | Reads | Produces | May write? |
| - | ----- | ----- | -------- | ---------- |
| 1 | research-scout | repos, code, docs, issues | evidence pack | no |
| 2 | product-strategist | evidence + owner input | spec draft + open questions | no |
| 3 | architect | spec + evidence | design + ADR drafts | no |
| 4 | security-red-team | design + spec | threat model + findings | no |
| 4 | review-quality-designer | design + spec | pipeline + eval plan | no |
| 5 | critic | all drafts | contradictions, gaps, weak evidence | no |
| 6 | docs-editor | all drafts + critic | consolidated docs + status | docs only |
| 7 | HUMAN GATE | consolidated docs | approval / amendments | owner |
| 8 | implementer | approved spec + ADRs | code + tests + docs | code |
| 9 | verifier | diff + acceptance criteria | verification report | no |

Stages 4a and 4b may run in parallel. Nothing else may run in parallel with a writer.

## Handoff contract

Every handoff is a written block, not a chat summary. Copy this into the response or the relevant
doc:

```md
## Stage
<role> — <date>

## Input
- <doc path>@<revision>
- <evidence: file:line or command>

## Output
- <artefact path or section>
- <decisions proposed>
- <open questions>

## Evidence
- <file:line> — <what it shows>
- <command/output> — <what it proves>

## Confidence
<high|medium|low> — <why>

## Next stage
<role> — <one concrete action>
```

## Sync rules

- One writer at a time. The docs editor owns documentation; the implementer owns code.
- The next stage reads the artefact, not the transcript.
- A summary without evidence is a lead, not a fact.
- If two stages disagree, record both positions and escalate to the owner. Do not silently pick.
- If a stage contradicts an accepted ADR, stop and write a superseding ADR proposal.
- Update `docs/delivery/status.md` after each gate: done, verified, blocked, next.

## Escalate when

- The capability list is ambiguous or missing (Q-001).
- A stack/architecture choice changes an accepted ADR.
- A security finding is S1 and cannot be mitigated in scope.
- Two accepted docs contradict each other.
- Scope would grow beyond the approved wedge.
- A new dependency or licence change is needed.

## Done criteria for a documentation run

The owner can answer:

1. What are we building and for whom?
2. What did the PoC prove and what did it get wrong?
3. What is the architecture, and why these boundaries?
4. What are the security and quality risks, and how are they controlled?
5. What is the next milestone, and what must be true to pass it?

If any answer is missing, the chain is not done.

## Anti-patterns

- Same agent writes, reviews, and approves.
- Two writers in parallel.
- Evidence-free confidence.
- Silent scope growth.
- Treating a subagent summary as proof.
- Carrying a PoC choice without asking whether it serves the product.
