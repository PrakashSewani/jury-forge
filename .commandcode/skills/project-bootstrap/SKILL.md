---
name: project-bootstrap
description: Choose the tech stack for this repository and scaffold it. Use when the repo is fresh (docs/product.md is unfilled, docs/decisions.md D-001 is pending) or when the user asks to set up, scaffold, bootstrap, initialize, or "start" the project.
license: MIT
metadata:
  template: template-app-plus-site
  version: "1"
---

# Bootstrap the project

The repository ships without a stack on purpose. Your job: turn the user's idea into a chosen
stack, recorded in the docs, scaffolded and verified. Do not write product code before step 5.

## Step 0 — Rename the template (once)

If the repo still says `template-app-plus-site` / "Product + Promo Site" anywhere (README,
AGENTS.md, docs, skills), fix that before anything else. The slug is the repository name; the
title is the human name for it.

```bash
node scripts/init.mjs --name <repo-slug> --title "<Product Title>"
```

If the user hasn't named the product yet, ask — do not invent one. After the rename, re-read
`README.md` and `AGENTS.md` (they now say the real name), delete `scripts/init.mjs`, and continue.

## Step 1 — Get the brief (ask, do not assume)

Ask only the questions whose answers change the design. Typical set (adapt — skip what the user
already told you):

- What does the product do, in one sentence? Who uses it?
- Where does it run: browser extension, web app, desktop, mobile, terminal, server?
- Does it need accounts or store data? If yes, where should the data live?
- Anything offline, real-time, scheduled, or long-running?
- Where will it be published/deployed, and by whom? Is the promo site on the same host or a
  separate one?
- Constraints already fixed: language, cloud, budget, an existing system to integrate with?

Write the answers into `docs/product.md` **before** choosing anything (rule 2). Update
`docs/status.md` to say the brief is captured.

## Step 2 — Choose the smallest stack that fits

- Start from the simplest shape that satisfies the brief. Read `references/stack-notes.md` for
  qualitative guidance — it describes shapes, not products, and contains **no versions**.
- Prefer boring, widely-used tooling with a real release process and a maintained community.
- One language across the repo when possible — especially for the product + site pair — unless
  the shape demands otherwise.
- A promo site is a static marketing surface: it should not need the product's runtime.
- If two options are genuinely close, say so and let the user pick; do not silently pick for them.
- When the choice is load-bearing, check current practice with a web search. Guidance in this
  repo (including these notes) may be old — the search is the check.

## Step 3 — Resolve versions live (mandatory)

**Never write a version from memory, from this skill, from `docs/`, or from anything in
`examples/`.** Packages ship daily; anything you "remember" is wrong.

Resolve the current stable version at the moment of scaffolding:

| Ecosystem | Resolve with |
|---|---|
| npm | `npm view <pkg> version` (and `npm view <pkg> dist-tags` when latest is a prerelease) |
| Rust | `cargo search <crate> --limit 1`, or `cargo add <crate>` and read Cargo.toml |
| Python | `uv add <pkg>` (or `python -m pip index versions <pkg>`) |
| Go | `go list -m -versions <module>@latest` |
| Other | the ecosystem's `add` command, or the registry's API |

Pin exact versions in the lockfile; keep ranges in the manifest. Record the resolved set in the
decision entry (step 6). If a package's latest release is an RC/beta, prefer the previous stable
unless the user asks otherwise.

## Step 4 — Propose, then wait

Present, in one short message:

1. **Shape** — what lives where (product, site, shared), one line each.
2. **Stack** — language, framework, DB/storage, package manager, test runner, CI, deploy targets,
   with the resolved versions.
3. **Why** — one line per choice: what it buys for this brief.
4. **Rejected** — the alternatives and why not (one line each).
5. **Cost/risk** — anything the user should know (learning curve, hosting cost, lock-in).

Wait for confirmation. Do not scaffold before the user agrees. If they counter-propose, adjust
and re-present.

## Step 5 — Scaffold

- Create the structure from the proposal. Product and site are separate top-level folders; share
  only what genuinely helps (brand constants, types, API contracts), and record what is shared
  in `docs/architecture.md`.
- Install dependencies; get something minimal running end to end (the product builds, the site
  serves a page).
- Wire the checks: typecheck, lint, tests, build — one command each, plus a single `check`
  command that runs them all. The check command is the definition of done.
- Add `.github/workflows/ci.yml` running the check command and the build, using current action
  versions (resolve them — same rule as packages).
- Add the release path (tag → artifact/publish) per the `ship-release` skill. Deploys stay
  manual.
- Do not copy an example project wholesale. Write what this product needs; leave out what it
  does not need yet.

## Step 6 — Record (rule 2)

- `docs/decisions.md` — replace D-001 with the real decision: stack + exact versions + rejected
  options + why.
- `docs/architecture.md` — shape, components, data flow, boundaries/invariants.
- `docs/development.md` — prerequisites, setup, and the exact commands (only ones you ran).
- `docs/status.md` — phase 0 complete, phase 1 current, handoff written.

## Step 7 — Verify before declaring done

- Run the check command and the build from `docs/development.md` yourself.
- Delegate to the `verifier` subagent with the decision entry and `docs/development.md` as
  acceptance criteria. Its report is what "scaffolded" means — not your own summary.
- If verification fails, fix and re-verify. Do not mark the phase complete on a red check.

## Anti-patterns

- Picking a stack out of habit ("I always use X") without it fitting the brief.
- Writing a version you did not resolve live in this session.
- Scaffolding before the user confirmed the choice.
- Adding tooling (monorepo, ORM, auth, queues) the product does not need yet.
- Documenting a command you did not run.
- Leaving `docs/decisions.md` at "pending" after scaffolding.
