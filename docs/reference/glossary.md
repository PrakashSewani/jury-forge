# Glossary

Shared vocabulary. When a term is ambiguous, this page wins.

| Term | Meaning |
| ---- | ------- |
| **ADR** | Architecture Decision Record. One durable choice, with context, options, decision, and consequences. |
| **Anchor hash** | Hash of the whitespace-normalised anchored lines ±2 lines; used to re-locate a finding after a push (ADR-0024). |
| **Appeal** | A PR author's dispute of a finding; the jury re-examines it and the finding is upheld, downgraded, or withdrawn (S1). |
| **Coverage manifest** | The per-review list of files reviewed, expanded, summarised, skipped, or excluded, with reasons (ADR-0025). |
| **Jury charge** | A natural-language pass/fail check defined per repo, shown as a Check Run line item (S12). |
| **Model roles** | `reasoning` (jurors, verifier, appeals) and `fast` (classification, summaries) instance models (ADR-0025). |
| **Preset** | `quick`, `standard`, or `deep` jury size and model choice, with a cost estimate (S7). |
| **Repo memory** | Per-repo suppressions and human-confirmed facts learned from feedback (S4). |
| **T0+** | v1 PR review context: diff hunks expanded to their enclosing function or class in files already in the diff (ADR-0025). No file outside the diff is read. |
| **Verifier** | A non-voting step that marks each grounded finding confirmed, unconfirmed, or wrong before the chair (ADR-0025). |
| **v1.1 / v1.2** | Post-v1 tiers: v1.1 = depth (branch review, graph, analyzers, GHES, CLI); v1.2 = platform (catalog, roles, packs, OIDC, Helm, GitLab). |
| **Artifact / artefact** | A stored byte payload: raw diff, provider response, report, export. Lives in object storage, referenced from Postgres. |
| **Audit event** | An append-only record of a mutation or a security-relevant decision. Not the same as activity. |
| **Budget** | A token or cost limit for a scope and period, with a warn or block action. |
| **Chair** | The deterministic, code-only step that merges, ranks, and applies policy to verified findings; a model writes only its summary text (ADR-0025). |
| **Context manifest** | The record of what the model saw: included files/slices, omitted files, token counts, reasons. |
| **Context planner** | The component that selects what each reviewer sees within a token/cost budget. |
| **Dead letter** | A job that exhausted its retries and is waiting for an operator to replay or discard. |
| **Deduplication** | Merging findings that describe the same issue across reviewers. |
| **Egress policy** | The allowlist and IP/redirect rules that decide which outbound requests are permitted. |
| **Evaluation benchmark** | A labelled set of PRs used to measure precision, recall, grounding, and cost. |
| **Finding** | A single review claim: file, line, severity, category, title, body, evidence, confidence, optional suggestion. |
| **Fingerprint** | A stable, code-assigned identifier for a finding: `sha256(repo, category, path, anchor_hash)`; used for dedup, resolution tracking, and suppression (ADR-0024). |
| **Forge adapter** | The interface that normalizes a source-control provider (GitHub, GitLab, Gitea). |
| **Generation** | A monotonically increasing number per PR; newer generations supersede older runs. |
| **Grounding** | Verifying a finding against the actual code at the reviewed SHA. |
| **Idempotency key** | A unique key that makes a retried external effect safe (publish, webhook, job, notification). |
| **Installation** | A forge app installation on an account/org. One instance can have several. |
| **Jury** | The set of reviewers for a run, plus the dedup/consensus step that turns their findings into one verdict. |
| **Knowledge pack** | An immutable, content-hashed bundle of team knowledge (manifest + docs) that can be granted to a scope. |
| **Lease** | A time-bounded claim on a job by a worker; expires if the worker stops heartbeating. |
| **Model registry** | The catalogue of models with context windows, tokenizers, prices, capabilities, and rate limits. |
| **MVP** | The smallest build that proves the wedge end to end. Not the first supported release. |
| **Outbox** | A table written in the same transaction as a state change; a relay publishes its rows to the queue. |
| **Pack grant** | The instance configuration that applies a pack to global, repository, or reviewer scope. |
| **Policy** | Versioned rules for reviewer selection, publish mode, severity thresholds, budgets, data policy, fork policy, suppression. |
| **PoC** | `PrakashSewani/jury-forge-poc`, the Cloudflare proof of concept studied at `1cc22b7`. |
| **Provider** | A model API (OpenAI-compatible, Anthropic-compatible, local). |
| **Provider gateway** | The component that owns provider adapters, structured output, retries, usage, and egress binding. |
| **Review request** | A request to review a PR at a SHA, created by a webhook, manual try, or replay. |
| **Reviewer** | A stable identity (name, role) with immutable versions (prompt, model binding). |
| **Reviewer version** | An immutable configuration of a reviewer: instructions, rules, model, params, output schema. A run references it. |
| **Run** | One execution of the jury against one PR revision. Has steps, provider calls, findings, and a publication. |
| **Scope** | A path/pattern filter or a tenant/role boundary, depending on context. Prefer the explicit term. |
| **Self-hosted** | Runs on infrastructure the operator controls; no required central service. |
| **Snapshot (run config)** | The exact reviewer/policy/pack/model versions used by a run. |
| **Step** | A recoverable unit of a run (`resolve`, `fetch`, `index`, `plan`, `review`, `ground`, `jury`, `publish`, `record`). |
| **Superseded** | A run replaced by a newer generation for the same PR; it must not publish. |
| **Tenant** | An organisation. Every row is tenant-scoped. A single-operator instance is a tenant with one member. |
| **Token budget** | The number of model tokens allocated to a context/reviewer/run. |
| **Try run / dry run** | A manual review that publishes nothing. |
| **Trust label** | The marker that classifies a prompt block as trusted configuration or untrusted data. |
| **Verifier** | The step (deterministic and/or model) that checks a finding against the code before publish. |
| **Verdict** | The run's overall outcome: comment, request changes, approve, or needs human judgment. |
| **Webhook event** | A persisted, verified forge delivery; idempotent and replayable. |
| **Worker** | A stateless process that claims jobs and executes steps. |
| **Agent** | The target-product reviewer: a versioned configuration with role, instructions, tools, provider/model binding, and scope. |
| **Agent version** | An immutable agent configuration (prompt, model binding, tools, scope); a turn references it. |
| **Agent router** | Selects agents for a turn from explicit requests, repo config, path/language/label scope, availability, and budget; records why. |
| **PR session** | The durable conversation for one PR: threads, messages, findings, turns, generations. |
| **Thread** | A GitHub review-comment conversation; the unit the bot can reply to and resolve. |
| **Turn** | One bounded agent execution triggered by a command, reply, push, or policy; serialized per session. |
| **Resolution guard** | The server-side check used only in `auto` mode: bot-owned thread, human response, evidence, verifier, audit. |
| **Model catalog** | The provider-fetched list of models available to a key. |
| **Model registry** | A versioned catalogue that enriches model IDs with context window, prices, and capabilities. |
| **Provider model** | A catalog entry bound to a provider credential; the only valid model value for an agent. |
| **Repository knowledge graph** | The derived symbol/import/test/config/doc/finding graph used for context and branch review. |
| **Incremental index** | A graph update that re-parses only changed files and their reverse dependencies, reusing content-hash summaries. |
| **Diff review** | The default review that uses the PR diff plus targeted graph context. |
| **Manual trigger** | A human command/label/UI action that starts a review on any PR in an installed repo. |
| **Config-as-code** | `.jury-forge.yml` or `.github/jury-forge.yml`; opt-in automatic review policy and agent scopes. |
| **Harness** | The library/runtime that manages agent state, loops, tools, and human-in-the-loop (LangGraph.js or a thin turn runner). |
| **Reviewer** | User-facing name for an AI review agent (security, testing, backend, docs, custom). |
| **Reviewer catalog** | The org-level set of reviewer definitions/versions, with domain, owner, and approval status. |
| **Reviewer owner** | The SME/admin responsible for a reviewer’s content and versions. |
| **Repo reviewer binding** | The configuration that makes a catalog reviewer available on one repo; selection `required`/`default`/`capability`, scopes, budget. |
| **Required reviewer** | A binding that must run for a review; if unavailable, the review is blocked with a fallback. |
| **Default reviewer** | A binding that runs on a plain review when its scope matches. |
| **Capability reviewer** | A binding that runs only when a matching `jury:cap:<id>` label or UI selection is present. |
| **Capability registry** | Tenant-scoped capabilities: immutable ID, display name, optional one-level parent, status; built-in + SME-drafted/admin-approved custom. |
| **Capability group** | A one-level parent (e.g. `security` → `auth`, `crypto`, `secrets`); a parent label matches its children. |
| **SME** | Subject matter expert; owns/curates domain reviewers and binds them to assigned repos. |
| **Fallback comment** | The no-reviewers/no-match/required-unavailable notice; an issue comment, never a review. |
| **Review mode label** | `jury:pr-review` or `jury:branch-review`; a mode trigger, not a reviewer selector. |
| **Capability label** | `jury:cap:<id>`; requests a capability group within the repo’s bound/approved reviewers. Capability bindings only; required reviewers always run; never grants an unbound reviewer. |
| **Capability agent** | A branch/T2 reviewer with tools to verify behavior (graph, tests, static analysis); a sandbox run is later. |
| **Sandbox run** | Later, opt-in, isolated execution of tests/builds for a capability agent; no secrets, network off, resource caps. |
| **PR review** | Diff-only: PR diff/hunks + metadata + thread context, with no graph. Strict T0 in the MVP; T0+ from v1. Never reads a file outside the diff. |
| **T0 / T0+ / T1 / T2** | Context tiers: T0 diff only (MVP PR review); T0+ enclosing-function expansion inside diffed files (v1 PR review, ADR-0025); T1 bounded reads of arbitrary files (rejected for PR review, ADR-0019); T2 repository graph (branch review). |
| **Resolution modes** | `suggest` (default: agent proposes, human resolves natively/UI), `auto` (bot resolves after guard), `off` (humans only). |
| **Branch review** | v1.1: compare the PR branch to the repository default branch and review the full branch delta against the context graph. |
| **Shadow mode** | A reviewer binding that runs the full pipeline but publishes nothing; findings are stored unpublished and compared with human review (B-01, backlog). |
| **Zone / data policy** | Admin-assigned provider trust label and the per-repo rule (allowlist or minimum zone) deciding which providers may receive its code (B-02, backlog). |
| **Coverage manifest** | Per-turn list of changed files as reviewed / partial / not reviewed, with reasons (B-04, backlog). |
| **Knowledge source** | A pack, repo doc at SHA, live doc link, org convention, or graph used by a reviewer. |
| **Doc-link snapshot** | The content-hashed copy of an allowlisted external URL fetched live for a turn; stored for audit and used as fallback. |
| **Knowledge grant** | A scoped attachment (org/repo/reviewer/capability) with precedence and pin/latest. |
| **Knowledge citation** | The source/version/hash/path recorded for injected knowledge. |
| **Human override** | An SME/admin/owner resolution/reopen/dismissal with a reason, audited; the agent respects it. |
| **Single-tenant** | One organisation/personal account per instance in v1; multi-org is later. |
