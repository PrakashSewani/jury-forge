# Observability

A self-hosted product must let the operator answer three questions without a vendor:

1. **Is it working?** (health, throughput, errors)
2. **Why is this review bad/slow/expensive?** (run timeline, prompts, tokens, cost)
3. **What changed?** (audit, config versions, deployments)

The product emits standard telemetry (OpenTelemetry, Prometheus) and ships dashboards. It never
phones home.

## 1. Principles

- **Local first.** Metrics/logs/traces go to the operator's backend or a bundled stack. No project
  endpoint.
- **Run-centric.** Every signal can be joined by `org_id`, `repository_id`, `run_id`, `step`,
  `reviewer_version_id`, `provider`, `model`.
- **No secrets.** Redaction at the logging boundary; tests scan for leaks.
- **Actionable.** Every alert links to a runbook and a run.
- **Bounded.** Sampling and retention are configurable; high-cardinality fields are controlled.

## 2. Logs

Structured JSON to stdout by default:

```json
{
  "ts": "2026-11-14T10:00:00.000Z",
  "level": "info",
  "service": "worker",
  "org_id": "org_...",
  "repository_id": "repo_...",
  "run_id": "run_...",
  "step": "review",
  "reviewer_version_id": "rv_...",
  "provider": "openai",
  "model": "gpt-...",
  "request_id": "req_...",
  "msg": "provider call completed",
  "duration_ms": 1234,
  "prompt_tokens": 12000,
  "completion_tokens": 800,
  "cost_micros": 4200
}
```

Rules:

- Never log prompts, diffs, keys, tokens, or full provider responses at `info`.
- Raw artefacts go to object storage with an explicit retention policy and access control.
- Redact known secret patterns and configured sensitive paths.
- Use a request id propagated from the web/API to the worker via the job payload.
- A `debug` mode can include more, but it is explicit, time-boxed, and warns.

## 3. Metrics

### Service metrics

| Metric | Type | Labels |
| ------ | ---- | ------ |
| `jf_http_requests_total` | counter | method, route, status |
| `jf_http_request_duration_seconds` | histogram | route |
| `jf_queue_depth` | gauge | queue, priority |
| `jf_job_wait_seconds` | histogram | queue |
| `jf_job_duration_seconds` | histogram | kind, status |
| `jf_step_duration_seconds` | histogram | step, status |
| `jf_lease_expiries_total` | counter | queue |
| `jf_dead_letters_total` | counter | queue, reason |
| `jf_webhook_events_total` | counter | forge, event, action, result |
| `jf_provider_requests_total` | counter | provider, model, status |
| `jf_provider_latency_seconds` | histogram | provider, model |
| `jf_provider_tokens_total` | counter | provider, model, kind |
| `jf_provider_cost_micros_total` | counter | provider, model, org |
| `jf_findings_total` | counter | severity, category, status |
| `jf_publish_total` | counter | forge, status |
| `jf_stale_runs` | gauge | — |
| `jf_budget_utilization_ratio` | gauge | org, scope |
| `jf_egress_blocked_total` | counter | reason |
| `jf_redactions_total` | counter | kind |

Cardinality rules: never label by `run_id` or `repository_id` on a Prometheus metric; use logs and
traces for those. Aggregate by org only when tenant cardinality is small; otherwise use rollups.

### Business metrics (rollups)

- Reviews per day/week, per repo.
- Findings per review, accepted/dismissed.
- Cost per review, per repository, per reviewer.
- Time to first finding, end-to-end duration.
- Reviewer scorecards.

These come from `usage_rollups` and `findings`, not from high-cardinality metrics.

## 4. Traces

One trace per webhook/run:

```
webhook.receive
└── run.execute (run_id, org, repo, pr, generation)
    ├── step.resolve
    ├── step.fetch
    ├── step.index
    ├── step.plan
    ├── step.review (reviewer_version_id, provider, model)  × N
    ├── step.ground
    ├── step.jury
    ├── step.publish
    └── step.record
```

Spans carry: status, duration, token counts, cost, retries, cache hit/miss, error code. Prompt and
response bodies are **not** span attributes; they are artefacts referenced by id.

