# Spec: Session capacity, interface, roles, and visibility

- Status: **MVP gate — MVP-tier rows approved by the owner on 2026-11-28.** Later tiers stay draft and are approved before their milestone (per-milestone approval, 2026-11-27). Revised 2026-11-27 in the MVP spec review (release tiers, ADR alignment; see `delivery/status.md`).
- Date: 2026-11-15
- Owner: product + platform + security
- Related: ADR-0012 (sessions), ADR-0013 (trigger/routing), ADR-0015 (capacity/visibility, accepted at G0), ADR-0024 (who may start a turn; turn budgets — binding), ADR-0028 (v1 roles and resolution rights)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

> **Direction (ADR-0023):** v1 roles are owner/maintainer/reader; the wider role model below is
> v1.2. Capacity, session lifecycle, the stalled-session policy, and the GitHub conversation surface
> remain v1.

## Release tiers

- **MVP (G1):** no per-session process (§2); the lifecycle states; serialized turns and the
  concurrency defaults (§3); ADR-0024 turn budgets; a **single operator, the claimed owner**, who sees
  every session in the UI ("everyone with a session is the owner" is the labelled MVP exception in
  `AGENTS.md`); GitHub as the conversation surface.
- **v1:** owner/maintainer/reader roles (§4, ADR-0028) with visibility derived from GitHub repo
  access; the stalled-session policy (§2); org-level tuning by the owner (§6).
- **v1.1:** the branch-review steps in "Friday → Tuesday" and the branch-review criterion.
- **v1.2:** the admin, member, viewer, and auditor roles; per-repo provider allowlists (B-02); the
  API/CLI surface.

## 1. Interface: website + GitHub, not the harness

The **turn runner is internal**. It is the thin, explicit step pipeline that executes a turn
(ADR-0010 as amended, technical-approach §3.4). Nobody connects to it, and it is not a user surface.

The product has two user interfaces:

| Surface | Role |
| ------- | ---- |
| **GitHub** | The primary conversation: start via the Check Run action (`PR review`; `Branch review` in v1.1), mode labels (`jury:pr-review`; `jury:branch-review` in v1.1), or capability labels (`jury:cap:<id>`, v1.2); reply in the thread, receive reviews, resolve natively/UI. No slash commands. Most users never leave the PR. |
| **Website** | The control plane and deep view: onboarding, session inbox, session timeline, agents, providers/models, policy, roles, audit, costs, branch review, exports. |
| **API/CLI** | Later: automation, CI, scripts. Same auth/roles. |

The website is a React SPA served by the self-hosted app; it is not a separate hosted service. The
GitHub App is the integration; the website is the management and inspection surface.

## 2. Session lifecycle and “active listening”

There is **no per-session process**. A session is Postgres state. “Listening” is a webhook handler
and a DB index, not a running agent.

The states are the ones in [`agentic-review-sessions.md`](agentic-review-sessions.md) §2 and
`pr_sessions.state` in [`data-model.md`](../../architecture/data-model.md):

