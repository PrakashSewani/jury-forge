# Spec: Agentic PR review sessions

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + architecture
- Principles: 2 (trustworthy review), 3 (prompt is not a boundary), 5 (boring operations), 7 (extensible), 8 (fail visibly), 11 (wedge)
- Related: ADR-0010 (harness), ADR-0011 (provider discovery), ADR-0012 (sessions/resolution), ADR-0013 (manual trigger/routing), ADR-0014 (repo graph)

## Owner directives captured

1. **Agentic reviewer, not a single LLM call.** A review is a loop with tools, context, verification,
   and conversation — not one prompt that returns JSON.
2. **Every pull request gets its own session.** Jury Forge comments, the user replies, and Jury Forge
   responds again with the context alive. Sessions survive restarts and days of waiting.
3. **Use an existing harness** for context/loop/state management where it fits; do not invent a
   workflow engine unless the harness cannot carry the product.
4. **Self-hostable backend and UI, Dockerized.** No Cloudflare requirement.
5. **Provider management is first-class.** The operator adds a provider key; Jury Forge fetches the
   models available with that key. **No free-text model entry.**
6. **Manual-first triggering.** Any PR in an installed account/org can be reviewed on request. A repo
   allowlist may enable automatic reviews, but manual review must always be available.
7. **No repo enable/disable toggles for agentic review.** The app sits above all installed repos.
8. **Dynamic agent availability.** Agents are not available on every repo; a router selects the jury
   from explicit requests, repo policy, paths, languages, labels, and agent scopes.
9. **Keys are stored encrypted** and are write-only to the API.
10. **Only Jury Forge resolves its conversations**, after a satisfactory user response.
11. **Diff-only by default.** Branch review is explicit and backed by a repo knowledge graph that
    is updated incrementally on every review run, so context is not rebuilt from scratch.
12. **Copyright/licence:** MIT; no open-core or BSL/SSPL dependency in the core.

## Problem

The PoC reviews a PR once and posts a static review. A real reviewer conversation is iterative:

- the author replies with a question or a fix;
- the reviewer reads the new code, answers, and may re-check the finding;
- the author says "fixed" or "won't fix";
- the reviewer verifies and resolves the thread — or keeps it open.

A one-shot review cannot do this. It also cannot afford to reload the whole repository on every turn,
and it cannot decide which specialist agents a given PR needs.

## Users and jobs

- **PR author:** "Ask Jury Forge for a review, reply to its comments, and get a useful answer without
  leaving the PR."
- **Maintainer:** "Choose which agents review this PR, and trust that resolved threads were actually
  addressed."
- **Platform admin:** "Add a provider key, see the models it exposes, and bind agents to models
  without typing model names."
- **Security lead:** "Know which agents can see which repos, what was sent to which model, and who
  resolved a thread."

## Interface and session ownership

- **GitHub is the primary conversation surface.** Most users ask, reply, and resolve in the PR.
- **The website is the control plane and deep view.** Onboarding, session inbox/timeline, agents,
  providers/models, policy, roles, audit, costs, branch review, exports.
- **The harness is internal.** LangGraph.js or the turn runner is not a user interface.
- **The session belongs to the PR**, not to the user who triggered it. It is keyed by
  `(installation, repository, PR)` and is visible to repo readers; the trigger user is recorded for
  audit. Participants include the author, commenters, mentioned humans, and maintainers.
- **A mention of a human is a request for human input**, not an instruction to the bot. The bot can
  provide context and wait; it never impersonates the human.
- Capacity, roles, visibility, and personal/org defaults are in
  [`session-capacity-and-visibility.md`](session-capacity-and-visibility.md).

## 1. Session model

A **PR session** is the durable conversation for one pull request. It is created on the first
manual or automatic review and lives until the PR is closed/merged or the retention window expires.

