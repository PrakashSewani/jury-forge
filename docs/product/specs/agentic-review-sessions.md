# Spec: Agentic PR review sessions

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + architecture
- Principles: 2 (trustworthy review), 3 (prompt is not a boundary), 5 (boring operations), 7 (extensible), 8 (fail visibly), 11 (wedge)
- Related: ADR-0010 (harness), ADR-0011 (provider discovery), ADR-0012 (sessions/resolution), ADR-0013 (manual trigger/routing), ADR-0014 (repo graph)

> **Direction (ADR-0023):** v1 is the trust loop: a three-reviewer default jury, diff + repository
> instruction files, Check Run progress, a verdict with dissent, a receipt, and a durable session.
> The catalog, capability labels, branch review, and graph described below are v1.x.

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
6. **Manual-first triggering.** Any PR in an installed account/org can be reviewed on request.
   Automatic review is opt-in config-as-code; manual review must always be available.
7. **No repo enable/disable toggles for agentic review.** The app sits above all installed repos.
8. **Dynamic agent availability.** Agents are not available on every repo; a router selects the jury
   from explicit requests, repo policy, paths, languages, labels, and agent scopes.
9. **Keys are stored encrypted** and are write-only to the API.
10. **Resolution is human-confirmed by default** (`suggest`); `auto` (bot resolves after a guard)
    and `off` are opt-in. A human can always resolve natively in GitHub or the UI.
11. **PR review is diff-only by default.** Branch review is explicit: it compares the branch to the
    default branch and uses a repo knowledge graph updated incrementally on every branch/T2 review run, so
    context is not rebuilt from scratch.
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

- **PR-level context** is shared: the diff (T0) or branch delta + repo graph (T2), instructions,
  pack grants, prior findings.
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
- **resolved:** a human resolved it (`suggest`/`off`) or the bot resolved it under `auto`; a new reply reopens it.
- **archived:** PR merged/closed or retention expiry; no further turns.

There is **no per-session process to suspend**. `waiting_for_user` and long idle periods consume no
compute; a reply is the wake-up. Only storage/retention/UI noise justify aging a session. See
[`session-capacity-and-visibility.md`](session-capacity-and-visibility.md).

### 2.1 Review contract

A short, visible contract sets expectations in the PR and the session UI:

- **What Jury Forge does:** reviews the change with the bound jury, grounds findings in the diff,
  answers replies, and proposes resolutions in `suggest`.
- **What it does not do:** merge, push fixes, resolve threads in `suggest`/`off`, or review files
  outside the selected mode.
- **How to ask:** a mode label, the Check Run action, the UI picker, or an `@jury-forge` mention.
- **How to answer:** reply in the thread; a reply reopens a resolved thread.
- **If nobody replies:** the session waits in `waiting_for_user`; after the configured idle window
  it is summarized and surfaced to maintainers, then archived per retention (see
  [`session-capacity-and-visibility.md`](session-capacity-and-visibility.md)).

The contract is shown on the Check Run details page and in the session detail; it is not repeated as
a noisy PR comment.

## 3. Triggers

### Manual (always available)

Any PR in an account/org where the app is installed can be reviewed on request. The app is
installation-level; it is not gated by a per-repo enable toggle.

Surfaces, in order of preference:

1. **GitHub Check Run action (primary).** On PR open/synchronize, the app creates a neutral
   `Jury Forge` check run with the action button `PR review` (and `Branch review` in v1.x; Checks API
   `actions`; max 3, label ≤ 20 chars). Clicking a button sends `check_run.requested_action` to the app
   and starts the turn. No comment is posted just to trigger. Requires `checks: write`.
2. **PR label (modes):** `jury:pr-review` (strict T0: PR diff/hunks + metadata + thread context;
   no repository file reads, no graph) and `jury:branch-review` (v1.x: complete branch review against the
   repo context graph, T2). One click in the sidebar; the app listens to `pull_request.labeled`.
   These two labels are **modes**.
   **Capability labels** `jury:cap:<id>` request a capability group **within the reviewers already
   bound/approved for the repo**. They never enable an unbound reviewer, bypass required reviewers,
   budgets, or provider policy. A capability label alone defaults to PR review; add
   `jury:branch-review` for the branch mode. If no bound reviewer matches, post a capability
   fallback. All active capability labels are synced to every installed repo. Specific reviewers are
   selected via the UI “Ask Jury Forge” picker, not a command. **Tier note:** Phase 1 uses built-in
   capability IDs; the registry and label sync ship in v1 (ADR-0018).
3. **Web UI:** “Ask Jury Forge” on a repository/PR view; select mode and specific bound
   reviewers/capabilities; it enqueues the same turn. The UI must not require the repo to be
   “enabled”.
