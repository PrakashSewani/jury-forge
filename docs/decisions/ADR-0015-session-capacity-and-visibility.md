# ADR-0015: Session capacity, interface, roles, and visibility

- Status: proposed
- Date: 2026-11-15
- Owners: product + platform + security
- Supersedes: —
- Revisit trigger: first multi-tenant deployment, or GitHub changes repo-permission APIs.

## Context

The product is session-based. The owner has clarified four things:

1. The **website** is the product interface; the agent **harness** is internal.
2. A session can sit idle for days (Friday PR → Tuesday reply) and must resume instantly.
3. Personal defaults are fine; org-level capacity/budgets/policy need tuning.
4. Org members with repo access should see the review process; roles are required. A session is tied
   to the org/user who installed the app, not to one trigger user, and others can participate
   (including `@mentions`).

## Options

| Area | Options |
| ---- | ------- |
| Interface | Harness UI (rejected), website only (rejected), **website + GitHub** (chosen) |
| Idle session | Keep process warm (rejected), suspend/dormant (unnecessary), **no process; state in Postgres** (chosen) |
| Capacity | Cap open sessions (rejected as default), **cap concurrent turns + soft session quota** (chosen) |
| Visibility | Trigger user only (rejected), org-wide with repo access (chosen), org-wide regardless of repo (rejected) |
| Roles | Single owner (rejected), **GitHub repo-permission mapping** (chosen) |
| Pricing | Hard-code (rejected), provider/registry/manual best-effort + token hard cap (chosen) |

## Decision

### Interface

- **GitHub** is the primary conversation surface: ask, reply, resolve.
- **Website** is the control plane and deep view: onboarding, session inbox/timeline, agents,
  providers/models, policy, roles, audit, cost, context review, exports.
- **Harness is internal.** LangGraph.js or the turn runner is not a user interface.

### Lifecycle and capacity

- No per-session process. An open session is Postgres state; a reply is the wake-up. `idle` is a
  UI/retention label, not a suspension. Archive only after PR close + retention.
- Defaults: 1 turn/session, 2 concurrent turns/org, 2/user, 2–4/worker, 4 provider calls; 20 turns/
  session soft, 3 consecutive agent turns without a human. Org admin tunes; repo overrides.
- No hard open-session cap by default; soft warning at 500/org with admin override.
- Queue priorities: human reply > manual review > automatic review > context review > indexing.

### Roles and visibility

- The session belongs to the **PR**, not the trigger user. It is keyed by
  `(installation, repository, PR)`.
- Visibility never exceeds GitHub repo visibility. Org members with repo read can view; repo write
  can trigger/reply; owner/admin configure; auditor sees audit. A viewer is read-only.
- `@jury-forge` asks the bot; `@human` is a request for human input. The bot must not impersonate
  the human; it can provide context and wait.
- Participants and mentions are stored; the trigger user is audit. Every trigger/reply/resolve/
  role/visibility change is audited.

### Budgets and pricing

- Token budgets are the hard limit (always known from usage).
- Currency budgets are best-effort: provider `/models` pricing when exposed, else versioned
  registry, else audited admin override, else “cost unknown”.
- Cache reads/writes are priced separately when the provider reports them; otherwise input price.
- Budgets per org/repo/session/turn; org default + repo override.

## Consequences

**Easier:** instant Tuesday replies without warm processes; simple capacity planning; predictable
org defaults; repo-scoped visibility; no per-repo enable toggles; honest cost reporting.

**Harder:** per-request GitHub repo-permission checks/caching; role/visibility UX; fair scheduling;
pricing registry/overrides; summary/cold storage for old sessions; provider limit tuning.

**Invariants:** no process per session; one turn per session; visibility ≤ repo visibility; session
belongs to PR; token budget always enforced; no free-text model; no bot resolve without guard.

## Security and operations

- Access checks use the user's installation access and/or repo endpoint; cache briefly; re-check on
  membership/installation change.
- Session data is repo-scoped; redaction/retention apply.
- Rate-limit triggers/replies; bot-loop protection; audit.
- Capacity/visibility settings are admin-only and audited.
- A queue backlog is visible; a reply is prioritised.

## Evidence

- Owner decisions, 2026-11-15.
- Specs: [`../product/specs/session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md),
  [`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md),
  [`../product/specs/provider-model-discovery.md`](../product/specs/provider-model-discovery.md).
- GitHub App permission model: installation/user tokens; repo access is the source of truth.

## Follow-ups

- Spike GitHub repo-permission checks and thread reply/resolve permissions.
- Define pricing parser for providers that expose prices (OpenRouter-style) and CommandCode.
- Add a capacity profile (small/medium/large) to the installer.
- Define the org admin UI for roles/concurrency/budgets/visibility.
