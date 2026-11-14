# Spec: v1 UI scope

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + frontend
- Related: ADR-0015 (interface), ADR-0016 (reviewer studio)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Principle

**GitHub is the conversation. The website is the control plane and the deep view.**

V1 does not need to be a full code-review IDE. It needs to make setup, sessions, reviewers,
bindings, providers, and audit explainable. The diff itself can link to GitHub.

## V1 pages

| Page | What it does | Required in v1 |
| ---- | ------------ | :------------: |
| **Setup** | GitHub App install, claim, provider onboarding, first reviewer/binding | ✓ |
| **Overview** | Readiness, active sessions, waiting-on-user, recent failures, cost | ✓ |
| **Sessions** | Inbox/list with filters (repo, state, author, agent, waiting) | ✓ |
| **Session detail** | Timeline, messages, agent runs, tool calls, findings, resolve/reopen override, link to GitHub, cost | ✓ |
| **Reviewers** | Catalog list, status, owner, capabilities, bound repos | ✓ |
| **Reviewer editor** | Create/edit stepper: basics, capabilities, model, instructions, tools, knowledge, availability, test/activate | ✓ |
| **Repositories** | List, bindings (required/optional, scopes), no enable toggle, no-reviewer status | ✓ |
| **Providers** | Add/verify/refresh, model catalog (context/price/capabilities), status/key rotation | ✓ |
| **Settings** | Org defaults: capacity, budgets, visibility, roles, retention | ✓ |
| **Audit** | Triggers, bindings, approvals, resolutions, provider changes, exports | ✓ |
| **Knowledge** | Packs/doc links, versions, grants, preview retrieval | v1.1 |
| **Analytics** | Agent scorecards, acceptance, cost trends | v1.2 |

## Session detail (the core screen)

- Header: repo, PR, mode (`pr-review`/`branch-review`), state, generation, participants, labels.
- Timeline:
  - trigger and actor,
  - agent selection (ran/skipped/why),
  - tool calls (name, target, duration, result summary),
  - findings (severity, file/line, evidence, confidence),
  - agent replies and human replies,
  - resolution / override / reopen, with actor and reason.
- Actions: reply, ask a follow-up, pause, retrigger, run branch review, resolve/reopen (role-gated),
  link to GitHub thread.
- Cost strip: tokens in/out/cache, model, provider, estimated vs actual cost.
- Knowledge strip: sources used, hashes, dropped/withheld (v1.1).
- “View on GitHub” deep link.

No inline commenting from the website in v1; the conversation lives in GitHub. The website is a
read/act surface for the session, not a second comment editor.

## Reviewer editor

The stepper in [`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md#22-reviewer-creation-screen):

1. Basics
2. Capabilities (tag chips + label preview)
3. Model (catalog + endpoint)
4. Instructions/rules
5. Tools/sandbox
6. Knowledge (v1.1)
7. Availability (optional binding)
8. Test & activate

## Repositories

- No enable/disable toggle for agentic review.
- Show binding status: which reviewers are required/optional, scopes, and whether the repo has any
  reviewers at all.
- “No reviewers configured” badge, with a link to bind.
- “Preview jury” for a sample PR (which reviewers would run and why).
- Repo policy/config-as-code view.

## Providers

- Add provider: kind, base URL, key.
- Verify → fetch `/models` → show catalog.
- Model table: ID, context, max output, endpoint(s), price, capabilities, source, status.
- Refresh/deprecate; affected reviewers.
- Key: set/replace/rotate/delete, never reveal; health/last error.
- Pricing source/date; manual override for custom models (audited).

## Navigation and accessibility

- Sidebar at `lg`, top bar + slide-over below (carry the PoC shell).
- Dark-first with light/system toggle.
- Semantic tokens, 44 px targets, focus rings, reduced motion.
- Every screen: loading, empty, error, data.
- Human error copy from the shared taxonomy; no machine codes.
- Command palette (Cmd/Ctrl+K) for navigation and actions.
- Sticky save bars and unsaved-changes guards.

## Deferred beyond v1

- Full in-app diff viewer with inline commenting.
- Editing a review before publish.
- Advanced analytics/scorecards.
- Knowledge retrieval preview UI.
- Slack/email/Teams notifications.
- SSO/OIDC; GitHub OAuth only in v1.
- Multi-forge.
- Agent marketplace.
- Mobile-native app.

## Acceptance criteria

- [ ] A new operator can install, add a provider, create a reviewer, bind it to a repo, and trigger a
      PR review without touching the database.
- [ ] The session inbox shows active/waiting/failed sessions and links to GitHub.
- [ ] Session detail shows the trigger, agent selection, tool calls, findings, replies, resolution,
      and cost.
- [ ] Reviewer editor covers capabilities, catalog model/endpoint, tools, knowledge (v1.1), and
      availability.
- [ ] Repositories shows bindings and a no-reviewers state; no enable/disable toggle.
- [ ] Providers shows the model catalog and pricing source; no free-text model.
- [ ] Admin can override a resolution/reopen with a reason; the action is audited.
- [ ] All screens are usable at 320 px and pass the accessibility harness.
- [ ] No screen prints a machine error code.

## Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| Q-054 | Do we need a full diff viewer in v1? | No; link to GitHub; add later. |
| Q-055 | Can users reply from the website in v1? | Yes, via GitHub API; same thread. |
| Q-056 | Do we show cost in v1? | Yes, if pricing is known; otherwise token counts. |
| Q-057 | Do we ship a command palette? | Yes, if cheap; not a blocker. |
| Q-058 | Do we build analytics in v1? | No; basic session list only. |
