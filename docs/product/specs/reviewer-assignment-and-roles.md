# Spec: Reviewer catalog, repo bindings, roles, and fallback

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + platform + security
- Related: ADR-0013 (trigger/routing), ADR-0016 (reviewer catalog/bindings)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Owner directives

- Reviewers are **specific to repositories**. Not every reviewer is available everywhere.
- **Admins set reviewers** for a repo.
- Personal install: the installer is the admin.
- Org install: roles are needed, including **SMEs (subject matter experts)** and other roles.
- If no reviewers are set, Jury Forge **comments that no reviewers are configured**, tells the user
  to set reviewers for the repo, and asks them to retrigger. It must not post a normal “clean”
  review or silently do nothing.

## 1. Terminology

| Term | Meaning |
| ---- | ------- |
| **Reviewer** | The user-facing name for an AI review agent (security, testing, backend, docs, custom). |
| **Reviewer version** | An immutable configuration: instructions, rules, provider/model/endpoint, tools, scope, output schema. |
| **Reviewer catalog** | The org-level set of reviewer definitions and versions. |
| **SME** | A human subject matter expert who owns/curates reviewers in a domain (security, data, frontend, infra, etc.). |
| **Repo binding** | The configuration that makes a catalog reviewer available on one repository, with required/optional, scope, and budget. |
| **Default jury** | The reviewers a `jury:pr-review` label runs for a repo: required reviewers + optional reviewers whose scope matches. |
| **Fallback** | The comment posted when no reviewer can run, explaining why and how to fix/retrigger. |

## 2. Reviewer catalog (org-level)

A reviewer is created once, versioned, and then bound to repos.

- Fields: name, slug, domain/tags, description, owner (SME), instructions, rules, provider/model/
  endpoint (catalog only), tools, output schema, default budget, status (`draft`/`approved`/
  `archived`).
- Versions are immutable once active. A draft can be edited; activation requires approval
  (admin for org-wide, owner for personal).
- **Approval:** an SME can draft/own a reviewer in their domain; an admin approves it for the org
  catalog. A repo maintainer can only bind **approved** reviewers.
- **Ownership:** every reviewer has an owner (SME or admin). Ownership can be transferred; archived
  reviewers cannot be bound to new repos.
- **Test before bind:** a reviewer can be tried on a PR with no publish (the PoC’s try-run concept),
  and the result is visible to the owner/admin.
- **No free-text model:** the reviewer binds to a provider catalog model + supported endpoint.

## 3. Repo bindings (the important part)

A reviewer is **not available on a repo** unless there is an enabled binding.

`repo_reviewer_bindings`:

| Field | Meaning |
| ----- | ------- |
| `repo_id` | GitHub repository |
| `reviewer_id` / `reviewer_version_id` | Catalog reviewer; pin or latest-approved |
| `enabled` | Hard on/off |
| `requirement` | `required` / `optional` |
| `priority` | Order/weight for the chair |
| `paths_include` / `paths_exclude` | Path globs this reviewer covers |
| `context_paths` | Read-only reference files/folders |
| `languages` | Optional language filter |
| `labels` | Optional PR-label filter |
| `budget` | Per-reviewer token/cost cap (optional) |
| `created_by`, `updated_at` | Audit |

Rules:

- **No binding = not available.** A reviewer in the catalog is not automatically used.
- **Required** reviewers always run when a review runs, subject to availability. If a required
  reviewer is unavailable, the run **stops before reviewing** and posts a configuration notice
  (never a misleading “clean” review).
- **Optional** reviewers run only when their path/language/label scope matches the PR.
- **Disabled** bindings are skipped and listed in the notice.
- A reviewer with path filters but no matching changed file is skipped with a reason.
- A repo can have a **default jury**: required reviewers + matching optional reviewers.
- Bindings are versioned; a policy change is audited and can trigger a re-evaluation on the next
  trigger (not automatically on every open PR).
- Repo config-as-code (`.jury-forge.yml`) can declare the same bindings; the UI writes it. The
  source of truth is one of them, not both silently diverging.

### Precedence

1. Explicit reviewer request (`/jury pr-review security,testing`, or UI selection).
2. Repo binding (required/optional, scope).
3. Org default reviewer policy.
4. No match → fallback notice.

## 4. Roles and permissions