4. **Reviewer picker:** tested 2026-11-15; GitHub accepted a request for `jury-forge[bot]` but did
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
  security: { paths: ["src/**", "auth/**"], selection: required }
  testing:  { paths: ["**/*.test.*", "src/**"], selection: default }
  docs:     { paths: ["docs/**", "**/*.md"], selection: capability, capabilities: [docs] }
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
| `issue_comment` created on a PR (human) | If it mentions Jury Forge, enqueue a PR-level turn; no slash commands. |
| `pull_request_review` submitted (human review) | Add to session context; the agent may respond if it was mentioned or if policy says so. |
| `pull_request` synchronize | Advance generation; mark affected findings `needs_recheck`; T0 PR review does not re-index; a branch/T2 or background graph job may refresh the index; do not auto-post unless policy says so. |
| `pull_request` closed/merged | Archive the session. |
| `push` to default branch | Update the repo graph, not the PR session. |

## 4. The agent turn

A turn is a bounded unit of work. It is durable, retryable, and idempotent.

```
ingest event
  → load session + thread + generation
  → plan intent (review, answer, verify, resolve, clarify)
  → select agents (explicit > repo config > scope/language/path/labels > default)
  → retrieve context (diff for T0; branch delta + graph for T2; instructions, packs, prior findings)
  → run agents (parallel or sequential, bounded)
  → ground + verify findings
  → chair/merge (dedup, disagreement, severity, confidence)
  → write response (thread reply or PR comment)
  → update findings/thread state
  → in auto, resolve only if the guard passes; in suggest/off, wait for a human
```

### Tools available to agents

**Tier rule:** PR review (T0) may use only `get_diff`, `get_thread`, `get_prior_findings`,
`get_knowledge` (granted packs), `post_reply`, `ask_user`, `update_finding`. Repository read/graph/test tools are **branch review
(T2)** only. `resolve_thread` is used only in `auto` resolution mode.

| Tool | Purpose | Guard |
| ---- | ------- | ----- |
| `get_diff` | The PR diff/hunks at the generation SHA | Read-only; T0 |
| `read_file(path, range)` | A file slice at the SHA | T2 only; bounded range, repo-relative |
| `search_symbols` / `find_references` | Query the repo graph | T2 only; read-only, result cap |
| `find_tests` | Tests related to changed code | T2 only; read-only |
| `get_thread` | The conversation and finding history | Session-scoped |
| `get_prior_findings` | Open/resolved findings for this repo/PR | Session/repo-scoped |
| `get_knowledge` | Granted packs, ranked by relevance | T0 packs only; repo-doc/live/graph sources are T2; budgeted |
| `post_reply` | Reply in the current thread or PR | One reply per turn unless policy allows more |
| `ask_user` | Ask a focused question and wait | Ends the turn in `waiting_for_user` |
| `resolve_thread` | Resolve the thread | Only in `auto`; guard: evidence, user response, agent-owned thread |
| `reopen_thread` | Reopen on new evidence | Guard: human reply or new failure |
| `update_finding` | Mark addressed/verified/dismissed/reopened | Guard: evidence + actor |
| `check_ci` | Read check runs/status for the SHA | T2 only |
| `tests.run` | Run selected tests in a sandbox | Later (post-v1.x); opt-in repo policy; isolated, no secrets, network off, resource caps |
| `build.run` | Build in a sandbox | Later (post-v1.x); opt-in repo policy; same isolation |

No arbitrary shell, no code execution, no network fetch by default. Static-analysis tools are T2
optional; sandboxed test/build tools can be added later behind an explicit capability.

### Loop limits

> **Binding rules: [ADR-0024](../../decisions/ADR-0024-conversation-safety-and-finding-identity.md).**
> Only write-access users trigger reviews; the PR author may reply on its own Jury Forge threads;
> others and all bots never start a turn; fork PRs are skipped by default (MVP). Self-detection is by
> App ID. Each thread gets at most 6 agent replies and each session at most 40 turns per generation,
> then the agent hands off to a human. Each user gets at most 10 reply turns per hour. A turn answers
> the exact comment version it read.

- Max turns per session: 40 per generation (ADR-0024), then a human hand-off message.
- Max tokens, tool calls, and wall-clock per turn; currency cap only when pricing is known.
- A turn that hits a limit posts a short status, stops, and waits — it never silently truncates.
- A user reply interrupts/queues; it does not run a second turn in parallel with the current one.
- **Reply intent** is classified first by the `fast` model (dispute / question / fixed / won't-fix /
  other). Only dispute (an **appeal**, standout S1) and question start a full juror turn.
- **One voice per thread:** the juror that raised the finding answers; the chair speaks only at PR level.

### After a push (ADR-0024 §5)

