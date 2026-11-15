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
| **Repo binding** | The configuration that makes a catalog reviewer available on one repository, with selection mode (`required`/`default`/`capability`), scope, and budget. |
| **Default jury** | The reviewers a plain `jury:pr-review` runs: required bindings + `default` bindings whose scope matches. `capability` bindings are excluded until requested. |
| **Fallback** | The comment posted when no reviewer can run, explaining why and how to fix/retrigger. |

## 2. Reviewer catalog (org-level)

A reviewer is created once, versioned, and then bound to repos.

- Fields: name, slug, domain/tags, description, owner (SME), instructions, rules, provider/model/
  endpoint (catalog only), tools, output schema, default budget, status (`draft`/`approved`/
  `archived`).
- Versions are immutable once active. A draft can be edited; activation requires approval
  (admin for org-wide, owner for personal).
- **Approval:** an SME can draft/own a reviewer in their domain; an admin approves it for the org
  catalog. A repo maintainer can bind **approved** reviewers only when `allowMaintainerBindings`
  is on (default off).
- **Ownership:** every reviewer has an owner (SME or admin). Ownership can be transferred; archived
  reviewers cannot be bound to new repos.
- **Test before bind:** a reviewer can be tried on a PR with no publish (the PoC’s try-run concept),
  and the result is visible to the owner/admin.
- **No free-text model:** the reviewer binds to a provider catalog model + supported endpoint.

## 2.1 Capabilities and tools

A reviewer can be more than a prompt. Its version declares a **tool policy**:

Tool availability is tiered: **PR review (T0)** may use only diff/thread/finding tools; repository
read, graph, and test tools are **branch review (T2) only**.

| Tool/capability | What it does | Availability |
| --------------- | ------------ | ------------ |
| `diff.read` | Read the PR diff/hunks | T0/T2, on |
| `graph.query` | Search symbols, references, tests, ownership | T2 only |
| `file.read` | Read a file slice at the SHA | T2 only |
| `tests.inspect` | Find tests, coverage, skipped tests | T2 only |
| `static.analyze` | Run/read static analysis results | T2, optional |
| `tests.run` | Run tests in a sandbox | Later (post-v1.1), **off**, opt-in per repo |
| `build.run` | Build in a sandbox | Later (post-v1.1), **off**, opt-in per repo |

- The **agent decides which tools to use** for its task, within its instructions, budget, and the
  repo’s policy. A branch/T2 “capability reviewer” can inspect contracts, callers, and tests; when
  `tests.run` lands, it can run the relevant tests and include the result as evidence.
- `tests.run`/`build.run` are later (post-v1.1), not implied by branch review. They require an
  opt-in repo policy, a sandbox, and a resource budget.
- Sandbox rules: ephemeral container, non-root, no secrets, network off by default, CPU/memory/time
  caps, command allowlist, no push/merge, output captured and redacted. Untrusted repo code is
  never run on the host.
- A tool result is evidence, not an instruction; findings can cite it, but the agent still grounds
  the claim in code.
- Tool calls and results are recorded in the turn timeline.

## 2.2 Reviewer creation screen

Yes — capabilities are configured **on the reviewer**, in the create/edit screen. Repo bindings are
a separate grant step. The screen is a stepper:

```
Create reviewer
  1. Basics
  2. Capabilities
  3. Model
  4. Instructions & rules
  5. Tools & sandbox
  6. Availability (bind to repos)   ← role-gated; can be skipped and done later
  7. Test & activate
```

### 1. Basics

- Name, slug, description.
- Owner (SME/admin) and domain (security, testing, backend, …).
- Template picker: start blank or from a built-in template; templates prefill capabilities, tools,
  instructions, and rules.
- Status is **draft** until approved/activated.

### 2. Capabilities

