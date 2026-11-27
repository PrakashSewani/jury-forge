# Spec: Session capacity, interface, roles, and visibility

- Status: draft for owner review — **MVP gate**: owner approval required before Phase 1b work that implements it (per-milestone approval, 2026-11-27)
- Date: 2026-11-15
- Owner: product + platform + security
- Related: ADR-0012 (sessions), ADR-0013 (trigger/routing), ADR-0015 (capacity/visibility, proposed)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

> **Direction (ADR-0023):** v1 roles are owner/maintainer/reader; the wider role model below is
> v1.x. Capacity, session lifecycle, the stalled-session policy, and the GitHub conversation surface
> remain v1.

## 1. Interface: website + GitHub, not the harness

The **harness is internal**. It is the agent runtime (LangGraph.js or a thin turn runner) that
executes a turn. Nobody connects to it, and it is not a user surface.

The product has two user interfaces:

| Surface | Role |
| ------- | ---- |
| **GitHub** | The primary conversation: start via Check Run actions (`PR review` / `Branch review` (v1.x)), mode labels (`jury:pr-review`/`jury:branch-review` (v1.x)), or capability labels (`jury:cap:<id>`); reply in the thread, receive reviews, resolve natively/UI. No slash commands. Most users never leave the PR. |
| **Website** | The control plane and deep view: onboarding, session inbox, session timeline, agents, providers/models, policy, roles, audit, costs, branch review, exports. |
| **API/CLI** | Later: automation, CI, scripts. Same auth/roles. |

The website is a React SPA served by the self-hosted app; it is not a separate hosted service. The
GitHub App is the integration; the website is the management and inspection surface.

## 2. Session lifecycle and “active listening”

There is **no per-session process**. A session is Postgres state. “Listening” is a webhook handler
and a DB index, not a running agent.

```
open
 ├── waiting_for_user   (agent replied; no compute)
 ├── running            (a turn is executing)
 └── closed             (PR merged/closed; archived after retention)
```

- An open session can wait for days/weeks with **zero compute** and resume instantly when a reply
  arrives.
- `idle` after N days is a UI/retention label, **not** a suspension. A Tuesday reply still starts a
  turn immediately.
- No “wake-up” job is needed; the webhook is the wake-up.
- Only closed/merged sessions are archived, and only after the retention window. If the PR is
  reopened, an archived session can be restored.
- The only reasons to age a session are storage, privacy, and UI noise; summarize old messages and
  cold-store raw responses, but keep the session resumable.

### Friday → Tuesday

1. Friday: PR opens, user asks for a review; session `open`, agent posts; state `waiting_for_user`.
2. Friday–Tuesday: no agent, no worker slot, no memory; just rows and a thread index.
3. Tuesday: user replies; webhook resolves the session; a turn is queued; a worker rehydrates.
4. If a branch/T2 review is active and the PR head changed: update the graph delta, mark affected
   findings `needs_recheck`, answer the comment, do a focused recheck, and offer a branch review
   rather than silently running one.

### Stalled sessions (proposed)

A bot question with no answer is worse than no question. The session is not a process, but it still
needs an owner:

- After **7 days** in `waiting_for_user` with no human reply, the session is summarized, flagged
  `needs human` in the inbox, and included in the weekly digest. One short nudge comment is allowed;
  the bot does not repeat it.
- After **30 days** (or PR inactivity, whichever the org configures), the session is archived with a
  reason. A later reply restores it and starts a turn; nothing is deleted silently.
- A direct agent question is always flagged in the inbox; a review that merely awaits resolution is
  not.
- The bot never auto-resolves, closes the PR, or drops the thread to clear the queue.
- Thresholds are org/repo configurable; the defaults are visible in settings.

## 3. Capacity and concurrency

Sessions are cheap; **turns** are the scarce resource.

| Limit | Personal default | Org default | Range |
| ----- | ---------------- | ----------- | ----- |
| Running turns per session | 1 | 1 | fixed |
| Concurrent turns per org | 2 | 2 | 1–16 |
| Concurrent turns per user | 2 | 2 | 1–8 |
| Concurrent turns per worker | 2–4 | 2–4 | 1–8 |
| Concurrent provider calls | 4 | 4 | 1–32 |
| Open sessions | soft 500 | soft 500 | admin override |
| Turns per session | 20 soft | 20 soft | 1–100 |
| Consecutive agent turns without human | 3 | 3 | 1–10 |

- Personal installations get the defaults; an org admin tunes concurrency, budgets, visibility, and
  policy. Repo config can override per repo.
- No hard cap on open sessions by default. A soft warning at 500/org with an admin override avoids
  blocking real PRs while surfacing abuse.
- The scheduler is fair per org and prioritises human replies > manual review > automatic review >
  branch review > indexing.
- Worker concurrency is auto-sized at install from CPU/memory, then configurable.
- Provider limits are per provider/model; one slow provider must not block another.

## 4. Roles, participants, and mentions

**User-first:** a personal install works without an org. If the app is installed on an org, an org
member who can read the repo can see the session without being an admin; only configuration is
admin-only. A session belongs to the **PR**, not to the user who triggered it.