- Open findings are re-anchored by `anchor_hash` (exact, then fuzzy within the file).
- If the anchored code changed, the finding becomes `fix_candidate` and gets a cheap recheck; the
  result is posted as **"Verified fixed in `<sha>`"** or "Still present" (S2).
- If the anchor is lost, the finding becomes `outdated` and is not reposted.
- When an automatic or manual trigger is active, **incremental review** covers only the new commits'
  diff, and open findings are never repeated.

## 5. Resolution protocol

Resolution has three modes: **`suggest` (default)**, **`auto`**, and **`off`**. There are no slash
commands; a human resolves natively in GitHub or via the Jury Forge UI.

### `suggest` (default)

1. The agent decides the finding looks addressed and posts a **proposed resolution summary** in the
   thread (“this looks resolved because …”).
2. The agent does **not** call `resolve_thread`.
3. A human resolves the thread with GitHub’s **Resolve conversation** or the UI **Resolve** action.
4. A normal “thanks/fixed” reply does not resolve; the agent may ask for the explicit action.

### `auto` (opt-in)

The agent may call `resolve_thread` only when all guard checks pass (ADR-0024 §6 is binding: the
anchored code changed after the finding, the recheck says `fixed` above the threshold, no human
dispute since, and severity below `critical`):

1. The thread was created by Jury Forge.
2. There is a human response after the last agent finding/question.
3. Evidence that the finding is addressed (fixed code, accepted rationale, or “won't fix” with a
   reason).
4. A verifier/guard step agrees; confidence and evidence are recorded.
5. A short resolution summary is posted.
6. The resolution is audited with actor, evidence, model, and timestamp.
7. The thread is resolved via the forge adapter.

### `off`

The agent never resolves; humans resolve natively or in the UI.

A new human reply after resolution reopens the thread and starts a new turn. The UI shows who
resolved a thread and why; it never presents a bot resolution as a human one. The wrong-resolution
rate is a benchmark/scorecard metric.

### Human override

The agent validates; **SMEs and higher-level roles can overwrite**.

| Actor | Can override |
| ----- | ------------ |
| Owner / Admin | Resolve, reopen, or dismiss any thread in the org, with a reason |
| SME | Resolve/reopen/dismiss in their domain and assigned repos, with a reason |
| Maintainer | Reopen a thread to challenge it; cannot mark it resolved on the bot’s behalf |
| Author / member | Reply only; GitHub UI resolution is recorded as a human action |
| Auditor | Read-only |

- An override requires a reason and is audited with actor, role, thread, and evidence.
- The agent sees the override in its session context and does not auto-re-resolve without new
  evidence or a new human request.
- A human resolution in GitHub UI is recorded as a human override; the bot does not fight it.
- Resolution state is never silently changed by a model; only the guard or an authorized human.

## 6. Multi-agent routing

An **agent definition** is a versioned configuration with:

- name, role, instructions, rules, output schema;
- provider + model binding (from the model catalog, never free text);
- tools/capabilities;
- **availability scope:** org, repositories, paths, languages, labels, required files, team;
- selection mode: `required` / `default` / `capability`; trigger policy manual/automatic/both;
- budget and priority;
- version, prompt hash, evaluation status.

The **router** builds the jury for a turn:

1. Explicit capability labels (`jury:cap:*`) or UI selection request a capability group.
2. Required bindings always run.
3. Scope match: changed paths, languages, labels, repo.
4. Availability: reviewer enabled, provider/model healthy, budget available.
5. If a capability is requested: required + capability bindings that match. If not: required +
   default bindings that match. If nothing can run, post the fallback notice — never a clean review.
6. Record **why** each reviewer ran or was skipped in the session timeline.

Agents that are not available on a repo are never silently used. The UI shows availability and the
reason.

