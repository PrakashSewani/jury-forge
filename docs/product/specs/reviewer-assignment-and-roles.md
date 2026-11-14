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

## 2.1 Capabilities and tools

A reviewer can be more than a prompt. Its version declares a **tool policy**:

| Tool/capability | What it does | Default |
| --------------- | ------------ | ------- |
| `diff.read` | Read the PR diff/hunks | on |
| `graph.query` | Search symbols, references, tests, ownership | branch review; optional PR |
| `file.read` | Read a file slice at the SHA | on |
| `tests.inspect` | Find tests, coverage, skipped tests | on |
| `static.analyze` | Run/read static analysis results | optional |
| `tests.run` | Run tests in a sandbox | **off**, opt-in per repo |
| `build.run` | Build in a sandbox | **off**, opt-in per repo |

- The **agent decides which tools to use** for its task, within its instructions, budget, and the
  repo’s policy. A “Capability reviewer” can inspect contracts, callers, and tests; if `tests.run`
  is enabled, it can run the relevant tests and include the result as evidence.
- `tests.run`/`build.run` are **not** implied by branch review. They require an opt-in repo policy,
  a sandbox, and a resource budget.
- Sandbox rules: ephemeral container, non-root, no secrets, network off by default, CPU/memory/time
  caps, command allowlist, no push/merge, output captured and redacted. Untrusted repo code is
  never run on the host.
- A tool result is evidence, not an instruction; findings can cite it, but the agent still grounds
  the claim in code.
- Tool calls and results are recorded in the turn timeline.

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

- `jury:pr-review` — PR review: the repo’s bound jury reviews **only the PR diff/hunks + metadata** (no graph, no full files).
- `jury:branch-review` — complete branch review: compare the PR branch to the **repository default branch**, review the full branch delta against the repo context graph (no code execution in v1).
- Optional **capability labels** (`jury:cap:security`, `jury:cap:tests`, `jury:cap:performance`,
  `jury:cap:docs`, `jury:cap:data`, `jury:cap:infra`, `jury:cap:accessibility`) request a capability
  group. They only select from reviewers already bound/approved for the repo; they cannot enable an
  unbound reviewer, bypass required reviewers, budgets, or provider policy. No matching bound
  reviewer → capability fallback.
- The app creates the two mode labels on install; capability labels can be created on demand. Labels
  are a trigger/request, not a per-repo enable toggle.
- Specific reviewers are requested via slash command/UI (for example `/jury pr-review security,testing`).

### Capability labels (`jury:cap:*`) — request, not grant

A capability label is a **request for a kind of review**, not a way to enable a new reviewer. The
repo binding is the grant; the label can only select from what is already granted.

**What a capability is**

A reviewer version carries tags such as:

`security`, `auth`, `crypto`, `secrets`, `correctness`, `architecture`, `backend`, `frontend`,
`performance`, `testing`, `coverage`, `docs`, `data`, `database`, `sql`, `infra`, `accessibility`.

A capability label maps to one or more tags through a small alias registry:

| Label | Tags it matches |
| ----- | --------------- |
| `jury:cap:security` | `security`, `auth`, `crypto`, `secrets` |
| `jury:cap:tests` | `testing`, `coverage` |
| `jury:cap:performance` | `performance` |
| `jury:cap:docs` | `docs` |
| `jury:cap:data` | `data`, `database`, `sql` |
| `jury:cap:infra` | `infra` |
| `jury:cap:accessibility` | `accessibility` |

The alias registry is org-configurable. A label that expands to nothing is invalid and is ignored
with a note; it does not enable anything.

**Resolution**

For a trigger:

```
required   = repo bindings with requirement=required
mode       = branch if `jury:branch-review` else pr if `jury:pr-review` else repo default
requested  = tags from every `jury:cap:*` label
optional   = repo bindings with requirement=optional
             AND (requested is empty OR reviewer has a requested tag)
             AND scope matches (paths/languages/labels)
selected   = required ∪ optional, capped by policy
```

- Required reviewers always run, regardless of capability labels.
- If no capability labels are present, all matching optional reviewers run (the repo default jury).
- If capability labels are present, they **narrow** the optional set to reviewers carrying those
  tags. They do not add unbound reviewers.
- Multiple capability labels union their tags.
- A label can never change the mode; mode comes from the mode label or repo default.
- A label can never raise budgets, bypass provider policy, or mark a reviewer required.

**Examples**

| Labels | Result |
| ------ | ------ |
| `jury:pr-review` | Required + all matching optional; diff-only. |
| `jury:pr-review` + `jury:cap:security` | Required + security-tagged optional; diff-only. |
| `jury:branch-review` + `jury:cap:tests` + `jury:cap:performance` | Required + testing/performance-tagged optional; complete branch vs default. |
| `jury:cap:security` alone | Default mode (PR unless repo says branch) + security-tagged optional. |
| `jury:pr-review` + `jury:branch-review` | Branch review wins (most comprehensive), with a note in the session. |
| `jury:cap:security` when no bound security reviewer | Required/matched optional run if any; capability notice says no security reviewer is bound. If nothing runs, fallback. |

**If a requested capability has no bound reviewer**

- Other required/matching reviewers still run.
- The review/session includes a note: “Requested capability `security` has no bound reviewer on this
  repo.”
- If *nothing* can run (no required, no matching optional), post the no-reviewers/no-match fallback
  instead of a review.
- Do **not** silently substitute an unrelated reviewer.

**Label lifecycle**

- Applying a label triggers one turn; the label is not a standing subscription for every future push.
- Multiple labels added together are debounced/coalesced into one turn.
- To retrigger, remove/re-add the label, click the Check Run action, or use `/jury pr-review`.
- The app creates the two mode labels on install; capability labels can be created on demand.
- Labels do not grant repo-level enablement. Repo-level enablement is admin/SME binding or
  `.jury-forge.yml`; labels only request within it.

**Security and audit**

- Applying a label requires GitHub write/triage permission; the label is still only a request.
- A label cannot enable an unbound/archived reviewer or a reviewer from another org.
- The session records which labels were applied, which tags they expanded to, which reviewers were
  selected, and which were skipped/why.
- Capability labels are ignored on repos where the reviewer set is empty; fallback applies.

**Why not per-agent labels?**

- Label explosion and renames.
- Anyone who can label a PR could try to force an unapproved agent.
- Capability tags are stable; specific agents stay in the UI/slash command.

### Check Run (also primary)

A neutral `Jury Forge` check with actions `PR review` and `Branch review`; clicking starts the same
turn. Reviewer selection comes from repo bindings; specific reviewers via slash command/UI.

### Slash command (fallback)

`/jury pr-review`, `/jury pr-review security,testing`, `/jury branch-review`, `/jury status`, `/jury pause`,
`/jury resolve`, `/jury reopen`.

## 6. Availability resolution

For a trigger, the router computes:

```
mode       = branch if jury:branch-review else pr if jury:pr-review else repo default
requested  = tags from jury:cap:* labels ∪ explicit slash/UI selection
required   = bindings with requirement=required
optional   = bindings with requirement=optional
             AND (requested is empty OR reviewer has a requested tag)
             AND scope matches (paths/languages/labels)
selected   = required ∪ optional, capped by policy
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
