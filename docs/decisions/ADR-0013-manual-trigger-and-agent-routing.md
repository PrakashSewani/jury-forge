# ADR-0013: Manual-first triggering and dynamic agent routing

- Status: proposed
- Date: 2026-11-15
- Owners: product + architecture
- Supersedes: the PoC's repository enable/disable and opt-out reviewer model
- Revisit trigger: automatic review demand, or GitHub offers a native app review-request surface.

## Context

The owner wants the app to sit above all repositories in an installed account/org, with no webview
enable/disable toggles. A user should be able to ask for a review on any PR. At the same time, each
agent is not available on every repo, so the product needs a dynamic way to choose the jury.

## Options

1. **Repository enable/disable toggles** — PoC model; rejected for agentic review.
2. **Automatic review on every installed repo** — noisy and expensive; rejected as default.
3. **Manual-only** — safe, but no automation for teams that want it.
4. **Manual-first + config-as-code automatic policy + dynamic router** — chosen.
5. **Org-level UI toggles** — possible later; not the primary surface.

## Decision

- **Installation-level availability.** If the app is installed on an account/org (all or selected
  repos), manual review is available on those repos. No per-repo enable toggle is required.
- **Manual triggers:** a `Jury Forge` **Check Run action** (`PR review` / `Branch review`) or the
  `jury:pr-review`/`jury:branch-review` label (both one click, no comment); slash commands
  (`/jury pr-review`, `/jury pr-review <agents>`, `/jury branch-review`, `/jury status`, etc.) and the UI
  “Ask Jury Forge” action as fallbacks. Manual requests bypass the automatic allowlist.
- **Labels are modes, not reviewer selectors.** `jury:pr-review` runs the repo’s bound jury on the
  PR diff + targeted context; `jury:branch-review` runs a complete branch review. Specific
  reviewers are requested via slash command/UI, not via per-domain labels.
- **No-reviewer fallback:** if no reviewers are bound, none match, or a required reviewer is
  unavailable, post a fallback notice with setup/retrigger instructions — never a clean review.
- **Reviewer picker:** tested 2026-11-15; a request for `jury-forge[bot]` was accepted by the API but
  the app was not added as a reviewer. Arbitrary GitHub Apps cannot be requested there (Copilot is
  special); use the Check Run action instead, and revisit if GitHub adds a first-class AI reviewer.
- **Automatic reviews are opt-in** via `.jury-forge.yml`/`.github/jury-forge.yml` (or an org default
  later). Default `auto: false`.
- **Dynamic agent router:** explicit request > repo config > path/language/label scope >
  availability/budget > default. Agents declare repository/path/language/label scopes; unavailable
  agents are never silently used. The session timeline records why each agent ran or was skipped.
- **No repo enable/disable UI** for agentic review. A repository policy view shows config-as-code and
  agent availability, but it is not a gate for manual review.
- **Personal vs org:** personal installs use the defaults; an org admin tunes concurrency, budgets,
  auto policy, visibility, and agent defaults. Repo config overrides. Roles/visibility follow repo
  access; see [`../product/specs/session-capacity-and-visibility.md`](../product/specs/session-capacity-and-visibility.md).

## Consequences

**Easier:** zero-setup manual review on any installed PR; no stale repo toggles; agents can be
scoped and composed; automatic behavior is versioned in the repo.

**Harder:** discoverability (the user must know `/jury`), config-as-code validation, router
explanations, default-agent choice, permission/abuse controls, and org-level policy later.

**Invariants:** manual always available on an installed repo; no automatic review without policy; a
skipped agent has a recorded reason; an explicit request wins, subject to permissions/budget.

## Security and operations

- Only users with repo write access (or configured roles) can trigger a review; rate-limit and audit.
- A manual request cannot exceed org budgets or use a model the repo policy forbids.
- Slash commands/labels are parsed strictly; no free-form shell.
- The app ignores its own comments and bot loops.

## Evidence

- Owner directive, 2026-11-15.
- Spec: [`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).
- GitHub App installation scope: the app can only see installed repos; "above all repos" means
  installation-level availability, not bypassing GitHub permissions.

## Follow-ups

- Verify whether GitHub lets a user request the app as a reviewer; if not, slash command + label.
- Define `.jury-forge.yml` schema and validation UI.
- Define default agent when no scope matches.
- Decide org-level auto policy and budget guardrails.
