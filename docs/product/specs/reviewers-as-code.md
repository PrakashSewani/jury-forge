# Spec: Reviewers-as-code (B-05)

- Status: draft — backlog, not committed (see `capabilities.md` §13)
- Owner: product + security
- Date: 2026-11-15
- Principles: 3 (prompt is not a boundary), 7, 9 (one vocabulary), 12 (documentation as product),
  15 (discover models, don't type them)
- Related ADRs: ADR-0008, ADR-0011, ADR-0013, ADR-0016 (catalog and approval)
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Problem

Reviewer prompts and bindings decide what code review means for a team. Managing them only in a UI
means changes are not reviewed like code, are hard to diff, and are not reproducible across a
rebuilt instance. Teams that already govern infrastructure in git expect the same here. The
catalog's approval flow (ADR-0016) must not be bypassed by a git push.

## Users and jobs

- **P1 Platform engineer:** "Keep reviewer definitions in git and rebuild an instance from it."
- **P2 Security lead:** "Reviewer prompt changes go through pull-request review with four-eyes."
- **P6 Auditor:** "Show exactly which commit defined the reviewer that produced this review."

## Behaviour

1. **Export (always available):** any admin/SME can export reviewer definitions, versions, repo
   bindings, scope rules, and policy settings as YAML. Exports contain **no secrets and no keys**;
   models are referenced as `provider + catalog model id`, never free text. A binding carries
   `selection: required | default | capability` and (for capability) capability IDs, never a
   free-text capability name.
2. **Git-managed mode (opt-in per reviewer):** an admin designates a **config repository** and
   branch. A reviewer marked `managed_by: git` is read-only in the UI (which links to the file and
   commit); a UI-managed reviewer is not touched by sync. A reviewer is managed by exactly one source.
3. **Sync:** triggered by a push to the config repo's protected default branch (or a manual "sync
   now"). The sync reads only that branch; content from a PR branch never takes effect.
4. **Validation:** every definition is validated against the instance's model catalog, tool policy,
   and schema. Unknown models, unknown tools, or widened permissions are rejected with a line-level
   error; a failed sync changes nothing (all-or-nothing) and shows the error.
5. **Approval is preserved:** a synced change creates a **draft version** carrying the source
   commit SHA. It becomes active only through the existing catalog approval (SME drafts/owns, admin
   approves; ADR-0016). Bindings that add or widen a reviewer for a repo need admin/SME approval;
   a maintainer may bind only when `allowMaintainerBindings` is on. A `required` binding needs
   admin approval; `default`/`capability` follow the same approval path. Merging in git is not
   approval in the product.
6. **Removal:** deleting a definition in git **deactivates** the reviewer (history kept); it is not
   hard-deleted. Required bindings pointing at it enter `required_unavailable`.
7. **Provenance:** every review snapshot records reviewer version, prompt hash, and the source
   commit SHA, so an auditor can map a posted review to a git commit.
8. **Drift view:** the UI shows whether a git-managed reviewer matches the last sync and when it was
   last synced.

Edge cases:

- Two sources claim the same reviewer name → the sync fails with a conflict error; nothing changes.
- Config repo unreachable → last good state remains; status shows "sync stale" with age.
- A synced file changes a reviewer's model to one that is no longer in the catalog → rejected.
- Revert in git → creates a new draft version; it needs approval like any other.

## Non-goals

- Not syncing users, roles, provider keys, or provider definitions (secrets and trust roots stay in
  the instance).
- Not auto-approval; no "approved by merge".
- Not a general GitOps engine for the whole instance.

## Acceptance criteria

- [ ] Given a push to the config repo's default branch with a valid definition, when synced, then a
      draft version exists with the source SHA and no live behaviour changes before approval.
- [ ] Given a definition referencing a non-catalog model or unknown capability ID, then the whole
      sync is rejected with a line-level error and nothing changes.
- [ ] Given a binding with `selection: capability`, then it runs only when the matching capability
      label or UI selection is present; `required` always runs.
- [ ] Given content only on a PR branch, then it has no effect on the instance.
- [ ] Given a git-managed reviewer, then UI edits are blocked and the UI links to the source.
- [ ] Given a definition deleted in git, then the reviewer is deactivated, history is retained, and
      required bindings show the unavailable fallback.
- [ ] Export contains no key material (verified by a scan test) and re-importing it into a fresh
      instance yields identical definitions.
- [ ] A review snapshot shows the source commit SHA for git-managed reviewers.

## Metrics

Share of reviewers git-managed, sync failures by cause, time from git merge to approved version,
drift incidents.

## Security and privacy

- The config repo is an **input trust boundary**: only the protected default branch is read, with
  the installation's least-privilege read access; its content is validated, never executed.
- Prompt text is operator-authored but still treated as data at runtime (principle 3).
- Sync identity and every state change are audited; approval authority is unchanged, so a compromised
  repo write cannot activate a reviewer by itself.
- Exports and syncs never include secrets; secret-like strings in definitions fail validation.

## Failure modes

Partial sync is impossible (all-or-nothing); malformed YAML shows an error and the previous version
stays active; a webhook miss is covered by the manual sync and a periodic reconcile.

## Rollout

Backlog; target v1.1 if promoted. Requires the reviewer catalog and versioning. Docs: a "reviewers in
git" guide and an example config repository layout.

## Open questions

- RC-01: where do repo bindings live — config repo only, or also per-repo files? Default: config repo
  only for the first cut, to avoid contributors binding reviewers from inside a PR.
- RC-02: how do approvals work for git-managed reviewers beyond a UI click (e.g. a signed approval)?
  Default: UI approval only; revisit after real use.
