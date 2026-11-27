# Spec: v1 UI scope

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + frontend
- Related: ADR-0015 (interface), ADR-0023 (direction), [`jury-output.md`](jury-output.md),
  [`review-progress-and-completion.md`](review-progress-and-completion.md)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Principle

**GitHub is the conversation. The website is the control plane and the deep view.**

V1 does not need to be a full code-review IDE, and it does not need to be a platform console. It
needs to make setup, sessions, the three reviewers, providers, receipts, and audit explainable. The
diff itself can link to GitHub.

## V1 pages (the trust loop)

| Page | What it does | v1 |
| ---- | ------------ | :-: |
| **Setup** | Origin, GitHub App, claim, provider, default jury, first review | ✓ |
| **Overview** | Readiness, active/waiting sessions, recent failures, cost, review receipts | ✓ |
| **Sessions** | Inbox/list with filters (repo, state, author, reviewer, waiting) | ✓ |
| **Session detail** | Timeline, jury panel, receipt, findings, resolve/reopen, link to GitHub, cost | ✓ |
| **Reviewers** | The three built-in reviewers (Security, Correctness, Tests); edit instructions/model; status | ✓ |
| **Repositories** | Bind the three reviewers, path scopes, no-reviewer status; no enable toggle | ✓ |
| **Providers** | Add/verify/refresh, model catalog, key rotation, health | ✓ |
| **Settings** | Caps, retention, verdict policy, workspace name; three roles | ✓ |
| **Audit** | Triggers, turns, model calls, receipts, resolutions, overrides, exports | ✓ |
| **Memory** | Repo suppressions and human-confirmed facts: view, edit, expire, purge (S4) | ✓ |
| **Egress preview** | Exact redacted payload for a repo before the first provider call | ✓ |
| **Scorecard** | Simple per-juror and per-rule table: posted, accepted, wrong, appealed | ✓ |
| **Capabilities** | Capability registry, labels, SME/admin approval | v1.x |
| **Reviewer studio** | Full 8-step create/approve/version flow | v1.x |
| **Knowledge** | Packs/doc links, grants, retrieval preview | v1.x |
| **Analytics** | Advanced scorecards, acceptance, cost trends | v1.2 |

## Session detail (the core screen)

- Header: repo, PR, mode (`pr-review`), state, generation, participants, labels.
- **Progress strip:** the same state as the Check Run (`queued` / `in progress` / `completed` /
  `failed` / `cancelled`), with the elapsed time and the current phase. It is the live view of the
  Check Run, not a second status.
- Timeline:
  - trigger and actor,
  - reviewer selection (ran/skipped/why),
  - tool calls (name, target, duration, result summary),
  - findings (severity, file/line, evidence, reviewer, model, confidence),
  - agent replies and human replies,
  - resolution / override / reopen, with actor and reason.
- **Jury panel:** composition, deliberation (merged duplicates, disagreements), chair rule and
  verdict, per-finding provenance; see [`jury-output.md`](jury-output.md).
- **Receipt panel:** provider, model, tokens, redactions, withheld files, coverage manifest, verifier
  counts, chair rules, suppressions, preset/estimate, signature status; download JSON; link from the
  PR review.
- **Appeals and rechecks:** appeal outcomes and "verified fixed" events in the timeline.
- Actions: reply, ask a follow-up, pause, retrigger, resolve/reopen via the UI (role-gated), link to
  GitHub thread. `suggest` is the default: the agent proposes, the human resolves natively/UI;
  `auto` is opt-in. No slash commands.
- Cost strip: tokens in/out/cache, model, provider, estimated vs actual cost.
- “View on GitHub” deep link.

No inline commenting from the website in v1; the conversation lives in GitHub. The website is a
read/act surface for the session, not a second comment editor. If UI replies are enabled (UI-02),
they post to the **same GitHub thread** through the API and the UI shows the GitHub record; the
website never becomes a separate conversation store.

## Reviewers (v1)

V1 has **three built-in reviewers**: Security, Correctness, Tests. The page is a simple editor, not
the studio:

