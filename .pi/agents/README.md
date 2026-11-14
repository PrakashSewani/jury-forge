# Project agents

These are the Jury Forge specialist roles for the documentation and delivery chain. They are
Markdown files with YAML frontmatter (`name`, `description`, `tools`). They follow the subagent
extension convention used by Pi.

## Roles

| Agent | Purpose | Writes? |
| ----- | ------- | :-----: |
| `research-scout` | Evidence gathering with citations | no |
| `product-strategist` | Product spec and scope drafts | no |
| `architect` | Target design and ADR drafts | no |
| `security-red-team` | Threat model and security findings | no |
| `review-quality-designer` | AI pipeline, grounding, evaluation | no |
| `critic` | Adversarial review of drafts | no |
| `docs-editor` | Consolidates docs, links, status | docs only |
| `implementer` | Implements an approved spec | code |
| `verifier` | Independently verifies a change | no |

## Enabling project agents

Project agents are repo-controlled prompts. Only load them from a repository you trust.

- Pi discovers project agents in `.pi/agents/` (the config directory's `agents` folder).
- With the `subagent` extension, pass `agentScope: "both"` (or `"project"`) when invoking the
  tool so project agents are included; the default is user-level agents only.
- Interactive runs may ask for confirmation before running project-local agents unless the session
  is trusted and the agents come from the current project.
- If the subagent extension is not installed, run the chain manually in the same order, writing
  each artefact to `docs/` before moving on. See `.agents/skills/project-chain/SKILL.md`.

## Chain example

```text
Use the chain mode with agentScope "both":
1. research-scout — study the PoC's publish step and list every failure mode with file:line.
2. architect — propose an idempotent publish design; include ADR options.
3. security-red-team — attack the proposed design for duplicate/stale publish.
4. critic — review all three outputs for contradictions and missing evidence.
5. docs-editor — consolidate into docs/ and update docs/delivery/status.md.
```

## Rules

- One writer at a time.
- Read-only roles do not edit.
- Every handoff uses the format in `docs/delivery/agent-chain.md`.
- Stop at the human gate before implementation.
- Do not treat an agent summary as proof; check the cited evidence.
