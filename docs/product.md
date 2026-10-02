# Product

## What it is

Jury Forge is a self-hosted AI code-review team for GitHub. You deploy it once to your own
Cloudflare account — one Worker, one database — and it becomes yours: your reviewers, your
models, your keys, your data. There is no central service; nothing leaves your account except
the requests your instance makes to GitHub and to the model providers you configure.

After deploying, a setup guide walks you through creating your own private GitHub App (through
GitHub's manifest flow — GitHub prefills the permissions, events, and webhook URL from a
manifest) and installing it on your repositories. Then you open your dashboard and build your review team:
Security, Architecture, Backend, Frontend, Performance, Testing, Documentation, or fully custom
reviewers — each a configurable agent with its own instructions, review rules, and model
binding.

Reviewers are not hard-coded review types. Models are Bring-Your-Own-Key against
OpenAI-compatible or Anthropic-compatible APIs — any provider or gateway that speaks one of
those APIs, with a configurable base URL. When a pull request is opened or updated, your
instance retrieves the repository and pull-request context, runs the configured team,
consolidates the findings, and posts actionable feedback directly on the pull request.

## Who it's for

Developers and small teams who want their own review bot on their own terms: their GitHub, their
Cloudflare account, their model providers. They are comfortable running a deploy command, and in
exchange they get no platform fees, no third-party service holding their code or keys, and full
control over reviewer behavior and models.

## The problem it solves

AI tools generate and change code faster than single-reviewer or manual processes can review it.
The current options are a fixed AI reviewer running on someone else's servers with a
provider-owned model and little control — your code leaves your account and you pay a platform
markup — or home-grown prompt scripts wired to one provider. Neither lets a developer assemble a
team of reviewers with different responsibilities and review standards, and neither respects
provider choice.

Jury Forge makes the review team itself configurable: multiple agents with distinct
responsibilities, BYOK credentials, configurable endpoints, running in your own account, with
results that land in the GitHub workflow where the code already lives.

## Non-goals

- Not a hosted service — no central server, no multi-tenant backend, no account with us. The
  project ships a repo and a static promo site; every instance runs in its owner's account.
- Not a GitHub Marketplace listing in v1 — each instance registers its own private GitHub App;
  a shared app cannot route webhooks to per-user deployments.
- Not a model host, reseller, or proxy — users bring keys; requests go to their providers.
- GitHub only in v1 — no GitLab, Bitbucket, or Gitea.
- No automatic code fixes or auto-merge in v1 — the output is review feedback.
- No preset reviewer marketplace in v1 — reviewers are user-defined.
- No metering or reselling of AI calls — users pay their providers directly.

## Success looks like

The workflow that must feel right: deploy the Worker → follow the setup guide (create your
GitHub App, install it, claim the instance) → open the dashboard → create a reviewer with your
own key and model → open a pull request → within minutes, a consolidated review appears, with
findings attributed per reviewer and inline comments where they matter → editing a reviewer's
instructions visibly changes what it flags.

Done for the first release: the loop works end to end from a fresh deploy on a real repository;
it runs on Cloudflare's free plan for typical personal use, with the paid plan documented as
headroom; credentials are encrypted at rest in the owner's own database, never logged, and never
sent anywhere but the configured provider; review runs are durable and resumable; the dashboard
manages reviewers, credentials, setup, and run history.

## Core concepts

- **Instance** — one self-hosted deployment: a Cloudflare Worker, a database, and its own
  private GitHub App, owned by one person.
- **Owner** — the GitHub user who claims the instance during setup. Dashboard access is via
  GitHub login plus an optional allowlist.
- **Reviewer** — a configurable agent: name, instructions, review rules, provider binding, and
  enabled/disabled state. Not a hard-coded review type.
- **Provider binding** — a reviewer's model config: API flavor (OpenAI-compatible or
  Anthropic-compatible), base URL, API key (encrypted at rest), model name, and parameters.
- **Review run** — one execution of the team against one PR revision, coordinated by a per-run
  Durable Object that survives retries and restarts. Recorded for history.
- **Consolidated review** — one GitHub review per run: a summary attributing findings per
  reviewer, with inline comments where the finding has a file and line.

## v1 behavior (confirmed 2026-10-02)

- Setup flow: deploy → create your own private GitHub App through GitHub's manifest flow
  (prefilled permissions, events, webhook URL, and OAuth callback; registered under your
  personal account or an organization you administer) → install it on repositories → claim the
  instance → configure reviewers. Private apps are installable only on the owning account, and
  only the owner (or members of the owning organization) can authorize them.
- Triggers: pull request `opened`, `reopened`, `synchronize`, and `ready_for_review`; draft PRs
  are skipped.
- Every trigger re-runs the team against the latest revision, reviewing the PR's cumulative diff
  against the base branch.
- Findings are published as a single consolidated GitHub review per run.
- Reviewers run in parallel within a run; one reviewer failing does not cancel the others.
- Reviewers are defined once per instance and enabled per repository.
- Cost posture: designed to run within Cloudflare's free plan for typical personal use;
  documentation names the paid plan ($5/month, optional, the owner's own account) as the
  headroom path for very large PRs.

## Open questions (resolve before implementing the related part)

- First-run setup protection: how a fresh deployment prevents a stranger from claiming it
  (deploy-time setup code, first-visitor claim, or Cloudflare Access) — decide before building
  the setup wizard.
- Comment volume controls: maximum inline comments per reviewer/run before overflow into the
  summary — decide with the publishing logic.
- Diff size limits: truncation strategy per model, plus bounded processing to stay within
  free-tier CPU budgets — decide with the context builder.