```
PrSession (installation, repo, pr_number)
 ├── generations: one per head SHA
 ├── threads: one per GitHub review-comment thread
 │    ├── messages: user / agent / tool / system
 │    ├── findings: open / addressed / verified / dismissed / resolved / reopened
 │    └── resolution: evidence, actor, confidence, timestamp
 ├── turns: one per event/action (trigger, reply, push, manual)
 └── agent_runs + tool_calls: trace, tokens, cost, latency
```

- **PR-level context** is shared: the diff, repo graph, instructions, pack grants, prior findings.
- **Thread-level context** is the local conversation and the finding(s) it concerns.
- A session has a **generation** per head SHA. A push does not destroy the session; it advances the
  generation and marks findings that need re-verification.
- **Only one turn runs per session at a time.** Events that arrive during a turn are queued and
  coalesced (for example, three comments posted within 30 seconds become one turn with three inputs).
- A session is **archived** on merge/close; it becomes read-only and is retained per policy.

## 2. Conversation lifecycle

```
created → active → waiting_for_user → active → resolved
                            │                     │
                            └──── user reply ─────┘ (reopen)
merged/closed → archived
```

- **created:** a manual trigger, an automatic policy, or the first comment.
- **active:** the agent is planning, retrieving context, running agents, or writing.
- **waiting_for_user:** the agent asked a question or posted findings and has nothing to add until a
  human replies.
- **resolved:** the agent resolved the thread after a satisfactory response. A new reply reopens it.
- **archived:** PR merged/closed or retention expiry; no further turns.

There is **no per-session process to suspend**. `waiting_for_user` and long idle periods consume no
compute; a reply is the wake-up. Only storage/retention/UI noise justify aging a session. See
[`session-capacity-and-visibility.md`](session-capacity-and-visibility.md).

## 3. Triggers

### Manual (always available)

Any PR in an account/org where the app is installed can be reviewed on request. The app is
installation-level; it is not gated by a per-repo enable toggle.

Surfaces, in order of preference:

1. **GitHub Check Run action (primary).** On PR open/synchronize, the app creates a neutral
   `Jury Forge` check run with action buttons `PR review` and `Branch review` (Checks API `actions`;
   max 3, label ≤ 20 chars). Clicking a button sends `check_run.requested_action` to the app and
   starts the turn. No comment is posted just to trigger. Requires `checks: write`.
2. **PR label (modes):** `jury:pr-review` (PR diff + targeted context) and `jury:branch-review`
   (complete branch review against the repo context graph). One click in the sidebar; the app
   listens to `pull_request.labeled` and can create the labels on install. No comment required.
   Labels are **modes, not reviewer selectors**; the repo bindings decide which reviewers run.
   Specific reviewers are requested via slash command/UI, not per-domain labels.
3. **Slash command (fallback):** `/jury pr-review`, `/jury pr-review security,testing`, `/jury branch-review`,
   `/jury status`, `/jury pause`, `/jury resolve`, `/jury reopen`.
4. **Web UI:** “Ask Jury Forge” on a repository/PR view; it enqueues the same turn. The UI must not
   require the repo to be “enabled”.
5. **Reviewer picker:** tested 2026-11-15; GitHub accepted a request for `jury-forge[bot]` but did
   not add the app as a reviewer. Arbitrary GitHub Apps cannot be requested there (Copilot is
   special). Revisit if GitHub exposes a first-class AI reviewer request.

### Automatic (optional, policy-driven)

Automatic review is opt-in per repository through **config-as-code**, not a webview toggle. The app
reads `.jury-forge.yml` (or `.github/jury-forge.yml`) at the PR head/base:

```yaml
version: 1
review:
  auto: true                 # default false
  mode: diff                 # pr | branch
  on: [opened, ready_for_review, synchronize]
agents:
  security: { paths: ["src/**", "auth/**"], required: true }
  testing:  { paths: ["**/*.test.*", "src/**"], required: false }
  docs:     { paths: ["docs/**", "**/*.md"], required: false }
```

- If `auto` is false (the default), the app does nothing until a human triggers it.
- A repo allowlist may exist at the org level, but **manual reviews bypass it**. The allowlist only
  controls automatic reviews.
