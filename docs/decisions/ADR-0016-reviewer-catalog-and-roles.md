# ADR-0016: Reviewer catalog, repo bindings, SME roles, and fallback

- Status: accepted (G0, 2026-11-16; catalog, capability labels, and SME roles ship in v1.2)
- Date: 2026-11-15
- Owners: product + platform + security
- Supersedes: the PoC's opt-out reviewer model and per-repo enablement
- Revisit trigger: first org with >20 reviewers/repos, or a demand for cross-org reviewer sharing.

## Context

The owner wants specific reviewers enabled for specific repositories, configured by admins. Personal
installs are simple (the installer is the admin); org installs need roles, including SMEs. If no
reviewers are configured, the product must comment and ask for configuration + retrigger — never
post a misleading clean review.

## Options

1. **Reviewers apply to every repo (PoC opt-out)** — simple, but violates the owner directive and
   makes scoping/noise hard.
2. **Per-repo enable toggles only** — works, but no catalog, ownership, approval, or domain roles.
3. **Org reviewer catalog + per-repo bindings + roles** — chosen.
4. **Per-repo reviewers only (no catalog)** — duplicate definitions, no SME ownership.
5. **Auto-run default reviewer when none configured** — convenient but hides configuration errors;
   rejected with the owner's fallback requirement.

## Decision

### Catalog and bindings

- A **reviewer catalog** is org-level: identity, versions, capabilities, owner (SME), provider/model/
  endpoint, tools, status.
- A **repo binding** is required for a reviewer to run on a repo. Binding fields: selection
  (`required`/`default`/`capability`), path/language/label scopes, T2 context paths, priority, budget,
  enabled.
- No binding = not available. `required` always runs; `default` runs on a plain review when scope
  matches; `capability` runs only when its capability is requested (label/UI). Required overrides
  capability gating.
- **Required reviewer unavailable blocks the review** with a configuration fallback (no partial or
  clean review). Default/capability unavailable is noted and the rest run.
- Bindings/policies are versioned and audited.

### Roles

- **Owner** — everything, including billing/providers/delete.
- **Admin** — providers/models, org policy, budgets, visibility, approve catalog, manage bindings/
  roles.
- **SME** — domain-scoped reviewer ownership: draft/edit/test/version reviewers in their domain;
  bind their domain reviewers to assigned repos; no provider/billing.
- **Maintainer** — trigger, reply, branch review, request reviewers; bind approved reviewers only
  if the org enables `allowMaintainerBindings` (default off).
- **Member** — repo read; view and reply where GitHub permits.
- **Viewer** — read-only.
- **Auditor** — audit/export.

Personal install: installer is Owner/Admin; collaborators are Maintainer/Member/Viewer. No SME
required.

### Triggers

- `jury:pr-review` — **strict T0 diff-only** PR review: the PR diff/hunks + metadata + thread context; no repository file reads, no graph.
- `jury:branch-review` — complete branch review: compare the PR branch to the repository default branch and review the full branch delta against the repo context graph (T2); static functional/behavioral impact, no code execution in v1/v1.1.
- Check Run actions (`PR review`, `Branch review`) — same turns.
- **No slash commands in PR conversations.** Specific reviewers are selected via the UI picker; capability labels select capability groups.
- **Selection modes:** a repo binding is `required` (always runs), `default` (plain review), or `capability` (only when requested by a `jury:cap:*` label or UI selection). Required overrides capability gating.
- **Capabilities are tenant-scoped first-class objects:** immutable `id`, display name, optional one-level parent, status. Labels are always `jury:cap:<id>`. Built-ins + custom; SME drafts, admin approves. All active capability labels are synced to every installed repo; a request with no bound reviewer gets a capability-specific fallback; disabling leaves the label for history and marks it unavailable.
- A capability label alone defaults to `jury:pr-review`; add `jury:branch-review` for the complete branch comparison.
- Capability labels never enable an unbound reviewer or bypass required reviewers/budgets/provider policy.
- Reviewer picker is not available to arbitrary GitHub Apps (tested 2026-11-15).

### Fallback

- No bindings → issue comment: “no reviewers configured”, how to configure, how to retrigger. No
  review, no resolution.
- Bindings but no scope match → comment listing configured scopes and changed files. No review.
- Required reviewer unavailable → comment naming the reviewer and the fix. No review.
- `default`/`capability` unavailable → run the rest, note the skip.
- Fallback comments are deduped/updated by policy version; no spam.

## Consequences

**Easier:** precise per-repo juries; SME ownership; admins control bindings; maintainers can request/
self-serve only when enabled; no silent clean reviews; personal installs stay simple.

**Harder:** role/scope UX; approval workflow; binding precedence; availability checks; fallback
comment lifecycle; policy versioning; audits; notifications.

**Invariants:** no reviewer runs without a binding; required unavailable blocks; no fallback review
posted as a normal review; all binding/approval/role changes audited; visibility ≤ repo visibility.

## Security and operations

- Only admin/SME (domain) can create/approve reviewers; admin/SME bind by default; maintainer
  binding is opt-in (`allowMaintainerBindings`). Every change audited.
- A reviewer cannot be bound to a repo the actor cannot access.
- Required reviewer failures surface as configuration errors, not silent skips.
- Fallback comments contain no secrets or model details beyond the reviewer name/domain.
- Policy changes bump a version; retrigger is explicit (label/check/command).

## Evidence

- Owner directives, 2026-11-15.
- Spec: [`../product/specs/reviewer-assignment-and-roles.md`](../product/specs/reviewer-assignment-and-roles.md).
- Trigger evidence: [`../reference/sources.md`](../reference/sources.md#provider-catalog-and-github-trigger-spikes-2026-11-15).

## Follow-ups

- Define the exact role/scope schema and authorization matrix tests.
- Build the reviewer catalog/approval UI and repo binding UI.
- Define `.jury-forge.yml` schema for bindings and policy.
- Implement fallback comment dedupe/update and notifications.
- Spike required-unavailable behavior on a test repo.
