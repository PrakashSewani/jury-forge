# ADR-0016: Reviewer catalog, repo bindings, SME roles, and fallback

- Status: proposed
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

- A **reviewer catalog** is org-level: identity, versions, domain/tags, owner (SME), provider/model/
  endpoint, tools, status.
- A **repo binding** is required for a reviewer to run on a repo. Binding fields: requirement
  (`required`/`optional`), path/language/label scopes, context paths, priority, budget, enabled.
- No binding = not available. Required reviewers must run; optional only when scope matches.
- **Required reviewer unavailable blocks the review** with a configuration fallback (no partial or
  clean review). Optional unavailable is noted and the rest run.
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

- `jury:pr-review` — PR review: the repo’s bound jury reviews the PR diff + targeted context.
- `jury:branch-review` — complete branch review: compare the PR branch to the **repository default branch**, review the full branch delta against the repo context graph; static functional/behavioral impact, no code execution in v1.
- Check Run actions (`PR review`, `Branch review`) — same turns.
- Slash commands — fallback/specific reviewers (for example `/jury pr-review security,testing`).
- Labels are **modes**, not reviewer selectors. Reviewers come from repo bindings; no domain labels.
- Reviewer picker is not available to arbitrary GitHub Apps (tested 2026-11-15).

### Fallback

- No bindings → issue comment: “no reviewers configured”, how to configure, how to retrigger. No
  review, no resolution.
- Bindings but no scope match → comment listing configured scopes and changed files. No review.
- Required reviewer unavailable → comment naming the reviewer and the fix. No review.
- Optional unavailable → run, note the skip.
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