- A **capability picker** from the tenant registry, not free-form tags. Built-ins include
  `security` (children `auth`, `crypto`, `secrets`), `correctness`, `architecture`, `backend`,
  `frontend`, `performance`, `testing`, `docs`, `data`, `infra`, `accessibility`.
- **Custom capabilities:** SME drafts an ID/name/description/parent; admin approves. IDs are
  immutable; display names are editable. The label is generated as `jury:cap:<id>`.
- One parent level only: `security` can contain `auth`, but `auth` cannot contain another level.
- Capabilities are optional for a `default`/general reviewer; a `capability` binding requires at
  least one.
- Live preview: **“Requestable by labels: `jury:cap:security`, `jury:cap:auth`.”** Capability labels
  are synced to every installed repo, so the preview reflects the whole tenant.
- Helper text: “Capabilities make this reviewer requestable. They do not bind it to a repo; a repo
  binding is still required. A `default` binding runs on plain reviews; a `capability` binding runs
  only when one of its capabilities is requested.”

### 3. Model

- Provider select → model select from the provider catalog (no free-text model).
- Endpoint select from `supportedEndpoints` (chat/responses/messages); defaults to a valid one.
- Params validated against the model’s capability schema.
- Default token/cost budget for this reviewer.
- Provider/model health shown; if the model disappears later, the reviewer becomes
  `configuration_error`.

### 4. Instructions & rules

- Instructions: what this reviewer is responsible for.
- Rules: team-specific constraints and output expectations.
- Optional: attach knowledge packs or reference conventions (org policy).
- Versioned; changes create a new draft version.

### 5. Tools & sandbox

- T0 fixed tools: `diff.read` only (plus thread/finding tools).
- T2 fixed tools: `file.read` and `tests.inspect`; optional `graph.query`, `static.analyze`.
- Sandbox tools: `tests.run`, `build.run` (later, post-v1.1). They are **off by default**, require the repo to
  opt into the sandbox, and show a warning: “Running repository code requires an isolated sandbox and
  a resource budget.”
- A capability label can request the reviewer; it cannot enable a sandbox tool.
- Show the tool budget: max calls, max wall time, max tokens.

### 6. Availability (bind to repos)

- Role-gated:
  - **Personal install / Owner / Admin:** can bind to any repo in the installation.
  - **SME:** can bind their domain reviewer to assigned repos/domains.
  - **Maintainer:** bind only if `allowMaintainerBindings` is on; otherwise request a binding.
- Per repo: `required`/`default`/`capability` selection, paths include/exclude, languages, labels,
  T2 context paths, priority, budget.
- A reviewer can be saved as a draft without a binding; it simply cannot run anywhere until bound.
- This step can be skipped and done from **Repositories → <repo> → Reviewers**.

### 7. Test & activate

- **Try on a PR** (no publish) with the reviewer’s current draft.
- Preview: “This reviewer would run on repos X; requestable by labels Y; tools Z.”
- Save draft → approve (admin for org; owner for personal) → active version.
- Activation is versioned; rollback to a previous version is one click.
- The final screen shows the exact provider/model/endpoint, capabilities, tools, and bound repos.

### Role behavior

| Actor | Can create | Can approve/activate | Can bind |
| ----- | :--------: | :------------------: | :------: |
| Owner | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ |
| SME | ✓ in domain | — (admin approves) | ✓ assigned repos |
| Maintainer | — | — | only if `allowMaintainerBindings` |
| Member/Viewer | — | — | — |

### Validation and UX rules

- No free-text model or endpoint.
- At least one capability to activate.
- A reviewer with a sandbox tool but no repo sandbox policy can be created, but the tool is disabled
  and explained.
- A reviewer can be draft/unbound; it is not available on any repo until bound.
- Show a clear “request vs grant” callout: capabilities are requestable; bindings are grants.
- Every create/version/approval/binding change is audited.
- The screen must be usable on mobile; the sticky save bar and unsaved-changes guard from the PoC
  reviewer editor carry over.

## 3. Repo bindings (the important part)

