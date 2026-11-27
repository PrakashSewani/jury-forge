# Capability deep dive (2026-11-16)

A granular, capability-by-capability review of Jury Forge against the market and the PoC. Each
capability lists: **where the docs stand**, **what the best competitor does**, **the gap or flaw**,
and **the recommendation** with a proposed tier. Competitor facts come from vendor docs read on
2026-11-16 ([`competitive-landscape-2026-11-16.md`](competitive-landscape-2026-11-16.md)); they are
claims, not measurements.

Tier key: **MVP** (walking skeleton), **v1** (trust loop), **v1.x**, **Later**, **Owner** (needs a
G0 decision). Global questions raised here are Q-037–Q-048 in
[`open-questions.md`](open-questions.md).

## 0. Positioning after the research

The market has split into three groups:

| Group | Examples | Strength | Weakness Jury Forge exploits |
| ----- | -------- | -------- | ---------------------------- |
| Platform-hosted | Copilot code review | Zero setup, IDE + mobile, effort levels, agentic context, CodeQL Code Quality | Code and model choice are GitHub's; "model switching is not supported"; **does not reply** to comments; **repeats dismissed findings**; reads review rules from the **head branch** |
| SaaS specialists | CodeRabbit, Greptile, Qodo | Full-repo context, 50+ analyzers (CodeRabbit), repo graph (Greptile), learning from reactions | Code leaves the perimeter; self-hosting needs a sales licence (Greptile) |
| Open source / self-host | PR-Agent (MIT), Kodus (open core) | BYOK, multi-forge, CLI | PR-Agent: mostly one LLM call per command, no session. Kodus: **EE licence for parts**, **telemetry on by default**, rule caps on the free tier, Mongo + Postgres |

**Jury Forge's lane:** the only **fully MIT, telemetry-off, self-hosted** reviewer with a
**multi-reviewer jury, a durable conversation, and a verifiable receipt**. Every recommendation
below either strengthens that lane or closes a table-stakes gap that would block adoption.

---

## 1. Install and operations

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 1.1 | Compose install | ADR-0003/0020; artefacts do not exist | Greptile: Compose ≤100 devs plus a Terraform path; Kodus: Docker on a VM | No published sizing; no artefact | Publish a **sizing table** (5 / 50 / 200 devs: CPU, RAM, disk, Postgres size) and test it on a clean VM | MVP |
| 1.2 | Hardware floor | Not stated | Kodus 2 CPU / 8 GB / 60 GB; Greptile 4c / 16 GB for 5–10 devs | Unknown footprint | Target **2 vCPU / 4 GB / 20 GB** for ≤20 devs (no embeddings, no graph in v1). Make it a release gate | v1 |
| 1.3 | Datastores | Postgres only (ADR-0004) | Kodus runs Mongo + Postgres; Greptile runs Postgres + pgvector + Redis | — (an advantage) | Keep **one Postgres**: queue (`SKIP LOCKED`), sessions, receipts. Say so in marketing | v1 |
| 1.4 | Upgrade | Expand/contract described | Standard | No N-1 rollback test | Gate: upgrade from N-1 with seeded data, then roll back, in CI | v1 |
| 1.5 | Backup | Drill planned | — | The receipt signing key is not in the backup scope | Back up the DB **and** the signing and encryption keys; add a restore drill that verifies the receipt chain | v1 |
| 1.6 | Telemetry | Off; "no phone-home" | Kodus: daily heartbeat **on** by default | — (an advantage) | Keep it off. Ship a **local** `/metrics` and an opt-in "share anonymous stats" export file the operator sends by hand | v1 |
| 1.7 | Air-gapped / local models | TBD | Greptile supports air-gapped installs | Forge connectivity needed | v1: local OpenAI-compatible model (Ollama/vLLM) documented and tested in CI with a stub. Fully air-gapped (GHES + local model) is v1.x | v1 / v1.x |
| 1.8 | Kubernetes | Helm v1.x | Greptile Helm for 100+ devs | — | Keep v1.x; design the app config 12-factor so Helm is packaging only | v1.x |

