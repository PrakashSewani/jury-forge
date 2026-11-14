# Success metrics

"If you cannot measure it, you cannot improve it" is especially true for AI review. This page
defines what "better than the PoC" means, in numbers we can collect without compromising privacy.

## North-star metric

**Trusted reviews per week:** the number of reviews that are published and not dismissed,
suppressed, or edited into irrelevance by the operator.

This is deliberately not "reviews generated". A review nobody trusts is noise.

## Quality metrics

Measured on a labelled benchmark and on dogfood runs.

| Metric | Definition | v1 target |
| ------ | ---------- | --------- |
| Precision | Share of published findings a human confirms as valid | ≥ 0.70 |
| Recall | Share of seeded issues the jury finds | ≥ 0.60 |
| False-positive rate | Invalid findings / published findings | ≤ 0.30 |
| Duplicate rate | Findings merged or repeated across reviewers | ≤ 0.10 |
| Grounding rate | Inline findings whose cited line exists and matches the claim | 1.00 |
| Acceptance rate | Findings marked helpful / findings shown | ≥ 0.60 |
| Dismissal rate | Findings marked wrong / findings shown | ≤ 0.20 |
| Resolution accuracy | Resolved / Still present / New buckets that match a human audit | ≥ 0.85 |
| Suggestion acceptance | Suggested fixes applied / suggested fixes shown | ≥ 0.40 (when shipped) |

Targets are starting points; the first benchmark sets the baseline and the targets are revised
with evidence.

## Reliability metrics

| Metric | Definition | v1 target |
| ------ | ---------- | --------- |
| Run success rate | Runs that finish `completed` / runs started | ≥ 99% (excluding provider outages) |
| Publish success rate | Runs that publish / runs that reach `post` | ≥ 99.5% |
| Duplicate publish rate | Runs that create more than one review | 0 |
| Stuck run rate | Runs `running` beyond 2× expected duration | 0 (janitor recovers) |
| Time to first finding | Webhook received → first provider finding | ≤ 60 s p50, ≤ 3 min p95 |
| End-to-end review time | Webhook → posted review | ≤ 3 min p50, ≤ 10 min p95 |
| Recovery time | Failed run → retried or replayed successfully | ≤ 5 min with operator action |

## Cost metrics

| Metric | Definition |
| ------ | ---------- |
| Cost per review | Sum of provider cost for the run |
| Cost per repository per week | Aggregated, with a budget |
| Tokens per review | Prompt + completion, per reviewer |
| Context efficiency | Useful context bytes / total context bytes (proxy: findings per 1k tokens) |
| Cache hit rate | Provider prompt-cache reads / eligible tokens |
| Budget overruns | Runs that exceed the configured budget |

v1 targets: every run has a pre-run estimate; a hard budget can stop a run; a dashboard shows cost
per repo and per reviewer; no surprise overruns.

## Operability metrics

| Metric | Definition | v1 target |
| ------ | ---------- | --------- |
| Time to first review (new install) | `git clone` → first posted review | ≤ 60 min |
| Upgrade time | Old version → new version, no downtime | ≤ 10 min |
| Restore time | Backup → working instance | ≤ 30 min |
| Install success rate | Clean-machine installs that succeed without manual DB edits | ≥ 90% on the support matrix |
| Support bundle completeness | Diagnostics that answer a failure without a call | 100% of documented failure modes |

## Security metrics

| Metric | Definition | v1 target |
| ------ | ---------- | --------- |
| Secret redaction coverage | Known secret patterns detected before send | 100% of the test corpus |
| Prompt-injection resistance | Attack corpus cases that do not change the published verdict | 100% of the corpus |
| SSRF resistance | Egress policy blocks private/link-local/loopback targets | 100% of tests |
| Authorization coverage | Mutating endpoints with an explicit authz test | 100% |
| Audit completeness | Mutating actions that produce an audit event | 100% |
| Time to revoke | Removed user loses access | ≤ 1 request / ≤ 1 min |

## Adoption and product metrics

These are secondary; they matter only after quality and trust.

- Installs that reach a first review.
- Weekly active repositories.
- Reviewers per repository.
- Knowledge packs per instance.
- Repeat use after 30 days.
- Operator-reported NPS and qualitative "would you go back?".

## First live case study (2026-10-19)

One real auto review on `jury-forge-guinea-pig#3`:

- 8 findings, all 8 valid against the PR code, 8 inline; 45 seconds.
- One reviewer (`Testing`) failed with a provider 401; a manual try run after the config fix produced
  9 findings, all 9 valid, and published nothing.
- 2,306 + 5,802 tokens for the completed auto reviewer; 2,296 + 7,428 for the manual reviewer.
- One critical issue (`src/server.ts:78` key leak) and SQL injection in `src/exporter.ts` were
  outside the diff and never seen.

This is a case study, not a benchmark: one PR, one day, two reviewers, no labelled ground truth
beyond a manual check of the diff. It shows the product can produce genuinely useful findings, and
it shows the reliability, attribution, and context gaps the new product must close. Full detail:
[`../poc/live-instance.md`](../poc/live-instance.md).

## The comparison with the PoC

We will run the same benchmark on the PoC and on Jury Forge, and publish the delta:

| Axis | PoC baseline | Jury Forge target |
| ---- | ------------ | ----------------- |
| Precision | To be measured | +15 points |
| Recall | To be measured | +15 points |
| Grounding | Line-existence only | 100% evidence-verified |
| Time to first review | To be measured | ≤ 60 s p50 |
| Cost visibility | Token usage only | Pre-run estimate + per-run cost |
| Stuck runs | No recovery | 0 (janitor + replay) |
| Install | Cloudflare account | Compose on a VPS |
| Roles | Single owner | 5 roles, scoped |
| Audit | Best-effort, 90 days | Append-only, exportable |

## How we collect data without betraying the privacy thesis

- Metrics are computed locally and exported to the operator's own Prometheus/OTel backend.
- No code, prompt, finding, or repository name is sent to the project.
- The benchmark runs on public or synthetic repositories with permission.
- Dogfood data is aggregated and reviewed by the owner before publication.
- Any optional telemetry is opt-in, documented, and shows exactly what is collected.

## Review cadence

- **Per PR:** the relevant quality/reliability metrics for the change, if it touches the pipeline.
- **Per milestone:** the full dashboard, compared with the previous milestone.
- **Per release:** a public scorecard (quality, reliability, cost, security) and a decision to
  ship or hold.