A reviewer is **not available on a repo** unless there is an enabled binding.

`repo_reviewer_bindings`:

| Field | Meaning |
| ----- | ------- |
| `repo_id` | GitHub repository |
| `reviewer_id` / `reviewer_version_id` | Catalog reviewer; pin or latest-approved |
| `enabled` | Hard on/off |
| `selection` | `required` (always) / `default` (plain review) / `capability` (only when its capability is requested) |
| `priority` | Order/weight for the chair |
| `paths_include` / `paths_exclude` | Path globs this reviewer covers |
| `context_paths` | Read-only reference files/folders (T2 branch review only; T0 ignores it) |
| `languages` | Optional language filter |
| `labels` | Optional PR-label filter |
| `budget` | Per-reviewer token/cost cap (optional) |
| `created_by`, `updated_at` | Audit |

Rules:

- **No binding = not available.** A reviewer in the catalog is not automatically used.
- **Required** reviewers always run when a review runs, subject to availability. If a required
  reviewer is unavailable, the run **stops before reviewing** and posts a configuration notice
  (never a misleading “clean” review).
- **Default** reviewers run on a plain review when their path/language/label scope matches.
- **Capability** reviewers run only when a matching `jury:cap:*` label or explicit UI selection is
  present; they never run on a plain review just because their scope matches. If an admin wants a
  capability-tagged reviewer on every plain review, they bind it as `default` deliberately.
- **Disabled** bindings are skipped and listed in the notice.
- A reviewer with path filters but no matching changed file is skipped with a reason.
- A repo’s default jury is required + matching default bindings. Capability bindings are not part
  of it.
- Bindings are versioned; a policy change is audited and can trigger a re-evaluation on the next
  trigger (not automatically on every open PR).
- Repo config-as-code (`.jury-forge.yml`) can declare the same bindings; the UI writes it. The
  source of truth is one of them, not both silently diverging.

### Precedence

1. Explicit capability labels or UI reviewer selection.
2. Required bindings (always).
3. Default bindings (plain review, scope match).
4. Org default reviewer policy.
5. No match → fallback notice.

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
  maintainers bind approved reviewers to their repos when `allowMaintainerBindings` is on; members
  see the process.
- **Admin-only:** provider keys, model allowlist, budgets, visibility, reviewer approval, role
  changes.
- **SME:** domain authority, not billing/provider authority.
- **Maintainer:** can choose from the approved catalog and request bindings, but cannot create an org-wide reviewer. Binding is admin/SME by default; `allowMaintainerBindings` can enable it.
- Every binding/role/approval change is audited.

### Domain examples

Security, Architecture, Backend, Frontend, Performance, Testing, Documentation, Database, Infra,
Accessibility, Custom. Domains are **catalog metadata/tags** for organization, search, and SME
ownership. They are not GitHub labels; GitHub labels are the two review modes and the
`jury:cap:<id>` capability requests.

## 5. Triggers and the default jury

### Labels (primary, as requested)

- `jury:pr-review` — strict **T0 diff-only** PR review: PR diff/hunks + metadata + thread context;
  no repository file reads, no graph.
- `jury:branch-review` — **v1.1** complete branch review: compares the PR branch to the repository
  default branch and reviews the full branch delta against the repo context graph (T2).
- **Capability labels:** `jury:cap:<capability-id>` request a capability group. They only select
  from reviewers already bound/approved for the repo; they never enable an unbound reviewer, bypass
  required reviewers, budgets, or provider policy.
- A capability label alone defaults to `jury:pr-review`; add `jury:branch-review` for the branch mode.
- **No slash commands in PR conversations.** Specific reviewers are selected via the UI
  “Ask Jury Forge” picker; labels handle modes and capabilities.
- The app creates the two mode labels on install. Capability labels are synced from the capability
  registry to **every installed repo**; disabled capabilities keep the label for history and
  return a capability fallback.