- name, description, status (active/draft);
- provider + model (catalog only, no free text);
- instructions and rules;
- default budget (tokens);
- version + last edited by;
- “Try on a PR” (no publish).

The full 8-step studio (capabilities, knowledge, tools, availability, approval) is v1.x and lives in
[`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md#22-reviewer-creation-screen).

## Repositories (v1)

- No enable/disable toggle for agentic review; the binding is the enablement.
- Bind the three built-in reviewers with a simple `required`/`default` selection and optional path
  includes/excludes.
- Show “no reviewers bound” with a link to bind and a one-click **Bind default jury** action.
- “Preview jury” for a sample PR (which reviewers would run and why).
- Repo policy/config-as-code view (read-only if the file is present).

## Providers (v1)

- Add provider: kind, base URL, key.
- Verify → fetch `/models` → show catalog.
- Model table: ID, context, max output, endpoint(s), price, capabilities, source, status.
- Refresh/deprecate; affected reviewers.
- Key: set/replace/rotate/delete, never reveal; health/last error.
- Pricing source/date; manual override for custom models (audited).

## Settings (v1)

- Per-turn token/tool/wall-clock caps; session/repo/installation/requester budgets.
- Retention for sessions, messages, raw responses (defaults 30 d raw / 1 y findings and receipts).
- Verdict policy: advisory default; check/request-changes opt-in; Check Run merge-gate policy.
- Model roles: `reasoning` and `fast`; default preset.
- Workspace name, origin, GitHub App status.
- Roles: owner, maintainer, reader.

## Navigation and accessibility

- Sidebar at `lg`, top bar + slide-over below (carry the PoC shell).
- Dark-first with light/system toggle.
- Semantic tokens, 44 px targets, focus rings, reduced motion.
- Every screen: loading, empty, error, data.
- Human error copy from the shared taxonomy; no machine codes.
- Command palette (Cmd/Ctrl+K) for navigation and actions.
- Sticky save bars and unsaved-changes guards.

## Deferred beyond v1

- Capability registry, `jury:cap:*` labels, SME/admin/viewer/auditor roles.
- Full reviewer studio: catalog, approval, versioning workflow, knowledge, tools/sandbox.
- Knowledge packs, doc links, retrieval preview.
- Repository graph and branch review UI.
- Advanced analytics/scorecards.
- Full in-app diff viewer with inline commenting.
- Editing a review before publish.
- Slack/email/Teams notifications.
- SSO/OIDC; GitHub OAuth only in v1.
- Multi-forge.
- Agent marketplace.
- Mobile-native app.

## Acceptance criteria

- [ ] A new operator can install, add a provider, accept the default jury, bind it to a repo, and
      trigger a PR review without touching the database.
- [ ] The overview shows readiness, active/waiting sessions, failures, cost, and recent receipts.
- [ ] The session inbox shows active/waiting/failed sessions and links to GitHub.
- [ ] Session detail shows the progress strip, trigger, reviewer selection, tool calls, findings,
      replies, resolution, cost, the jury composition/dissent, and the receipt.
- [ ] The reviewers page edits the three built-ins (model, instructions, budget) with no free-text
      model.
- [ ] Repositories shows the three bindings and a no-reviewers state with **Bind default jury**; no
      enable/disable toggle.
- [ ] Providers shows the model catalog and pricing source; no free-text model.
- [ ] Owner/maintainer can accept, dismiss, or reopen a finding with a reason; only the owner can
      dismiss or resolve a `critical` finding (ADR-0028); every action is audited.
- [ ] All screens are usable at 320 px and pass the accessibility harness.
- [ ] No screen prints a machine error code.

## Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| UI-01 | Do we need a full diff viewer in v1? | No; link to GitHub; add later. |
| UI-02 | Can users reply from the website in v1? | Yes, via GitHub API; same thread. |
| UI-03 | Do we show cost in v1? | Yes, if pricing is known; otherwise token counts. |
| UI-04 | Do we ship a command palette? | Yes, if cheap; not a blocker. |
| UI-05 | Do we build analytics in v1? | No; the session list and receipt are enough. |