Sampling: 100% for errors and slow runs; configurable head sampling for the rest (e.g. 10%).
Always sample a run that is manually triggered or replayed.

## 5. Run timeline

The product's own best debugging surface. For every run, show:

- status, generation, mode, trigger, actor;
- each step with start/end, attempt, duration, error, metrics;
- the configuration snapshot (reviewer versions, policy, packs, model);
- the context manifest: included/omitted files, tokens per class, why;
- provider calls: model, tokens, cost, latency, status, raw response link (redacted, permissioned);
- findings: raw, grounded, dropped, merged, published;
- publish result and external review link;
- budget used vs limit.

This is what makes a bad review explainable. It is also the support bundle.

## 6. Dashboards

Ship JSON dashboards for Grafana (or equivalent) and a built-in overview:

1. **Service health:** request rate/errors/latency, queue depth, worker saturation, DB connections.
2. **Reviews:** runs/day, success rate, duration, time to first finding, stale runs.
3. **Quality:** findings by severity/category, acceptance, dismissal, duplicates, grounding rate.
4. **Cost:** spend/day, per repo, per reviewer, budget utilization, cache hit rate.
5. **Providers:** latency, error rate, rate limits, token mix.
6. **Security:** auth failures, egress blocks, redactions, prompt-injection flags.

## 7. Alerts

Default alert set (all configurable):

| Alert | Condition | Severity |
| ----- | --------- | -------- |
| Instance down | `/healthz` failing for 2 min | critical |
| Database unavailable | readiness failing | critical |
| Queue backlog | depth > threshold for 10 min | warning |
| Stale runs | `jf_stale_runs > 0` for 10 min | warning |
| Dead letters | any new dead letter | warning |
| Publish failures | failure rate > 5% over 15 min | critical |
| Provider errors | error rate > 20% over 5 min | warning |
| Budget threshold | utilization > 80% | warning |
| Budget exceeded | utilization 100% | critical |
| Webhook signature failures | spike | warning |
| Egress blocked | spike | warning |
| Redactions | spike (possible secret leak) | warning |
| Auth failures | spike | warning |

Every alert links to a runbook section.

## 8. SLOs

| SLO | Target | Measurement |
| --- | ------ | ----------- |
| Review availability | 99.5% monthly | successful completed runs / started |
| Publish success | 99.5% monthly | published / reached publish |
| Time to first finding | p95 ≤ 3 min | trace |
| End-to-end review | p95 ≤ 10 min | trace |
| API availability | 99.9% monthly | 5xx rate |
| Stale-run recovery | ≤ 5 min | janitor metric |

SLOs are per instance (self-hosted), not a central promise. The docs explain how to measure them.

## 9. Health endpoints

- `GET /healthz` — liveness: process is up, no dependency checks.
- `GET /readyz` — readiness: DB reachable, migrations current, queue reachable, object storage
  writable, encryption key loaded. Returns `200` or `503` with a component breakdown.
- `GET /metrics` — Prometheus (auth-protected or bound to the internal network).
- `GET /api/v1/diagnostics` — admin-only summary: version, migration, components, last errors,
  config warnings. The basis of the support bundle.

## 10. Support bundle

`jury-forge doctor --bundle` produces a redacted archive:

- version, image digest, migration version;
- config with secrets removed;
- health/readiness output;
- recent error logs (redacted);
- queue/job stats;
- a list of recent run ids and their timelines (no prompts by default);
- dependency versions and licence summary.

The operator can attach it to an issue without leaking code or keys.

## 11. Privacy

- No telemetry to the project by default.
- Optional, opt-in, documented usage ping (version, install id hash, feature counts) with a clear
  preview of the payload and an off switch.
- Logs and traces are the operator's data; retention is their policy.
- The benchmark and public scorecards use consented or public repositories only.

## 12. What the PoC had

The PoC had `console.error`, a `/api/health` that always returned `{ ok: true }`, an activity log,
and per-reviewer token usage. It had no metrics, traces, request ids, cost, queue depth, or
readiness. This document is the gap.