## 2. Forge, events, triggers

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 2.1 | Forges | GitHub.com only | Kodus: 5 forges incl. Forgejo; PR-Agent: 5 | Narrow | Keep GitHub-only for v1, but **write the forge adapter contract test** in MVP so GitLab is a port, not a rewrite. Next forge: **GitLab self-managed** (largest self-host demand) | MVP (contract), v1.x (GitLab) |
| 2.2 | GHES | v1.x | Greptile, Copilot | Self-host buyers often run GHES | Make the API base URL configurable from day one; **test GHES in v1.x first** | v1.x |
| 2.3 | Manual trigger | Label, Check Run action, UI | Copilot: reviewer picker (Copilot is special) | The picker cannot add arbitrary apps (verified) | Keep. Add a **PR description checkbox** ("- [ ] Request Jury Forge review") as the most discoverable trigger; it works on every plan | v1 |
| 2.4 | Automatic review | Opt-in `.jury-forge.yml` | Copilot: rulesets, "review new pushes", draft reviews | Config read from where? | Read `.jury-forge.yml` from the **base** SHA (same rule as instructions). Options: `on: [opened, ready_for_review, push]`, `drafts: false`, `paths`, `authors.exclude` (bots, dependabot) | v1 |
| 2.5 | Effort/preset selection order | S7 presets | Copilot: request → previous on PR → requester → repo → org → built-in default | Our order is undefined | Adopt the same **6-step resolution order**, and print the preset used in the Check Run summary | v1 |
| 2.6 | Trigger authz | ADR-0024 | Copilot: "block reviews requested with an external licence" | — | ADR-0024 §1 covers it. Add **cost attribution**: each run is billed to the requester, so per-user budgets are possible | v1 |
| 2.7 | Bot-authored PRs | Not defined | Copilot bills bot PRs to the org | Dependabot/Renovate flood | Default `authors.exclude: ["dependabot[bot]", "renovate[bot]"]`, or the `quick` preset for them | v1 |
| 2.8 | Webhook reliability | Dedup + signature | — | Missed webhooks during downtime | **Reconciler job**: every 10 min, list open PRs with pending triggers (labels, checkboxes) and enqueue what was missed | v1 |

## 3. Reviewers and the jury

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 3.1 | Default jury | Security, Correctness, Tests | CodeRabbit: Review, Verification, Chat, Pre-merge, Finishing agents; Copilot Max: "multiple high-reasoning models" | No **verifier** role | Add a **Verifier** (not a juror): it re-checks each candidate finding against the diff and drops ungrounded ones before the chair. It does not vote | v1 |
| 3.2 | Model diversity | One provider/model per reviewer | Copilot Max uses multiple models | The jury's value comes from **independent errors** | `Deep` preset recommends **different model families** per juror when the catalog has them; the receipt shows the diversity | v1 |
| 3.3 | Chair rule | `jury-output.md` | — | Prompt-based chair | The chair is **code first**: dedup by fingerprint (ADR-0024 §4), then majority/severity rules. A model only writes the summary text. The rules are printed in the receipt | v1 |
| 3.4 | Disagreement | Preserved dissent | None of the four competitors shows dissent | — (signature feature) | Show dissent inline: "2 of 3 jurors flagged this; Tests juror disagreed: <reason>". Low-agreement findings go to the collapsed section | v1 |
| 3.5 | Reviewer instructions | Editable, versioned | Kodus "Kody Rules" in plain language (free tier capped at 10) | — | Unlimited rules, MIT. Each rule has an ID that is cited in the finding, which makes feedback per-rule | v1 |
| 3.6 | Pre-merge checks | Not present | CodeRabbit "Pre-Merge Checks" | Missing | **S12 Jury charges:** natural-language pass/fail checks ("migrations include a down step", "PR links an issue"). Each is a Check Run line item. Optional merge gate via rulesets | v1 |
| 3.7 | Summary/walkthrough | B-08 backlog | Copilot overview comment; PR-Agent `/describe` | Table stakes | Put a **3-line summary** in the review body (what changed, risk, verdict). A full walkthrough stays B-08 | v1 |
| 3.8 | Approvals | Never | Copilot can approve (opt-in; dismissed on push) | — | **Never approve in v1.** Use the Check Run conclusion as the gate instead (§6.6) | v1 |