- A manual request always wins over policy: the operator can ask for an agent that is not normally
  available on that repo, subject to permissions and budget.

### Event triggers for an active session

| Event | Behavior |
| ----- | -------- |
| `pull_request_review_comment` created (human reply) | Resume the thread session; enqueue a turn. Ignore the bot's own comments. |
| `issue_comment` created on a PR (human) | If it mentions Jury Forge or uses `/jury`, enqueue a PR-level turn; otherwise observe only. |
| `pull_request_review` submitted (human review) | Add to session context; the agent may respond if it was mentioned or if policy says so. |
| `pull_request` synchronize | Advance generation; re-index changed files; mark affected findings `needs_recheck`; do not auto-post unless policy says so. |
| `pull_request` closed/merged | Archive the session. |
| `push` to default branch | Update the repo graph, not the PR session. |

## 4. The agent turn

A turn is a bounded unit of work. It is durable, retryable, and idempotent.

```
ingest event
  → load session + thread + generation
  → plan intent (review, answer, verify, resolve, clarify)
  → select agents (explicit > repo config > scope/language/path/labels > default)
  → retrieve context (diff, repo graph, instructions, packs, prior findings)
  → run agents (parallel or sequential, bounded)
  → ground + verify findings
  → chair/merge (dedup, disagreement, severity, confidence)
  → write response (thread reply or PR comment)
  → update findings/thread state
  → resolve (only if guard passes) or wait
```

### Tools available to agents

| Tool | Purpose | Guard |
| ---- | ------- | ----- |
| `get_diff` | The PR diff/hunks at the generation SHA | Read-only |
| `read_file(path, range)` | A file slice at the SHA | Bounded range, repo-relative |
| `search_symbols` / `find_references` | Query the repo graph | Read-only, result cap |
| `find_tests` | Tests related to changed code | Read-only |
| `get_thread` | The conversation and finding history | Session-scoped |
| `get_prior_findings` | Open/resolved findings for this repo/PR | Session/repo-scoped |
| `get_knowledge` | Granted packs, ranked by relevance | Budgeted |
| `post_reply` | Reply in the current thread or PR | One reply per turn unless policy allows more |
| `ask_user` | Ask a focused question and wait | Ends the turn in `waiting_for_user` |
| `resolve_thread` | Resolve the thread | Guard: evidence, user response, agent-owned thread |
| `reopen_thread` | Reopen on new evidence | Guard: human reply or new failure |
| `update_finding` | Mark addressed/verified/dismissed/reopened | Guard: evidence + actor |
| `check_ci` | Read check runs/status for the SHA | Read-only |

No arbitrary shell, no code execution, no network fetch by default. Static-analysis tools can be
added later behind a sandbox and an explicit capability.

### Loop limits

- Max turns per session: configurable (for example 20) before requiring an explicit human command.
- Max tool calls and tokens per turn; max wall time; max cost per session.
- A turn that hits a limit posts a short status, stops, and waits — it never silently truncates.
- A user reply interrupts/queues; it does not run a second turn in parallel with the current one.

## 5. Resolution protocol

**Only Jury Forge resolves its own threads programmatically.** Humans can still use GitHub's resolve
button; the session records that as a human action and does not fight it.

Before `resolve_thread`:

1. The thread was created by Jury Forge.
2. There is a human response after the last agent finding/question.
3. The agent has evidence that the finding is addressed (fixed code, accepted rationale, or an
   explicit "won't fix" with a reason).
4. A verifier/guard step agrees; confidence and evidence are recorded.
5. The agent posts a short resolution summary in the thread.
6. The resolution is audited with actor, evidence, model, and timestamp.
7. The thread is resolved via the forge adapter (GitHub GraphQL `resolveReviewThread`; verify the App
   permission in the spike).

If any condition fails, the agent asks a focused question or leaves the thread open. A new human
reply after resolution reopens the thread and starts a new turn. The UI shows who resolved a thread
and why; it never presents a bot resolution as a human one.