- **Participants:** the PR author, commenters, mentioned users, and repo maintainers who join. The
  trigger user is recorded for audit.
- **Mentions:** `@jury-forge` asks the bot to act; `@human` asks a human to join. The bot does not
  answer on a human’s behalf. It can acknowledge the mention, pull the relevant context, and wait
  for the human. GitHub already sends the human a notification.
- **Tie to org/user:** if the app is installed on an org, the session is org-visible (subject to
  repo access). If installed on a personal account, it is visible to the owner and repo
  collaborators.

### Role mapping

| Product role | GitHub basis | Can view | Can reply | Can trigger | Can configure |
| ------------ | ------------ | :------: | :-------: | :---------: | :-----------: |
| Owner | installation owner / org owner | ✓ | ✓ | ✓ | ✓ |
| Admin | repo/org admin | ✓ | ✓ | ✓ | ✓ |
| Maintainer | repo write / maintain | ✓ | ✓ | ✓ | repo policy only |
| Member | org member with repo read | ✓ | ✓ | — | — |
| Viewer | repo read, not org member | ✓ | GitHub-native only | — | — |
| Auditor | explicit role | ✓ audit | — | — | audit export |

- **Visibility never exceeds GitHub repo visibility.** A user without repo read access sees
  nothing, even if they are an org member.
- **The product cannot be stricter than GitHub on comments.** A viewer with repo read can still
  comment natively in GitHub; a `—` above means Jury Forge does not expose the action and does not
  respond to that user, not that GitHub blocks them. Product actions (trigger, configure, resolve
  via the Jury Forge UI) are role-gated; GitHub-native actions are governed by GitHub.
- **Shadow-mode exception (backlog B-01):** shadow findings/reports are visible only to maintainers,
  SMEs, admins, and auditors — not PR authors or plain members. This is an explicit exception to the
  repo-read rule until the reviewer is promoted to live.
- Use the user’s installation access (`GET /user/installations/{id}/repositories`) and/or
  `GET /repos/{owner}/{repo}` with the user token to decide. Cache the result briefly.
- Org-wide visibility is the default when the app is installed on an org; a repo can restrict it
  later.
- Every trigger, reply, resolve, role change, and export is audited.

### Session ownership

- The session is keyed by `(installation, repository, PR)`. It is not owned by a single user.
- The UI shows “opened by” and “participants”; it does not hide the session from other repo readers.
- A user who leaves the org/repo loses UI access immediately; GitHub access is the source of truth.

## 5. Budgets and pricing

Two budget types:

- **Token budgets** — always enforceable from provider usage. The hard limit.
- **Currency budgets** — require prices. Best-effort.

Price sources, in order:

1. **Provider catalog** if the `/models` response exposes pricing (OpenRouter-style fields).
2. **Provider pricing endpoint** if the adapter knows one (rare).
3. **Versioned model registry** (OpenAI/Anthropic/known families).
4. **Admin price override** for a custom/private model.
5. **Unknown** — token-only budget; show “cost unknown”.

`POST /providers` attempts to parse pricing from the model response. The provider detail shows
`pricingSource` (`catalog`/`registry`/`manual`/`unknown`) and `pricingUpdatedAt`. A manual override
is allowed for custom providers; it is audited and never used to select a model (the model list is
still provider-driven).

## 6. Personal vs org defaults

- **Personal install:** app installed on a personal account; owner + collaborators; defaults for
  concurrency/budgets; no org policy.
- **Org install:** org admin tunes concurrency, budgets, auto-review policy, visibility, provider
  allowlist, and agent defaults. Repo config overrides. Personal preferences (default agents,
  notifications) stay user-level.

## 7. Acceptance criteria

- [ ] The website shows sessions, agents, providers, policy, roles, audit, cost; GitHub remains the
      primary conversation surface.
- [ ] A session open for a week resumes instantly from a reply with no warm process.
- [ ] A human reply is prioritised over indexing/branch review in the queue.
- [ ] An org member with repo read can see the session; without repo read, they cannot.
- [ ] A repo write user can trigger/reply; an admin can configure; a viewer cannot.
- [ ] `@human` mentions notify the human; the bot does not impersonate them; it can provide context
      and wait.
- [ ] The org admin can tune concurrent turns, budgets, visibility, and auto policy.
- [ ] A provider with pricing in `/models` shows it; a custom provider can be priced manually;
      unknown pricing enforces token budgets.
- [ ] Branch review compares the PR branch to the repository default branch, reviews the full branch delta against context, and is not a full-repo audit.

## 8. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| SC-01 | Can a repo restrict org-wide visibility? | Yes, later; org-wide default. |
| SC-02 | Can any org member with repo read reply, or only write? | Read can view; reply if GitHub allows; trigger requires write. |
| SC-03 | Do we show a session to a mentioned external collaborator who is not an org member? | Only if they have repo access. |
| SC-04 | Are budgets per org, per repo, or both? | Both; org default + repo override. |
| SC-05 | Do we allow admin price overrides for known models? | Yes, audited, with a warning. |
