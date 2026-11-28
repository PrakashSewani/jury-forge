# ADR-0010: Agent runtime harness

- Status: **accepted** (Phase 1a, 2026-11-16; amended by ADR-0026): **no harness in v1.** A thin turn runner
  (persisted steps) with a provider gateway on the `ai` SDK replaces the LangGraph spike. The
  options analysis below is kept for history; the binding decision is
  [`../architecture/technical-approach.md`](../architecture/technical-approach.md) §3.4.
  Revisit LangGraph only if v1.1 branch review needs multi-step tool exploration.
- Date: 2026-11-15
- Owners: architecture + AI pipeline
- Supersedes: —
- Revisit trigger: the spike fails the session/reply/resolution criteria, or a harness becomes
  unmaintained or licence-incompatible.

## Context

The product moves from a one-shot review to a durable per-PR session with user replies, tool use,
multi-agent routing, and guarded resolution. We need a harness for state, loops, tools, and
human-in-the-loop. The session must survive restarts and days of waiting. We want an existing
harness where it genuinely fits, but we will not trade MIT/self-hostability for convenience.

## Options

| Option | Licence | Fit | Cost / risk |
| ------ | ------- | --- | ----------- |
| **LangGraph.js + Postgres checkpointer** | MIT | Thread state, checkpoints, interrupts, resume, subgraphs | LangChain dependency; JS maturity vs Python; learn graph model |
| **OpenAI Agents SDK** | MIT | Agents, handoffs, sessions, tools, guardrails, tracing | Not durable by itself; provider breadth narrower; we build session store/resume |
| **Vercel AI SDK + custom turn runner** | Apache-2.0 | Model/tool abstraction; full control | We own loop, state, retries, interrupts; more code |
| **Mastra** | Apache-2.0 core, `ee/` commercial portions | Integrated TS agents/workflows/memory/evals | Open-core/`ee` risk; framework lock-in; licence review |
| **Temporal** | MIT SDK; server | Excellent durable execution/signals | Heavy operations (server, DB, visibility); overkill for v1 |
| **Restate** | BSL 1.1 | Durable execution, single binary | Not open source; unacceptable for an MIT product |
| **Inngest self-hosted** | SSPL | Workflow steps | Not OSI; unacceptable for an MIT product |
| **Cloudflare Agents** | Platform | Runtime | Rejected by ADR-0001/0002 |

## Decision

1. **Spike LangGraph.js + Postgres checkpointer as the primary harness.** Use `thread_id` = PR
   session, `interrupt` to wait for a human reply, `Command(resume=event)` to continue, and
   subgraphs per agent with a supervisor/chair. The spike must prove durable resume, human input,
   multi-agent routing, tool limits, provider integration, and testability.
2. **Fallback:** a thin turn runner on **Vercel AI SDK** + our Postgres session tables. The session
   of record is always our schema; a harness replacement must not lose the conversation.
3. **Do not adopt** Mastra, Restate, Inngest, or Cloudflare Agents for v1. Revisit Mastra only after
   a licence/`ee` review; Temporal only if durability requirements exceed our queue.
4. The **session of record** is product-owned Postgres. The harness may checkpoint in a separate
   schema, but every turn, message, finding, tool call, and resolution is written to our tables.

## Consequences

**Easier:** existing graph/checkpoint/interrupt primitives; multi-agent subgraphs; testable state
transitions; a documented path to replace the harness.

**Harder:** a dependency on LangChain; two state stores if the checkpointer is separate; JS feature
gaps; a spike to prove it before committing.

**Invariants:** a session can be replayed from product tables; no business state lives only in the
harness; the harness cannot resolve a thread without the server-side guard.

## Security and operations

- The harness runs inside the worker; no inbound network.
- Tool calls are mediated by our tool registry; the harness cannot call arbitrary tools.
- Provider keys are never passed into graph state; the provider gateway resolves them by id.
- Checkpoint tables follow retention and tenant scoping.
- A harness outage pauses turns; sessions remain readable and resumable.

## Evidence

- npm: `@langchain/langgraph` 1.7.4 (MIT), `@langchain/langgraph-checkpoint-postgres` 1.1.3 (MIT),
  `@openai/agents` 0.22.0 (MIT), `ai` 7.0.173 (Apache-2.0), `@temporalio/workflow` 1.25.0 (MIT).
- Licences: Mastra repository license includes `ee/` portions; Restate is BSL 1.1; Inngest is SSPL.
- Product requirements: [`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).

## Follow-ups

- 3-day spike: a PR session with two agents, a user reply, a tool call, a `suggest` proposal, and a guarded `auto` resolve test.
- Compare LangGraph.js and the thin runner on: durable resume, testability, provider integration,
  bundle/ops, and developer experience.
- Record the chosen harness in a new ADR or update this one to accepted.
