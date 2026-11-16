# Competitive landscape (2026-11-16)

Research pass for "make Jury Forge the best in its category". Sources were read live on 2026-11-16;
re-check before quoting externally. Claims are what each vendor documents, not what we measured.

## Sources

- GitHub Copilot code review — docs.github.com/en/copilot/how-tos/use-copilot-agents/use-code-review
- Greptile — greptile.com/docs (introduction)
- CodeRabbit — docs.coderabbit.ai (overview)
- PR-Agent (MIT, community-owned, ex-Qodo) — github.com/The-PR-Agent/pr-agent (v0.50.0)
- PR-Agent compression strategy — docs.pr-agent.ai/core-abilities/compression_strategy/
- Copilot code review concepts (effort levels, billing, memory, Code Quality) — docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/code-review
- Greptile self-hosting — greptile.com/docs/self-hosting/deployment-options
- CodeRabbit architecture — docs.coderabbit.ai/overview/architecture
- Kodus (open core, self-host) — github.com/kodustech/kodus-ai (2.2.14)

Additional facts from the second pass:

- **Copilot:** effort resolution order (request → previous on PR → requester → repo → org →
  Balanced); cost ranges Lite $0.05–1, Balanced $0.25–5, Max $1.50–25 per review; "model switching is
  not supported"; approvals dismissed on new commits; Copilot Memory stores repo facts; Code
  Quality adds CodeQL, coverage, and ruleset merge gating; agentic context runs on Actions runners.
- **CodeRabbit:** sandboxed clone, 50+ static analyzers/linters/SAST, parallel Review,
  Verification, Chat, Pre-Merge Checks and Finishing Touches agents.
- **Greptile self-host:** Compose for ≤100 devs (4c/16 GB for 5–10 devs), Helm for 100+; needs
  smart, fast, and embedding models; Postgres + pgvector + Redis; **requires a sales licence**.
- **Kodus:** self-host and cloud, 5 forges incl. Forgejo, BYOK at zero markup, Kody Rules (10 on the
  free tier), memory, PR risk/routing/approval policies, CLI; **EE licence for parts**, **anonymous
  daily telemetry on by default**; 2 CPU / 8 GB / 60 GB minimum; Mongo + Postgres.

The granular comparison and recommendations are in
[`capability-deep-dive-2026-11-16.md`](capability-deep-dive-2026-11-16.md).

## What each one documents

| | Copilot review | Greptile | CodeRabbit | PR-Agent (OSS) | **Jury Forge (target)** |
| --- | --- | --- | --- | --- | --- |
| Hosting | GitHub-hosted | SaaS; self-host option (enterprise) | SaaS | Self-host, Action, CLI | **Self-host only, MIT** |
| Models | GitHub's | Vendor's | Vendor's | Any (LiteLLM) | **BYOK, catalog-discovered** |
| Replies to user comments | **No** ("Copilot won't reply") | Learns from replies | Yes (chat) | `/ask` command | **Durable session; replies, appeals** |
| Repeats dismissed findings | **Yes, documented** | Learns over 2–3 weeks | — | "preserve findings across reruns" | **Never (fingerprint suppression, ADR-0024)** |
| Codebase context | Agentic env + MCP | Full repo graph | Multi-repo | Diff + compression | Diff (v1); graph (v1.x) |
| Effort / cost levels | Lite / Balanced / Max (~$0.25 / $1.50 / $10) | — | — | One LLM call per command | **Add: jury size presets (S7)** |
| Fix handoff | "Fix with Copilot" | "Fix with your agent" (Claude Code, Cursor, …) | IDE/CLI | `/improve` | **Add: agent-agnostic fix handoff (S8)** |
| Prioritisation | Severity labels | — | Cross-repo risk triage queue | — | **Add: risk score per PR (S9)** |
| Feedback | 👍/👎 (sent to GitHub) | 👍/👎 + replies | — | — | **Add: native reactions, stored locally (S10)** |
| Instruction files | `copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `REVIEW.md`, path-specific; **read from head branch** | — | config | `.pr_agent.toml` | **Same set, read from base SHA (S11)** |
| Approvals | Can approve (opt-in) | — | — | — | Never approves in v1 |
| Audit | Session logs | SOC2, audit logs | — | — | **Signed receipt chain (S5)** |

## What we take from this

1. **The gaps nobody fills well:** a review that holds a conversation, never repeats a dismissed
   finding, shows independent reviewers disagreeing, and gives an auditor a verifiable record, all
   on the operator's own hardware and keys. That is Jury Forge's position; S1–S5 and ADR-0024
   deliver it.
2. **Table stakes we were missing:** cost/effort presets, a fix handoff to the user's coding agent,
   PR risk prioritisation, native-reaction feedback, and broad instruction-file compatibility.
   These become S7–S11 in [`../product/specs/standout-features.md`](../product/specs/standout-features.md).
3. **A security edge we must keep:** Copilot reads review instructions from the **head** branch, so a
   PR can rewrite its own review rules. Jury Forge reads them from the **base** SHA (ADR-0023). A PR
   that changes instruction files gets a visible note, and the change applies only after merge.
4. **Where we will lose on purpose (v1):** full-repo graph context (Greptile), multi-forge
   (PR-Agent), IDE/Slack surfaces (CodeRabbit). These stay v1.x or later.
5. **Open-source neighbour:** PR-Agent is MIT, mature (16k stars, 470+ contributors), and
   self-hostable, but it is a set of mostly single-call commands. Jury Forge must not compete on command breadth. It competes
   on the jury, the session, and the receipt. Its compression strategy for large PRs is
   worth studying for B-04 (large-PR handling).