## 4. Context

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 4.1 | Diff hunk context | Strict T0 (diff only) | PR-Agent: 5 lines before / 1 after, plus **dynamic context** that extends to the enclosing function or class | Strict T0 cuts hunks mid-function, so jurors guess at the signature and guards | **T0+ (Owner, Q-037):** expand each hunk to its **enclosing function** in the head file, capped at about 200 lines per hunk. This reads only files already in the diff and stays deterministic. It is the cheapest quality gain on this list | Owner → v1 |
| 4.2 | Large PRs | B-04 backlog | PR-Agent: language priority, additions over deletions, token-aware fitting, "other modified files" list | "Silent partial review" risk | Promote **B-04 to v1**: deterministic fitting (PR-Agent's order) plus a **coverage manifest** in the receipt (reviewed / summarised / skipped files). Never claim full coverage | v1 |
| 4.3 | Excluded files | Skip lockfiles/generated | Copilot excludes dependency files, logs, SVG | — | Default exclusion list plus `.jury-forge.yml` `exclude:`; excluded files appear in the coverage manifest | v1 |
| 4.4 | Static analyzers as evidence | Out (no execution) | CodeRabbit: 50+ linters/SAST in a sandbox; Copilot: CodeQL Code Quality | Biggest precision gap | **S13 (v1.x, ADR needed):** run pinned analyzers (gitleaks MIT, Semgrep CE LGPL as a separate process, ESLint/ruff) in a **no-network, read-only container** on the changed files only. Results are *evidence* for jurors, not findings by themselves. Until then, **ingest existing CI results** (SARIF from the PR's check runs) read-only in v1 | v1 (ingest) / v1.x (run) |
| 4.5 | Repo graph | v1.x, measurement-gated | Greptile: full graph + embeddings | — | Keep it gated. Start with **callers-of-changed-symbols** only (a ctags/tree-sitter index), not a full graph | v1.x |
| 4.6 | External context (MCP) | B-07 backlog | Copilot uses repo MCP servers and skills | — | v1.x: read-only, allowlisted MCP servers per reviewer, with egress logged in the receipt | v1.x |
| 4.7 | Linked issue | Not present | Copilot uses MCP-referenced issue keys | Cheap intent signal | v1: fetch the **linked GitHub issue** title and body (same forge, same token) as trust-labelled context, so the jury checks the PR against its stated intent | v1 |

## 5. Knowledge, instructions, memory

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 5.1 | Instruction files | AGENTS/CONTRIBUTING at base SHA | Copilot reads 6 file types, path-specific, from the **head** branch | — | S11 (base SHA, broad set). Add **path-specific scoping**: `applyTo` globs are honoured per hunk | v1 |
| 5.2 | Skills | Not present | Copilot `.github/skills/code-review` | — | v1.x: read a `code-review` skill folder at base SHA as reviewer instructions | v1.x |
| 5.3 | Memory | S4 repo memory (suppressions) | Copilot Memory (repo facts); Greptile learns in 2–3 weeks; Kodus Memory | Only negative memory | Add **positive facts**: when an appeal is withdrawn with a reason ("we use X intentionally"), store the reason as a **repo fact** (a human confirms in the UI). Facts are cited when used | v1 |
| 5.4 | Org conventions pack | One pack in v1 | — | — | Keep. Packs are versioned; the receipt cites `slug@hash` | v1 |
| 5.5 | History-seeded conventions | B-06 | — | Strong onboarding hook | v1.x: mine the last 200 human review comments into a **draft** conventions pack for human approval | v1.x |

## 6. Output and publishing

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 6.1 | Severity | Severity + confidence | Copilot: High/Medium/Low | — | 4 levels (critical/high/medium/low) plus a confidence band. Lows are collapsed by default | v1 |
| 6.2 | Noise budget | S3 | — | — | Keep. **Report the "withheld" count** in the summary so silence is not mistaken for coverage | v1 |
| 6.3 | Suggested changes | v1.x | Copilot: one-click suggestions plus batch commit | Table stakes | Promote **GitHub `suggestion` blocks to v1** for single-hunk fixes **only when** the suggestion applies cleanly to the reviewed SHA (validated in code). Multi-file fixes go through S8 handoff | v1 |
| 6.4 | Fix handoff | S8 | Greptile "Fix with your agent"; Copilot cloud agent | — | Keep it vendor-neutral: copy a prompt, plus an optional `jury-forge fix-prompt <pr>` CLI output | v1 |
| 6.5 | SARIF export | Planned | Copilot Code Quality | — | v1.x: upload findings as SARIF to code scanning so they show in the Security tab | v1.x |
| 6.6 | Merge gating | Not defined | Copilot Code Quality rulesets; CodeRabbit pre-merge | Missing | Check Run conclusion policy: `neutral` (default) / `failure on unresolved critical` / `failure on failed charge`. The operator wires it into rulesets | v1 |

## 7. Conversation and sessions

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 7.1 | Replies | Durable session | Copilot **does not reply**; CodeRabbit chat | — (signature feature) | Reply intent is classified by a **fast model** (§10.2): dispute / question / fixed / won't-fix / other. Only dispute and question cost a full turn | v1 |
| 7.2 | Ask the jury (PR-level) | Mention → turn | PR-Agent `/ask` | — | Keep mention-based (no slash commands). Answers cite diff lines | v1 |
| 7.3 | Appeals | S1 | None | — | Keep | v1 |
| 7.4 | Push handling | ADR-0024 §5 | Copilot re-reviews only on request, and repeats findings | — | Keep. Add **"incremental review"**: on push, review **only the new commits' diff** when a trigger is active, and never repeat open findings | v1 |
| 7.5 | Stalled sessions | 7-day flag / 30-day archive | — | — | Keep | v1 |
| 7.6 | Reviewer of record | Not defined | — | Who answers a thread? | The finding's **originating juror** owns the thread; the chair speaks only on PR-level questions. Keep one voice per thread | v1 |

## 8. Resolution

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 8.1 | Modes | suggest/auto/off; ADR-0024 guard | Copilot: none | — | Keep | v1 |
| 8.2 | Verified fixed | S2 | None | — | Keep | v1 |
| 8.3 | Human resolve sync | GitHub-native | — | Resolve in GitHub must update the finding | Poll `isResolved` per thread (GraphQL) on each turn and by the reconciler; a human resolve = `fixed` or `accepted risk` (one-click in the UI) | v1 |

## 9. Learning and feedback

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 9.1 | Signals | Buttons + S10 reactions | Copilot 👍/👎 (sent to GitHub); Greptile reactions + replies | — | Combine buttons, reactions, appeal outcomes, human resolves, and "fixed in a later commit" (implicit acceptance). **Implicit acceptance is the strongest signal**: record it | v1 |
| 9.2 | Per-rule / per-juror scorecard | v1.x | Kodus cockpit (paid) | — | v1: a simple table per juror and rule (posted, accepted, wrong, appealed). It is free and local | v1 |
| 9.3 | Auto-tuning | Not present | Greptile learns in 2–3 weeks | — | v1.x: suggest (never auto-apply) disabling a rule whose acceptance is < 20 % over ≥ 30 findings | v1.x |

## 10. Providers, models, cost

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 10.1 | Discovery | `/models`, no free text | Greptile needs 3 model types configured | — | Keep | MVP |
| 10.2 | Model roles | One model per reviewer | Greptile: smart / fast / embeddings | All tasks use the expensive model | Add instance **roles**: `reasoning` (jurors), `fast` (intent classification, summaries, dedup tie-break, risk explanation). Halves the cost of replies | v1 |
| 10.3 | Cost estimate | S7 | Copilot publishes ranges per effort level | — | Publish our own ranges from dogfood runs in the docs | v1 |
| 10.4 | Budgets | ADR-0024 §7 | Copilot blocks when a budget is reached | — | Keep. Add **per-requester** budgets (§2.6) | v1 |
| 10.5 | Prompt caching | Not mentioned | Provider feature | Free savings | Order prompts with a stable prefix (system → instructions → pack → diff) so provider prompt caching applies; record cache hits in the receipt | v1 |
| 10.6 | Fallback | Deferred | — | Provider outage = no review | v1.x: a per-reviewer fallback model from the catalog, recorded in the receipt | v1.x |

## 11. Security and privacy

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 11.1 | Instruction trust | Base SHA (S11) | Copilot reads the **head** branch | — (an advantage) | Keep; document it as a security property | v1 |
| 11.2 | Prompt injection | Trust labels + ADR-0024 | — | No test corpus yet | Ship a public **injection corpus** (diff, reply, instruction file, linked issue, pack) in the test suite as a release gate | v1 |
| 11.3 | Secret redaction | Planned | Kodus encrypts data | — | gitleaks-style rules before egress; the redaction count is in the receipt; secrets found are reported as **findings**, not sent | v1 |
| 11.4 | Egress preview | S6 | None | — | Move **egress preview** to v1. It is cheap and is the security buyer's demo moment; replay stays v1.x | v1 |
| 11.5 | Data retention | Open | — | — | Defaults: raw prompts/responses 30 days, findings and receipts 1 year, configurable; purge per repo | v1 |
| 11.6 | Licence purity | MIT | Greptile self-host needs a sales licence; Kodus has an EE licence | — (an advantage) | Add a CI licence check (no BSL/SSPL/EE dependencies) | MVP |

## 12. Governance

| # | Capability | Docs today | Best in market | Gap / flaw | Recommendation | Tier |
| - | ---------- | ---------- | -------------- | ---------- | -------------- | ---- |
| 12.1 | Roles | owner/maintainer/reader | Kodus RBAC is Enterprise-only | — | Keep; roles are free | v1 |
| 12.2 | SSO | Later | Kodus/Greptile Enterprise | Blocks larger orgs | GitHub OAuth covers v1. Generic **OIDC** in v1.x (Keycloak, Entra, Okta) | v1.x |
| 12.3 | Audit | Stream + export + signed receipts | Paid tiers elsewhere | — | Keep; JSONL export plus a syslog/OTLP sink | v1 |

## 13. Quality measurement (post-v1, no spike)

| # | Capability | Recommendation | Tier |
| - | ---------- | -------------- | ---- |
| 13.1 | Eval harness v0 | **Keep it** (it is not the spike): ~20 labelled PRs with a **stub model** in CI to catch regressions in parsing, anchoring, dedup, fingerprinting, and budgets. No real model calls | MVP |
| 13.2 | Replay benchmark | Phase 3, on dogfood + pilot repos; jury vs a single model at **equal token budget** | v1 (Phase 3) |
| 13.3 | Online metrics | Acceptance rate, implicit-fix rate, appeal outcomes, comments per PR, cost per accepted finding | v1 |
| 13.4 | Public scorecard | Publish the method, and results from repos that consented | v1 launch |

## 14. Surfaces

| # | Capability | Best in market | Recommendation | Tier |
| - | ---------- | -------------- | -------------- | ---- |
| 14.1 | CLI | Kodus, PR-Agent, CodeRabbit | `jury-forge review --staged` against the operator's instance (B-03) | v1.x (first) |
| 14.2 | IDE | Copilot, CodeRabbit | Out; the CLI plus the fix handoff cover it | Later |
| 14.3 | Chat (Slack) | CodeRabbit | Out | Later |

---

## Summary: what changes

**Promoted into v1:** verifier role (3.1), code-first chair (3.3), jury charges / pre-merge checks
(3.6, S12), in-review summary (3.7), large-PR fitting + coverage manifest (4.2), CI SARIF ingest
(4.4), linked-issue context (4.7), positive repo facts (5.3), validated `suggestion` blocks (6.3),
merge-gate policy (6.6), incremental review on push (7.4), originating-juror thread ownership (7.6),
implicit-acceptance signal (9.1), per-juror scorecard (9.2), fast/reasoning model roles (10.2),
prompt-cache ordering (10.5), egress preview (11.4), injection corpus (11.2), retention defaults
(11.5), reconciler (2.8), PR checkbox trigger (2.3), base-SHA `.jury-forge.yml` (2.4), preset
resolution order (2.5), bot-author defaults (2.7), sizing table and floor (1.1–1.2).

**Owner decisions:** T0+ enclosing-function context (Q-037) and the others in Q-038–Q-048.

**Explicitly not doing:** approvals, auto-fix, IDE/Slack, embeddings in v1, telemetry on by default,
any EE/licence-gated feature.

**Scope risk:** this list is long. If v1 must shrink, cut in this order: 9.2 scorecard UI → 4.7
linked issue → 3.6 charges → 6.3 suggestions. **Never cut** ADR-0024, the verifier, the coverage
manifest, or the receipt.