### Capability labels (`jury:cap:*`) — request, not grant

A capability label is a **request for a kind of review**, not a way to enable a new reviewer. The
repo binding is the grant; the label can only select from what is already granted.

**Capability model**

A capability is a first-class, tenant-scoped object:

```
Capability
  id: "security"            // immutable, lowercase slug, used in the label
  name: "Security"
  description: "..."
  parentId: null            // optional; one level (e.g. security → auth/crypto/secrets)
  status: active | disabled
  builtIn: true | false
```

- Labels are always `jury:cap:<id>`; display name is editable, ID is not. Renaming the ID is not
  allowed; create a new capability and deprecate the old one.
- Built-ins: `security` (children `auth`, `crypto`, `secrets`), `correctness`, `architecture`,
  `backend`, `frontend`, `performance`, `testing`, `docs`, `data`, `infra`, `accessibility`.
  **Tier note:** Phase 1 uses built-in capability IDs for `capability` bindings; the registry and
  `jury:cap:<id>` labels ship in v1 (ADR-0018).
- Custom capabilities: **SME drafts, admin approves**; they can be standalone or a child of a
  group. The label is generated; all active capability labels are synced to every installed repo.
- A reviewer version carries capability IDs. A reviewer with no capability can be bound as
  `default`; a `capability` binding requires at least one capability. The **binding selection mode**,
  not the presence of capability tags, decides when the reviewer runs.
- A capability request reaches reviewers on that repo whose capability ID (or a child of the
  requested parent) matches. `jury:cap:security` matches `security`, `auth`, `crypto`, `secrets`.

**Resolution**

```
mode       = branch if `jury:branch-review`
             else pr if `jury:pr-review`
             else repo default
required   = bindings with selection=required
requested  = capability IDs from `jury:cap:*` labels ∪ explicit UI selection
defaults   = bindings with selection=default AND scope matches
capability = bindings with selection=capability
             AND reviewer has a requested capability (or a requested parent)
             AND scope matches
selected   = required
             ∪ (requested is empty ? defaults : capability)
```

- Required bindings always run, regardless of capability labels.
- No capability labels and no UI selection → required + default bindings.
- Capability labels/selection present → required + matching capability bindings; default bindings
  are not added (the request narrows the jury).
- Multiple capability labels union; a parent matches its children.
- A label can never change the mode, raise budgets, bypass provider policy, or promote a binding to
  required.
- No match for a requested capability → capability fallback; if nothing can run, no review.

**Examples**

| Labels | Result |
| ------ | ------ |
| `jury:pr-review` | Required + default bindings; strict T0. |
| `jury:pr-review` + `jury:cap:security` | Required + security-capability bindings; strict T0. |
| `jury:branch-review` + `jury:cap:tests` + `jury:cap:performance` | Required + testing/performance bindings; full branch vs default. |
| `jury:cap:security` alone | Default PR mode + security-capability bindings. |
| `jury:pr-review` + `jury:branch-review` | Branch review wins; session notes the conflict. |
| `jury:cap:security` with no bound security reviewer | Required reviewers + no matching capability → capability fallback; no unrelated default reviewers added. |

**If a requested capability has no bound reviewer**

- Required bindings still run if they exist; the review notes that the requested capability was
  unavailable.
- If there are no required bindings and no capability match, post the capability fallback:
  “No reviewer with the `security` capability is bound to this repo.” No review.
- Do not substitute a `default` reviewer or an unrelated capability; a capability request narrows
  the jury.
- A disabled capability keeps its label; requests return “capability unavailable.”

**Label lifecycle**

- Labels can be applied **when the PR is created or at any point in its lifecycle** by anyone with
  GitHub triage/write access. GitHub sends labels on `pull_request.opened` and later
  `pull_request.labeled`/`unlabeled` events; the app handles both.