**Catalog and repo bindings:** a reviewer is not available on a repo without an enabled binding.
Bindings are `required` (always), `default` (plain review), or `capability` (only when requested)
with path/language/label scope. A required reviewer that cannot run blocks the review with a
configuration fallback. The full model is in
[`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md) and ADR-0016.

## 7. PR review and branch review

Two review modes, both session turns:

### `jury:pr-review` — PR review (default)

- Sends **only the PR diff/hunks** plus PR metadata; no repository graph, no full files.
- Fast and cheap; it is the "review these diffs" mode.
- It does not answer "who calls this?" — that is branch review’s job.
- **Default rule:** diff-only is the default for any repository with a bound/default jury. There is
  no per-repo enable toggle; the binding is the enablement (ADR-0013/ADR-0016). Branch review is
  explicit and never the default on a plain `jury:pr-review` or on PR open.
- **Mode recommendation (proposed):** the Check Run details/UI may recommend branch review when the
  diff touches auth/payments/infra, exceeds a size threshold, or changes a public contract. The
  recommendation is advisory; it never upgrades the mode automatically.

### `jury:branch-review` — complete branch review (v1.x)

- Compares the PR branch to the **repository’s default branch**, not just the latest PR diff.
- Reviews the complete branch delta (all changed files/functions vs default) against the repository
  context graph, including cross-file and functional/behavioral impact.
- It does **not** audit untouched files; they are context.
- **Capability agents decide how to verify functionality.** A reviewer can be configured with tools
  such as graph queries, test inspection, and static analysis; a sandboxed test/build run is later.
  The agent chooses the verification path within its instructions, budget, and repo policy.
- Default: static behavior/contract/test analysis. `tests.run` / `build.run` are later opt-in sandbox
  capabilities; they are not implied by branch review.
- Explicit only: the `jury:branch-review` label, the Branch review Check Run action, or
  `mode: branch` in repo config. Shows an estimate; cancellable.
- If the PR base is not the default branch, branch review still uses the default branch unless the
  repo policy overrides it.

### Repo knowledge graph

The graph is the product's memory of the repository. See
[`repo-knowledge-graph`](repo-knowledge-graph.md) and
[`../../architecture/agentic-review.md#7-repo-knowledge-graph`](../../architecture/agentic-review.md#7-repo-knowledge-graph).

- Updated on every branch/T2 review run at the generation SHA.
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
- **Triggers:** "Ask Jury Forge" from a repo/PR, plus the mode/capability labels and Check Run actions; no repo enable toggle.
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

- [ ] A human can trigger a review on any PR in an installed repo with the `jury:pr-review` label or Check Run action; no repo toggle.
- [ ] A session survives a process restart and a multi-day wait; a reply resumes with prior context.
- [ ] The agent replies in the correct GitHub thread, not a duplicate top-level comment.
- [ ] `suggest` is the default: the agent proposes, a human resolves natively/UI; no `/jury` command.
- [ ] `auto` resolves only through the guard and is opt-in; `off` never resolves.
- [ ] SME/admin override works with a reason and audit; a new reply reopens.
- [ ] The agent router selects agents by explicit request, repo config, path/language/label, and
      availability; the timeline explains why.
- [ ] Adding a provider key fetches the model list; the UI has no free-text model field; an invalid
      key is rejected.
- [ ] Keys are encrypted and never returned; a key is bound to its provider origin.
- [ ] PR review is diff-only by default; the `jury:branch-review` label or Branch review action compares the branch to the default branch, builds/uses the repo graph, and reports an estimate.
- [ ] A branch/T2 re-run reuses the graph and only re-indexes changed files; T0 PR review does not touch the graph.
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

- the `jury:pr-review` label or Check Run action, `jury:cap:security` + `jury:cap:tests` labels, the `jury:branch-review` label or Branch review action, the UI session status, pause in the UI,
  resume in the UI, GitHub Resolve conversation / UI, reopen in the UI, the UI session explanation.
- Mode labels `jury:pr-review`/`jury:branch-review`, `jury:cap:<id>` capability labels, and UI
  pause/resume actions. There is no `jury:full` or `jury:pause` label; pause/resume is a UI action.
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
- In `suggest`, the human confirms by using GitHub Resolve or the UI; no comment command.
- Reopen on a new reply or a new push that touches the finding.
- In `auto`, never resolve a thread the bot did not start, and never on the first agent message.
- Show who resolved and why in the UI and the audit.

**Agent routing**

- “Why this jury?” explanation in the session: selected, skipped, and why.
- Agent availability preview in the studio: which repos/paths/labels match.
- Manual override by name in the UI; selection modes required/default/capability; org defaults; route by label.
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
| AG-01 | Which harness: LangGraph.js, OpenAI Agents SDK, Vercel AI SDK + custom, or a spike? | Spike LangGraph.js vs custom; ADR-0010. |
| AG-02 | Trigger surface: labels, Check Run, UI, or app review request? | Labels + Check Run actions + UI; no slash commands. Reviewer picker unsupported for arbitrary apps (tested). |
| AG-03 | Must the user explicitly confirm before resolution, or can the agent judge satisfaction? | `suggest` default: agent proposes, human resolves natively/UI; `auto`/`off` opt-in. |
| AG-04 | Automatic review policy: config-as-code only, or org UI? | Config-as-code; org defaults later. |
| AG-05 | Graph languages for v1? | TypeScript/JavaScript first; Python/Go next. |
| AG-06 | Graph store: Postgres adjacency vs a graph database? | Postgres first; extract later. |
| AG-07 | Session retention? | 90 days after merge/close; configurable. |
| AG-08 | Who can trigger/resolve besides the bot? | Repo write access; org roles; audited. |
