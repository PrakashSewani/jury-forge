# Glossary

Shared vocabulary. When a term is ambiguous, this page wins.

| Term | Meaning |
| ---- | ------- |
| **ADR** | Architecture Decision Record. One durable choice, with context, options, decision, and consequences. |
| **Artifact / artefact** | A stored byte payload: raw diff, provider response, report, export. Lives in object storage, referenced from Postgres. |
| **Audit event** | An append-only record of a mutation or a security-relevant decision. Not the same as activity. |
| **Budget** | A token or cost limit for a scope and period, with a warn or block action. |
| **Chair** | An optional final step that merges/downgrades/verdicts findings within policy; it cannot invent findings. |
| **Context manifest** | The record of what the model saw: included files/slices, omitted files, token counts, reasons. |
| **Context planner** | The component that selects what each reviewer sees within a token/cost budget. |
| **Dead letter** | A job that exhausted its retries and is waiting for an operator to replay or discard. |
| **Deduplication** | Merging findings that describe the same issue across reviewers. |
| **Egress policy** | The allowlist and IP/redirect rules that decide which outbound requests are permitted. |
| **Evaluation benchmark** | A labelled set of PRs used to measure precision, recall, grounding, and cost. |
| **Finding** | A single review claim: file, line, severity, category, title, body, evidence, confidence, optional suggestion. |
| **Fingerprint** | A stable identifier for a finding across runs, used for resolution tracking and suppression. |
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
| **Resolution guard** | The server-side check that allows only a bot-owned thread with a human response and evidence to be resolved. |
| **Model catalog** | The provider-fetched list of models available to a key. |
| **Model registry** | A versioned catalogue that enriches model IDs with context window, prices, and capabilities. |
| **Provider model** | A catalog entry bound to a provider credential; the only valid model value for an agent. |
| **Repository knowledge graph** | The derived symbol/import/test/config/doc/finding graph used for context and context review. |
| **Incremental index** | A graph update that re-parses only changed files and their reverse dependencies, reusing content-hash summaries. |
| **Context review** | An explicit review that uses the repository graph, not only the diff. |
| **Diff review** | The default review that uses the PR diff plus targeted graph context. |
| **Manual trigger** | A human command/label/UI action that starts a review on any PR in an installed repo. |
| **Config-as-code** | `.jury-forge.yml` or `.github/jury-forge.yml`; opt-in automatic review policy and agent scopes. |
| **Harness** | The library/runtime that manages agent state, loops, tools, and human-in-the-loop (LangGraph.js or a thin turn runner). |
| **Reviewer** | User-facing name for an AI review agent (security, testing, backend, docs, custom). |
| **Reviewer catalog** | The org-level set of reviewer definitions/versions, with domain, owner, and approval status. |
| **Reviewer owner** | The SME/admin responsible for a reviewer’s content and versions. |
| **Repo reviewer binding** | The configuration that makes a catalog reviewer available on one repo; required/optional, scopes, budget. |
| **Required reviewer** | A binding that must run for a review; if unavailable, the review is blocked with a fallback. |
| **Optional reviewer** | A binding that runs only when its path/language/label scope matches. |
| **SME** | Subject matter expert; owns/curates domain reviewers and binds them to assigned repos. |
| **Fallback comment** | The no-reviewers/no-match/required-unavailable notice; an issue comment, never a review. |
| **Domain label** | A trigger label like `jury:security` or `jury:testing` that requests a domain’s reviewers. |