- Applying a label enqueues **one turn**; multiple labels added together are coalesced.
- Removing a mode label before the turn starts cancels the queued turn. Removing it during a turn
  cancels before the next provider call/publish where possible.
- To retrigger: remove/re-add the label, use the Check Run action, or use the UI. No `/jury` command.
- Labels persist; they are not a standing subscription for future pushes. Use repo policy `auto: true`
  for that.
- Labels do not grant repo-level enablement. Enablement is admin/SME binding or `.jury-forge.yml`.

### Check Run and UI

A neutral `Jury Forge` check with actions `PR review` and `Branch review`; clicking starts the same
turn. The UI “Ask Jury Forge” picker selects specific bound reviewers/capabilities. There are **no
slash commands** in PR conversations.

## 6. Availability resolution

For a trigger, the router computes:

```
mode       = branch if jury:branch-review else pr if jury:pr-review else repo default
requested  = capability IDs from jury:cap:* labels ∪ explicit UI selection
required   = bindings with selection=required
defaults   = bindings with selection=default AND scope matches
capability = bindings with selection=capability
             AND reviewer has a requested capability (or a requested parent)
             AND scope matches
selected   = required
             ∪ (requested is empty ? defaults : capability)
```

Availability checks per reviewer:

1. Binding enabled.
2. Reviewer version approved/active.
3. Provider enabled, key present, model in catalog, endpoint supported.
4. Budget available.
5. At least one changed file matches the path/language/label scope (default/capability bindings).
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
**Then retrigger:** remove and re-add the `jury:pr-review` label, click **PR review** on the Jury
Forge check, or use the UI.
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
4. Maintainers bind approved reviewers to their repos (`required`/`default`/`capability` + scopes), when `allowMaintainerBindings` is on.
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
- [ ] An admin/SME can bind a reviewer with `required`/`default`/`capability` selection and
      path/language/label scopes; the change is audited. A maintainer can bind only when
      `allowMaintainerBindings` is on.
- [ ] `jury:pr-review` runs required + matching default bindings; capability bindings do not run.
- [ ] `jury:cap:<id>` runs required + matching capability bindings; default bindings are not added.
- [ ] `jury:branch-review` runs a complete branch review against the repo context graph (T2).
- [ ] A capability label alone defaults to PR review; `jury:branch-review` changes the mode.
- [ ] Capability labels are `jury:cap:<id>`, one-level groups work, IDs are immutable, custom
      capabilities are SME-drafted/admin-approved.
- [ ] All active capability labels are synced to every installed repo; a disabled capability keeps
      the label and returns the capability fallback.
- [ ] No bindings → fallback comment with setup/retrigger instructions; no review posted.
- [ ] Bindings but no scope match → fallback listing scopes and changed files; no review posted.
- [ ] Required reviewer unavailable → fallback; no partial/clean review.
- [ ] A requested capability with no bound reviewer → capability fallback; no unrelated substitute.
- [ ] Default/capability reviewer unavailable → review runs without it, note explains the skip.
- [ ] SME can own/draft a domain reviewer; admin approves; maintainer can bind only approved.
- [ ] No slash commands are required or accepted in PR conversations.
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
- Mode labels + `jury:cap:<id>` capability labels; no per-agent labels; specific reviewers via the UI picker.
- A “default general reviewer” for personal installs, but still requires a binding.
- A repo onboarding checklist in the UI: provider → reviewer → binding → trigger.

## 12. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| RV-01 | Can maintainers create reviewers, or only bind approved ones? | Bind approved only, and only when `allowMaintainerBindings` is on; SMEs create. |
| RV-02 | Can an SME bind reviewers to repos they don't maintain? | Only assigned repos/domains. |
| RV-03 | Required reviewer unavailable: block or run default/capability? | Block the review; config fallback. |
| RV-04 | Who approves a reviewer: admin only, or SME + admin? | SME drafts; admin approves. |
| RV-05 | Fallback comment on forks? | Policy-controlled; default skip comments on forks. |