| Role | Scope | Can |
| ---- | ----- | --- |
| **Owner** | org / personal install | Everything, including providers, billing, delete, transfer ownership |
| **Admin** | org / repo | Providers/models, org policy, budgets, visibility, approve reviewer catalog, manage bindings/roles |
| **SME** | domain + assigned repos | Create/edit/test/version reviewers in their domain; own/curate reviewers; bind their domain reviewers to assigned repos; not providers/billing |
| **Maintainer** | repo write | Trigger, reply, branch review, request reviewers; bind approved reviewers only if the org enables maintainer binding |
| **Member** | repo read (org member) | View sessions; reply where GitHub permits |
| **Viewer** | repo read | Read-only |
| **Auditor** | org | Audit/export, no configuration |

- **Personal install:** the installer is Owner + Admin; collaborators are Maintainer/Member/Viewer.
  No SME role is required, but an owner can grant it.
- **Org install:** Owner/Admin seed providers and the reviewer catalog; SMEs own domain reviewers;
  maintainers bind approved reviewers to their repos; members see the process.
- **Admin-only:** provider keys, model allowlist, budgets, visibility, reviewer approval, role
  changes.
- **SME:** domain authority, not billing/provider authority.
- **Maintainer:** can choose from the approved catalog and request bindings, but cannot create an org-wide reviewer. Binding is admin/SME by default; `allowMaintainerBindings` can enable it.
- Every binding/role/approval change is audited.

### Domain examples

Security, Architecture, Backend, Frontend, Performance, Testing, Documentation, Database, Infra,
Accessibility, Custom. Domains are **catalog metadata/tags** for organization, search, and SME
ownership. They are not GitHub labels; labels are only review modes.

## 5. Triggers and the default jury

### Labels (primary, as requested)

- `jury:pr-review` — PR review: the repo’s bound jury reviews the PR diff + targeted context.
- `jury:branch-review` — complete branch review: compare the PR branch to the **repository default branch**, review the full branch delta against the repo context graph (no code execution in v1).
- Labels are **modes, not reviewer selectors**. The repo bindings decide which reviewers run;
  specific reviewers are requested via slash command/UI (for example `/jury pr-review security,testing`).
- The app creates these two labels on install (or documents them); labels are not a per-repo enable
  toggle, they are a trigger.

### Check Run (also primary)

A neutral `Jury Forge` check with actions `PR review` and `Branch review`; clicking starts the same
turn. Reviewer selection comes from repo bindings; specific reviewers via slash command/UI.

### Slash command (fallback)

`/jury pr-review`, `/jury pr-review security,testing`, `/jury branch-review`, `/jury status`, `/jury pause`,
`/jury resolve`, `/jury reopen`.

## 6. Availability resolution

For a trigger, the router computes:

```
requested = explicit domains/agents ∪ repo default
required  = bindings with requirement=required
optional  = bindings with requirement=optional and scope matches
```

Availability checks per reviewer:

1. Binding enabled.
2. Reviewer version approved/active.
3. Provider enabled, key present, model in catalog, endpoint supported.
4. Budget available.
5. At least one changed file matches the path/language/label scope (optional reviewers).
6. Reviewer not archived/deleted.

Outcomes:

- **All good:** run the selected reviewers.
- **No bindings at all:** post the **no-reviewers fallback**; do not run, do not post a review.
- **Bindings exist but none match this PR:** post a **no-match fallback** listing configured
  reviewers, their scopes, and the changed files; do not post a normal review.
- **A required reviewer is unavailable:** post a **required-unavailable fallback**; do not run the
  review (or run nothing) to avoid a misleading verdict. Admin can override to run optional only.
- **Optional reviewer unavailable:** run the rest; note the skipped reviewer in the review.
- **Budget exhausted:** post a budget notice; do not run the over-budget reviewer; required budget
  exhaustion blocks.

## 7. Fallback comments

Fallbacks are **issue comments**, not reviews: no inline comments, no resolution, no “clean” verdict.
Use a hidden marker so the app can update the same comment instead of spamming.

### No reviewers configured

```md
## Jury Forge — no reviewers configured

Jury Forge is installed on this repository, but no reviewers are enabled for it yet, so no review
was run.

**For an admin:** open **Jury Forge → Repositories → <repo>** and enable at least one reviewer.
**Then retrigger:** remove and re-add the `jury:pr-review` label, click **Review** on the Jury Forge
check, or comment `/jury pr-review`.
```

### No reviewer matched this change

