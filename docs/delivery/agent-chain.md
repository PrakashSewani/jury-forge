# Agent chain

Jury Forge is designed and reviewed by a relay of specialist roles. The chain exists to keep
context focused, force evidence, and prevent one agent from writing and rubber-stamping the same
work. It is a **process**, not an autonomous swarm: the primary agent owns the final document and
the human owns the decision.

## Roles

| Role | File | Writes? | Purpose | Output artefact |
| ---- | ---- | :-----: | ------- | --------------- |
| **Research scout** | `.pi/agents/research-scout.md` | no | Find and cite evidence in the PoC, repositories, docs, and code. | Evidence pack in the response; primary files it under `docs/` if needed. |
| **Product strategist** | `.pi/agents/product-strategist.md` | no | Turn evidence and owner input into a product spec: users, jobs, behaviour, acceptance, non-goals. | Spec draft + open questions. |
| **Architect** | `.pi/agents/architect.md` | no | Propose the target design, boundaries, data model, and ADRs; identify trade-offs. | Architecture/ADR draft. |
| **Security red team** | `.pi/agents/security-red-team.md` | no | Threat-model the design; find exfiltration, injection, authz, SSRF, and reliability flaws. | Threat model + findings. |
| **Review-quality designer** | `.pi/agents/review-quality-designer.md` | no | Design the AI pipeline: context, grounding, verification, consensus, evaluation. | Pipeline/eval design + benchmark plan. |
| **Critic** | `.pi/agents/critic.md` | no | Adversarially review all drafts: contradictions, missing evidence, scope creep, weak assumptions. | Findings + unresolved conflicts. |
| **Docs editor** | `.pi/agents/docs-editor.md` | docs only | Consolidate drafts into the knowledge base, fix links and consistency, update status. | Merged docs + status. |
| **Implementer** | `.pi/agents/implementer.md` | code | Implement an approved spec behind tests. Only after G0. | Code + tests + docs updates. |
| **Verifier** | `.pi/agents/verifier.md` | no | Run checks, inspect the diff, verify acceptance criteria, and report evidence. | Verification report. |

The primary agent is the **architect-integrator**: it may perform any stage when the chain is not
available, but it must not secretly self-approve. If it writes a draft, a different stage (or the
human) reviews it.

## The chain

```
                    ┌──────────────────┐
   owner input ────▶│  research-scout  │
                    └────────┬─────────┘
                             │ evidence pack
                             ▼
                    ┌──────────────────┐
                    │ product-strategist│
                    └────────┬─────────┘
                             │ spec + questions
                             ▼
                    ┌──────────────────┐
                    │    architect     │
                    └────────┬─────────┘
                             │ design + ADR drafts
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌────────────────────┐        ┌──────────────────────────┐
   │ security-red-team  │        │ review-quality-designer  │
   └─────────┬──────────┘        └────────────┬─────────────┘
             │ threat model                   │ pipeline + eval
             └──────────────┬─────────────────┘
                            ▼
                   ┌──────────────────┐
                   │      critic      │
                   └────────┬─────────┘
                            │ findings + conflicts
                            ▼
                   ┌──────────────────┐
                   │   docs-editor    │
                   └────────┬─────────┘
                            │ consolidated docs + status
                            ▼
                   ┌──────────────────┐
                   │   HUMAN GATE     │
                   └────────┬─────────┘
                            │ approved scope + ADRs
                            ▼
              ┌─────────────┴─────────────┐
              ▼                           ▼
     ┌──────────────────┐        ┌──────────────────┐
     │   implementer    │───────▶│    verifier      │
     └──────────────────┘        └────────┬─────────┘
                                          ▼
                                   release / next loop
```

## Handoff contracts

Every handoff is a written artefact, not a chat summary. Use this shape:

```md
## Stage
<role> — <date>

## Input
- <document/section read>
- <evidence file:line>

## Output
- <artefact path or section>
- <decisions proposed>
- <open questions>

## Evidence
- <file:line> — <what it shows>
- <command/output> — <what it proves>

## Confidence
<high/medium/low> — <why>

## Next stage
<role> — <the one thing to do next>
```

Rules:

- The next stage reads the artefact, not the previous agent's transcript.
- Evidence must include a path and, where possible, a line or a command output.
- A summary without evidence is a lead, not a fact.
- The docs editor merges only what the critic has seen or the owner has approved.

## Parallelism

Allowed:

- research scouts on independent questions (different repos, different docs);
- security and quality review of a frozen design;
- implementer and a read-only verifier on disjoint areas (the verifier never edits).

Not allowed:

- two writers on the same document;
- implementer and docs editor on the same spec;
- critic before the design is frozen;
- any stage that contradicts an accepted ADR without escalating.

## Sync protocol

1. **Freeze the input.** The stage owner states which document/version is being reviewed. Do not
   edit it while reviewers read it.
2. **One writer.** The docs editor is the only writer in a documentation run. The implementer is
   the only writer in an implementation run.
3. **Record the handoff.** Append the handoff block to the relevant doc or the PR description.
4. **Resolve or escalate.** If stages disagree, the docs editor records both positions and the
   primary asks the owner. Do not silently pick the more convenient one.
5. **Update status.** After a gate, update `docs/delivery/status.md` with what landed, what was
   verified, blockers, and the next action.
6. **Close the loop.** The verifier checks the acceptance criteria and the docs; the primary
   reports the result.

## Escalation triggers

Stop and ask the owner when:

- the capability list is ambiguous or contradicts a principle;
- a stage proposes a stack or architecture choice that changes the ADRs;
- a security finding is S1 and cannot be mitigated within scope;
- two accepted documents contradict each other;
- the work needs a new external dependency or a licence change;
- the scope would expand beyond the approved wedge.

## Using the chain in this harness

Project agent definitions live in `.pi/agents/`. They are loaded by a subagent-capable extension
(for example, the `subagent` example extension) when the project scope is enabled. If the
extension is not installed, the primary agent can run the stages itself in the same order, writing
each artefact to `docs/` before moving on.

The canonical workflow prompt is `.pi/prompts/docs-chain.md`. It describes the documentation-phase
chain and the handoff format.

## Chain anti-patterns

- **Echo chamber:** the same agent writes, reviews, and approves. Forbidden.
- **Evidence-free confidence:** "I reviewed it and it looks good." Not a handoff.
- **Parallel writers:** two agents edit the same section; merge conflicts and contradictions.
- **Silent scope growth:** a stage adds a capability nobody approved.
- **Summary-as-proof:** treating a subagent's summary as verified fact.
- **Decision by inertia:** carrying a PoC choice without asking whether it serves the product.

## The chain's output

The chain is successful when the owner can read the knowledge base and answer:

1. What are we building and for whom?
2. What did the PoC prove and what did it get wrong?
3. What is the architecture, and why these boundaries?
4. What are the security and quality risks, and how are they controlled?
5. What is the next milestone, and what must be true to pass it?

If any answer is missing, the chain is not done.
