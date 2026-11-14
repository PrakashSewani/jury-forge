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
