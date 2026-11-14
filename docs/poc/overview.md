# PoC overview

**Repository:** [`PrakashSewani/jury-forge-poc`](https://github.com/PrakashSewani/jury-forge-poc)
**Studied at:** `1cc22b7` (merge of PR #27), the final commit on `dev` at the time of study.
**Study date:** 2026-11-14.

## What it is

A self-hosted AI code-review team for GitHub, deployed into the operator's own Cloudflare
account. One Cloudflare Worker serves the dashboard and the API, receives GitHub webhooks, and
orchestrates review runs. Cloudflare D1 stores configuration and history. A Durable Object per
run executes the review as a resumable state machine. Reviewers are user-defined agents with
their own instructions, rules, and model binding (OpenAI-compatible or Anthropic-compatible,
bring-your-own-key). A pull request produces one consolidated review with inline comments.

The PoC is a complete product slice: setup wizard, GitHub App manifest flow, OAuth sessions,
reviewer CRUD, repository sync, per-repo reviewer scope, review runs, manual try runs, knowledge
packs, activity log, settings, import/export, a React dashboard, a static promo site, CI, and an
auto-deploy pipeline.

## Timeline

| Date       | Milestone                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| 2026-09-26 | Repository and decision process created (D-002, D-003).                    |
| 2026-10-02 | Stack selected: TypeScript, Cloudflare Workers, D1, Durable Objects (D-001). |
| 2026-10-07 | Phase 2 complete; improvement slate accepted (D-017).                     |
| 2026-10-17 | Improvement slices 7–11 and access re-checks land in one PR (D-019).       |
| 2026-10-17 | Rework slices A–D: design system, shell, product shape, contracts (D-026–D-029). |
| 2026-10-19 | Auto-deploy on `dev`; `main` retired (D-030).                              |
| 2026-10-25 | Reviewer scope (D-031, D-032) and dark-first UI rework (D-033).            |
| 2026-10-26 | Knowledge packs (D-034), final studied commit.                             |

The project ran for roughly one month of intense work and produced 34 recorded decisions, 27
worker test files and 18 UI test files (386 + 197 tests at the final commit).

## The promises it made

- **Self-hosted, single-tenant.** One Worker, one D1 database, one private GitHub App per
  instance. No central service. (D-004)
- **Your own GitHub App.** Registered through GitHub's manifest flow, with the webhook URL and
  OAuth callback pointing at the instance. (D-005)
- **BYOK.** Reviewer model keys encrypted at rest with AES-256-GCM; requests go from the
  instance to the configured provider. (D-005)
- **A jury, not a fixed bot.** Any number of reviewers with their own instructions, rules, model,
  base URL, and parameters.
- **One consolidated review.** Inline comments where a finding has a diff line; everything else
  in the summary. (D-009, D-013)
- **Bounded, predictable context.** Byte budgets, skip rules, priority ordering, truncation
  notes. (D-010, D-018)
- **Knowledge packs.** Upload a `SKILL.md` bundle, version it immutably, grant it, and inject it
  under a budget. (D-034)
- **A real operational surface.** Setup wizard, readiness checklist, run history, activity trail,
  settings, reviewer templates, manual try runs, import/export.

## The single sentence that matters

The PoC proved the **product idea** — a configurable, self-hosted review jury with BYOK works and
people can operate it — and simultaneously proved that **Cloudflare's execution model is the
wrong ceiling** for the next product: byte budgets instead of token budgets, 10 ms CPU instead of
real workers, one Durable Object per run, no queue, no code index, and one installation per
instance.

## What this study is for

This knowledge base is not a post-mortem. It is the **input to a clean-room product**. We want to
preserve the PoC's product instincts, discard its runtime compromises, and design a platform that
is better on the axes that matter:

1. Review quality and grounding.
2. Operational simplicity on ordinary infrastructure.
3. Security and privacy for real teams.
4. Extensibility across providers, forges, and review policies.
5. Measurable outcomes, not prompt vibes.

Read next: [`architecture.md`](architecture.md) for the component view, then
[`../analysis/flaws.md`](../analysis/flaws.md) for what we will not repeat.