```
created → active (a turn is executing) ⇄ waiting_for_user (no compute) → resolved
                                         │
any state ── PR merged/closed ──► archived (read-only; retained per policy)
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
4. *(v1.1.)* If a branch/T2 review is active and the PR head changed: update the graph delta, mark affected
   findings `needs_recheck`, answer the comment, do a focused recheck, and offer a branch review
   rather than silently running one.

### Stalled sessions (proposed)

A bot question with no answer is worse than no question. The session is not a process, but it still
needs an owner:

- After **7 days** in `waiting_for_user` with no human reply, the session is summarized, flagged
  `needs human` in the inbox, and included in the weekly digest. One short nudge comment is allowed;
  the bot does not repeat it.
- A session is **never archived while its PR is open**, however long it waits: waiting costs no
  compute, and archiving an open PR's session would make a late reply look like a fresh start. After
  **30 days** in `waiting_for_user`, the session is marked `needs human` with a reason and drops out
  of the default inbox view. It is archived only when the PR is merged or closed (§2), and nothing is
  deleted silently.
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
| Open sessions | soft 500 | soft 500 | owner override |
| Turns per session per generation (hard) | 40 (ADR-0024) | 40 | 1–40 (tighten only) |
| Agent replies per thread (hard) | 6 (ADR-0024) | 6 | 1–6 (tighten only) |
| Reply turns per user per hour per installation (hard) | 10 (ADR-0024) | 10 | 1–10 (tighten only) |
| Turns per session (soft quota: a warning in the UI, no stop) | 20 (ADR-0015) | 20 | 1–40 |
| Consecutive agent turns without a human event (automatic re-reviews on push) | 3 (ADR-0015) | 3 | 1–3 (tighten only) |

ADR-0015 and ADR-0024 both set numbers. They are read together (Q-050): ADR-0024's are hard
ceilings that stop with a hand-off; ADR-0015's 20 is a soft quota that only warns, and its "3
consecutive agent turns" stops automatic turns (v1 re-reviews on push) until a human comments,
triggers, or resolves.

- Personal installations get the defaults; the owner tunes concurrency, budgets, visibility, and
  policy (an admin role is v1.2). Repo config can only **tighten** a budget or cap, never loosen it
  (technical-approach §14). The ADR-0024 budgets are ceilings: reaching one posts a single "handing
  this to a human" message and stops.
- No hard cap on open sessions by default. A soft warning at 500/org with an owner override avoids
  blocking real PRs while surfacing abuse.
- The scheduler is fair per org and prioritises human replies > manual review > automatic review >
  branch review > indexing.
- Worker concurrency is auto-sized at install from CPU/memory, then configurable.
- Provider limits are per provider/model; one slow provider must not block another.

## 4. Roles, participants, and mentions

**User-first:** a personal install works without an org. If the app is installed on an org, an org
member who can read the repo can see the session (v1) without configuration rights; only
configuration is owner-only in v1. A session belongs to the **PR**, not to the user who triggered it.

- **Participants:** the PR author, commenters, mentioned users, and repo maintainers who join. The
  trigger user is recorded for audit.
- **Mentions:** `@jury-forge` from a user with repo write access asks the bot a question — a reply
  turn in the existing session, never a review (ADR-0013, ADR-0024 §1). `@human` asks a human to join. The bot does not
  answer on a human’s behalf. It can acknowledge the mention, pull the relevant context, and wait
  for the human. GitHub already sends the human a notification.
- **Tie to org/user:** if the app is installed on an org, the session is org-visible (subject to
  repo access). If installed on a personal account, it is visible to the owner and repo
  collaborators.

### Role mapping

**v1 (ADR-0023, ADR-0028).** Who may start a turn is ADR-0024 §1 and is not widened by any role:

| v1 role | Basis | Sees sessions in the UI | The bot answers their replies | Can trigger a review | Can configure |
| ------- | ----- | :---------------------: | ----------------------------- | :------------------: | :-----------: |
| Owner | The account that claimed the instance (first-run-setup Stage 3) | ✓ all | ✓ | ✓ | ✓ |
| Maintainer | Repo write/maintain/admin on GitHub | ✓ repos they can write | ✓ | ✓ | — (resolution rights per ADR-0028) |
| Reader | Repo read on GitHub | ✓ repos they can read | Only as the PR author, on its own PR's Jury Forge threads | — | — |

The MVP has only the owner. The full role model below is **v1.2**.

| Product role | GitHub basis | Can view | Can reply | Can trigger | Can configure |
| ------------ | ------------ | :------: | :-------: | :---------: | :-----------: |
| Owner | installation owner / org owner | ✓ | ✓ | ✓ | ✓ |
| Admin | repo/org admin | ✓ | ✓ | ✓ | ✓ |
| Maintainer | repo write / maintain | ✓ | ✓ | ✓ | repo policy only |
| Member | org member with repo read | ✓ | ADR-0024: only as the PR author on its own threads | — | — |
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
  `GET /repos/{owner}/{repo}` with the user token to decide. Cache the result briefly. The GitHub
  user token is stored envelope-encrypted, never returned, and refreshed or revoked with the
  session (technical-approach §3.9).
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

Price sources, their order, `pricingSource`, and manual overrides are defined once, in
[`provider-model-discovery.md`](provider-model-discovery.md) §6; this spec does not repeat them. A
turn always has a token ceiling; a currency ceiling applies only when the price is known.

## 6. Personal vs org defaults

- **Personal install:** app installed on a personal account; owner + collaborators; defaults for
  concurrency/budgets; no org policy.
- **Org install:** the owner tunes concurrency, budgets, auto-review policy, visibility, and agent
  defaults (an admin role and per-repo provider allowlists are v1.2). Repo config can only tighten. Personal preferences (default agents,
  notifications) stay user-level.

## 7. Acceptance criteria

Each criterion carries its tier; only MVP criteria are part of the G1 script.

- [ ] (MVP) The website shows sessions, the reviewer, providers, audit, and cost to the owner; GitHub
      remains the primary conversation surface. (v1) Policy and roles.
- [ ] (MVP) A session open for a week resumes instantly from a reply with no warm process.
- [ ] (MVP) A human reply is prioritised over automatic review in the queue. (v1.1) And over indexing and branch review.
- [ ] (MVP) The ADR-0024 budgets (40 turns per session per generation, 6 replies per thread, 10
      reply turns per user per hour) stop with one hand-off message; repo config cannot raise them.
- [ ] (v1) After 3 consecutive automatic turns with no human event, no further automatic turn runs
      until a human comments, triggers, or resolves (ADR-0015).
- [ ] (v1) A user with repo read can see the session; without repo read, they cannot.
- [ ] (v1) A repo write user can trigger and gets answers; a reader gets answers only as the PR author
      on its own threads; only the owner can configure.
- [ ] (MVP) `@human` mentions notify the human; the bot does not impersonate them; it can provide context
      and wait.
- [ ] (v1) The owner can tune concurrent turns, budgets, visibility, and auto policy.
- [ ] (v1) A session in `waiting_for_user` for 30 days on an open PR is marked `needs human` and is
      not archived; it is archived only when the PR closes.
- [ ] (MVP) Unknown pricing enforces token budgets (pricing itself is tested in
      provider-model-discovery).
- [ ] (v1.1) Branch review compares the PR branch to the repository default branch, reviews the full branch delta against context, and is not a full-repo audit.

## 8. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| SC-01 | Can a repo restrict org-wide visibility? | Yes, later; org-wide default. |
| SC-02 | ~~Can any org member with repo read reply, or only write?~~ | **Closed by ADR-0024 §1:** anyone can comment in GitHub; the bot answers repo write users, and the PR author on its own threads; everyone else is stored as context. |
| SC-03 | Do we show a session to a mentioned external collaborator who is not an org member? | Only if they have repo access. |
| SC-04 | Are budgets per org, per repo, or both? | Both; org default + repo override. |
| SC-05 | Do we allow price overrides for known models? | Yes, owner-only, audited, with a warning (provider-model-discovery §6). |