## 6. Multi-agent routing

An **agent definition** is a versioned configuration with:

- name, role, instructions, rules, output schema;
- provider + model binding (from the model catalog, never free text);
- tools/capabilities;
- **availability scope:** org, repositories, paths, languages, labels, required files, team;
- trigger policy: manual, automatic, both; required/optional;
- budget and priority;
- version, prompt hash, evaluation status.

The **router** builds the jury for a turn:

1. Explicit request (`/jury pr-review security,testing`) wins.
2. Repo config (`.jury-forge.yml`) adds required/optional agents.
3. Scope match: changed paths, languages, labels, repo, required context.
4. Availability: agent enabled, provider/model healthy, budget available.
5. Default: required reviewers + optional reviewers whose scope matches. If none are bound or none
   match, post the fallback notice — never a clean review.
6. Record **why** each agent ran or was skipped in the session timeline.

Agents that are not available on a repo are never silently used. The UI and the `/jury status`
command show availability and the reason.

**Catalog and repo bindings:** a reviewer is not available on a repo without an enabled binding.
Bindings can be required/optional with path/language/label scope. A required reviewer that cannot
run blocks the review with a configuration fallback. The full model is in
[`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md) and ADR-0016.

## 7. PR review and branch review

Two review modes, both session turns:

### `jury:pr-review` — PR review (default)

- Compares the PR head to the PR **base branch** (usually the default branch) and reviews the PR
  diff plus targeted related code (callers, types, tests) from the graph, within a token budget.
- Fast and incremental; it does not send the whole repository.
- It still uses the graph to answer "who calls this?" and "what tests cover this?".

### `jury:branch-review` — complete branch review

- Compares the PR branch to the **repository’s default branch**, not just the latest PR diff.
- Reviews the complete branch delta (all changed files/functions vs default) against the repository
  context graph, including cross-file and functional/behavioral impact.
- It does **not** audit untouched files; they are context. It does not execute code/tests in v1;
  “compare functionality” means analyze the behavioral change, contracts, tests, and callers. A
  sandboxed test-run mode can be a later capability.
- Explicit only: `/jury branch-review`, `jury:branch-review`, the Check Run action, or
  `mode: branch` in repo config. Shows an estimate; cancellable.
- If the PR base is not the default branch, branch review still uses the default branch unless the
  repo policy overrides it.

### Repo knowledge graph

The graph is the product's memory of the repository. See
[`repo-knowledge-graph`](repo-knowledge-graph.md) and
[`../../architecture/agentic-review.md#7-repo-knowledge-graph`](../../architecture/agentic-review.md#7-repo-knowledge-graph).

- Updated on every review run at the generation SHA.
- Updated on pushes to the default branch.
- Incremental: only changed files and their reverse dependencies are re-parsed; summaries and
  embeddings are content-hash keyed.
- Versioned by commit; a stale graph is marked and rebuilt lazily.
- Stores symbols, imports, references, tests, configs, ownership, docs, prior findings, and
  summaries; never secrets.
- The context planner uses summaries first and expands via tools, so the same files are not re-sent
  on every turn.

## 8. Provider management

See [`provider-model-discovery.md`](provider-model-discovery.md).

- Add a provider with base URL + key; the server validates the key and fetches `/models`.
- The model picker is populated from the provider catalog; there is no free-text model field.
- Known models are enriched with context window, max output, pricing, and capabilities from a
  versioned registry; unknown models are flagged and use conservative defaults.
- Keys are envelope-encrypted, write-only, origin-bound, and rotatable.
- CommandCode is an OpenAI-compatible provider: `GET https://api.commandcode.ai/provider/v1/models`
  (or `/v1/models`) with the key; verify the exact shape in the spike.

## 9. UI

- **Session inbox:** PRs with active sessions, last turn, waiting state, cost, unresolved findings.
- **Session view:** timeline of messages, agent runs, tool calls, findings, diff, resolution, cost.
- **Composer:** reply in a thread, ask a follow-up, request a specific agent, run branch review.
- **Triggers:** "Ask Jury Forge" from a repo/PR; copy the `/jury` command; no repo enable toggle.
- **Agent studio:** name/role/instructions, provider/model picker (catalog only), scope rules,
  availability preview, version/activation, evaluation status.
- **Providers:** add/verify/refresh, model table with capabilities/prices, status, rotation.
- **Policy:** repo config preview and validation; org-level defaults; no toggles that imply
  per-repo enablement for the app.
- **Audit:** who triggered, which agents ran, which model, what was sent, who resolved.

## 10. Security and privacy

- User replies, PR comments, code, and model output are **untrusted data**, never instructions.
- Resolution is an agent action with a guard; a prompt injection cannot force a resolve without the
  evidence/user-response guard.
- Provider keys are encrypted at rest, write-only, bound to an allowed origin, and never reusable
  against an arbitrary URL.
- Secret/PII redaction before prompts leave the perimeter; per-repo data policy; local model option.
- Rate limits and bot-loop protection: ignore self, debounce replies, cap turns, require mention.
- No arbitrary code execution in v1; tools are read-only and bounded.
- Audit every trigger, turn, tool call, model call, reply, and resolution.
- Session retention and deletion; code graph retention; export.

## 11. Acceptance criteria

- [ ] A human can trigger a review on any PR in an installed repo with `/jury pr-review`; no repo toggle.
- [ ] A session survives a process restart and a multi-day wait; a reply resumes with prior context.
- [ ] The agent replies in the correct GitHub thread, not a duplicate top-level comment.
- [ ] Only the bot resolves threads it created, after a satisfactory human response, with evidence.
- [ ] A new reply after resolution reopens the thread.
- [ ] The agent router selects agents by explicit request, repo config, path/language/label, and
      availability; the timeline explains why.
- [ ] Adding a provider key fetches the model list; the UI has no free-text model field; an invalid
      key is rejected.
- [ ] Keys are encrypted and never returned; a key is bound to its provider origin.
- [ ] Diff-only is the default; `/jury branch-review` builds/uses the repo graph and reports an estimate.
- [ ] Re-running a review reuses the graph and only re-indexes changed files.
- [ ] All provider/session/tool/resolution actions are audited.
- [ ] Docker Compose install runs the backend, worker, scheduler, Postgres, and UI.

## 12. Metrics

- Time to first reply; time to resolution; turns per session.
- Finding acceptance, false-resolve rate, reopen rate.
- Context tokens per turn; graph cache hit rate; cost per session.
- Agent selection accuracy (manual override rate).
- Provider/model error rate and fallback rate.

## 13. Additional product ideas

**Session UX**

- A **session inbox**: PRs with active sessions, waiting state, unresolved findings, last turn,
  cost, and a one-click “open PR” link.
- A **timeline** that shows the trigger, agent selection, tool calls, findings, replies, and
  resolution — replayable for audit.
- A **thread view** with the diff, finding, conversation, and resolution state side by side.
- Filters: waiting for user, unresolved, needs recheck, resolved, archived; per repo/agent/author.
- A weekly digest: sessions awaiting a reply, resolved threads, costs, agents that failed.

**Commands and triggers**

- `/jury pr-review`, `/jury pr-review security,testing`, `/jury branch-review`, `/jury status`, `/jury pause`,
  `/jury resume`, `/jury resolve`, `/jury reopen`, `/jury explain`.
- Labels `jury:pr-review`, `jury:full`, `jury:pause` as an alternative to comments.
- A GitHub Check “Jury Forge: ready” with a details link so users discover the command without a
  noisy comment on every PR.
- Optional “suggest” comment on PR open (repo policy, default off).
- Org-level default policy later; config-as-code first.

**Conversation protocol**

- Reply only when mentioned, replied to, or explicitly asked; observe otherwise.
- Debounce/coalesce multiple comments into one turn; never run parallel turns for one session.
- Ignore the bot's own comments and other bots by default; allow an allowlist.
- Summarize a long thread into a compact session memory; keep the raw messages for audit.
- Ask a focused question instead of guessing when the user’s intent is ambiguous.
- A “needs human” escalation when the agent and user disagree after N turns.

**Resolution**

- Satisfaction guard with evidence: fixed code, accepted rationale, “won’t fix” reason, duplicate.
- Optional explicit confirmation (“reply `resolved`”) for ambiguous cases.
- Reopen on a new reply or a new push that touches the finding.
- Never resolve a thread the bot did not start; never resolve on the first agent message.
- Show who resolved and why in the UI and the audit.

**Agent routing**

- “Why this jury?” explanation in the session: selected, skipped, and why.
- Agent availability preview in the studio: which repos/paths/labels match.
- Manual override by name; required/optional agents; org defaults; route by label.
- A default agent when no scope matches; ask the user if none is safe.
- Agent scorecards: acceptance, false positives, resolution quality, cost.

**Providers and models**

- Catalog diff on refresh: new, removed, deprecated models; affected agents.
- Provider health and last-error; automatic fallback only if policy allows.
- Cost estimate before a turn/branch review; per-agent model routing (cheap triage, strong verifier).
- Local model option for sensitive repos; per-repo model allowlist.
- Model capability checks at save time (tools, structured output, context).

**Repository graph**

- Dependency-impact view: “these callers/tests are affected by the change.”
- Test map: changed symbols without tests; flaky/skipped tests.
- Ownership and conventions in context; CODEOWNERS-aware routing.
- Stale index badge; last indexed commit; rebuild action.
- Full-review estimate and cancellation; index cost/latency metrics.
- Cross-repo context later for platform teams.

**Memory**

- Session summary, repo memory (graph), team memory (packs), agent instructions; explicit
  precedence and retention.
- Do not let a user reply rewrite repository knowledge; keep the trust boundary.
- Memory decay and “forget” actions; export/delete.

**Safety and operations**

- Secret/PII redaction in user replies and code; a pre-send manifest.
- Prompt-injection detection/flagging; never let a reply trigger a resolve or a privileged tool.
- Tool budgets and read-only enforcement; no shell/code execution in v1.
- Rate limits per author/session/repo; bot-loop protection; abuse reporting.
- Docker Compose with Postgres, queue, object storage, TLS; backup/restore/upgrade runbooks.
- OTel traces per turn/tool/model; cost dashboards; alerts for stuck sessions and false resolves.

**Evaluation**

- A conversation benchmark: multi-turn scenarios, fixes, won’t-fix, ambiguous replies, injections.
- Metrics: false-resolve, reopen, turn count, time-to-resolution, context reuse, cost.
- Replay a session from the audit log to debug a bad turn.
- Agent/model A/B tests with a guardrail on false resolves.

**Integrations**

- GitHub Checks/SARIF, labels, assignees, issue creation for unresolved critical findings.
- Slack/email/webhook notifications for waiting sessions and outages.
- API tokens for automation and a CLI to trigger/status/export.

## 14. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| Q-021 | Which harness: LangGraph.js, OpenAI Agents SDK, Vercel AI SDK + custom, or a spike? | Spike LangGraph.js vs custom; ADR-0010. |
| Q-022 | Trigger surface: slash command, label, check, or app review request? | Slash command + label first; verify app review request. |
| Q-023 | Must the user explicitly confirm before resolution, or can the agent judge satisfaction? | Agent judges with evidence + guard; explicit confirmation preferred for ambiguity. |
| Q-024 | Automatic review policy: config-as-code only, or org UI? | Config-as-code; org defaults later. |
| Q-025 | Graph languages for v1? | TypeScript/JavaScript first; Python/Go next. |
| Q-026 | Graph store: Postgres adjacency vs a graph database? | Postgres first; extract later. |
| Q-027 | Session retention? | 90 days after merge/close; configurable. |
| Q-028 | Who can trigger/resolve besides the bot? | Repo write access; org roles; audited. |