```md
## Jury Forge — no reviewer matched this change

No configured reviewer matched the files in this PR, so no review was run.

Configured:
- Security — `src/auth/**`, `src/api/**`
- Testing — `**/*.test.*`, `src/**`

This PR touched: `docs/...`, `README.md`.

An admin can adjust the path scopes in **Repositories → <repo>**, then retrigger.
```

### Required reviewer unavailable

```md
## Jury Forge — required reviewer unavailable

The required reviewer **Security** cannot run (no model key / model missing / provider disabled).
The review was not run, because a partial verdict would be misleading.

Fix the reviewer/provider, then retrigger with `jury:pr-review` or the Review button.
```

Rules:

- One fallback comment per PR/policy version; update it rather than posting repeatedly.
- Fallbacks are skipped if the PR is from a fork and policy says no comments on forks.
- Fallbacks are audited; no session resolution.
- A policy change bumps `policy_version`; the next trigger may post a fresh fallback.
- Notify repo admins/SMEs in the UI (not spam in the PR) when a repo has no bindings.

## 8. Personal vs org setup

### Personal install

1. Install app on personal account.
2. Add provider key → model catalog.
3. Create a reviewer from a template (or blank), bind it to selected repos.
4. Installer is Owner/Admin; collaborators are Maintainer/Member/Viewer.
5. First trigger with no binding → fallback comment; then configure and retrigger.

### Org install

1. Owner/Admin adds providers, model allowlist, org budgets.
2. Admin seeds the reviewer catalog (or SMEs draft).
3. SMEs own domain reviewers; admin approves.
4. Maintainers bind approved reviewers to their repos (required/optional/scopes).
5. Members see sessions; auditors export.
6. Repo config-as-code can override for teams that want it in git.

## 9. Data model additions

- `reviewer_catalog` / `reviewer_versions` (org-level; owner, domain, status).
- `repo_reviewer_bindings` (repo, reviewer, requirement, scopes, budget).
- `repo_reviewer_policy` (default jury, min required, fallback mode, policy version).
- `reviewer_domains` (security/testing/frontend/...).
- `reviewer_approvals` (who approved which version, when).
- `role_bindings` (user/group, role, scope: org/repo/domain).
- `fallback_comments` (PR, policy version, comment id, reason) for dedupe/update.
- `session_participants` (with role/mention).

## 10. Acceptance criteria

- [ ] A reviewer exists in the catalog but is not used on a repo without a binding.
- [ ] An admin/SME can bind a reviewer with required/optional and path/language/label scopes; the
      change is audited. A maintainer can bind only when `allowMaintainerBindings` is on.
- [ ] `jury:pr-review` runs the repo’s bound jury (required + matching optional reviewers).
- [ ] `jury:branch-review` runs a complete branch review against the repo context graph.
- [ ] No bindings → fallback comment with setup/retrigger instructions; no review posted.
- [ ] Bindings but no match → fallback listing scopes and changed files; no review posted.
- [ ] Required reviewer unavailable → fallback; no partial/clean review.
- [ ] Optional reviewer unavailable → review runs, note explains the skip.
- [ ] SME can own/draft a domain reviewer; admin approves; maintainer can bind only approved.
- [ ] Personal install: installer is owner/admin; no org roles required.
- [ ] Org member with repo read sees the session; viewer cannot configure; auditor can export.
- [ ] Fallback comments dedupe/update by policy version.
- [ ] A retrigger after configuration runs the review.

## 11. Additional ideas

- Reviewer catalog templates by domain; SMEs can clone.
- “Reviewer requested” label/check, no reviewer picker.
- Reviewer health banner (key/model/provider) in Repositories.
- “Preview jury” before saving: which reviewers would run for a sample PR.
- “Why this reviewer?” explanation in the session.
- Required-reviewer policy: block the review if a required domain is unavailable.
- Per-repo min/max reviewers and budget.
- Notify admins when a repo has no bindings or a required reviewer is broken.
- Reviewer ownership transfer and archive.
- Review-mode labels only (`jury:pr-review`, `jury:branch-review`); reviewer domains are catalog metadata, not labels.
- A “default general reviewer” for personal installs, but still requires a binding.
- A repo onboarding checklist in the UI: provider → reviewer → binding → trigger.

## 12. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| Q-040 | Can maintainers create reviewers, or only bind approved ones? | Bind approved only; SMEs create. |
| Q-041 | Can an SME bind reviewers to repos they don't maintain? | Only assigned repos/domains. |
| Q-042 | Required reviewer unavailable: block or run optional? | Block the review; config fallback. |
| Q-044 | Who approves a reviewer: admin only, or SME + admin? | SME drafts; admin approves. |
| Q-045 | Fallback comment on forks? | Policy-controlled; default skip comments on forks. |
