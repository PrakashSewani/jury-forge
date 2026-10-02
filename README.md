# Product + Promo Site

One repository for a product **and its promo site** — the thing people use, and the site that
explains it and sends them to it. No tech stack is baked in: the stack is chosen when the
project's requirements are known.

## Getting started

1. **Create the repo** — "Use this template → Create a new repository" on GitHub, or locally:

   ```powershell
   .\scripts\new-project.ps1 -Template template-app-plus-site -Name my-product -Title "My Product"
   ```

   ```bash
   bash scripts/new-project.sh template-app-plus-site my-product "My Product"
   ```

2. **Rename** (skip if you used the script above):

   ```bash
   node scripts/init.mjs --name my-product --title "My Product"
   ```

3. **Bootstrap it.** Open an AI session in the repo, describe your product in plain words, then
   say *"bootstrap this project"*. The agent follows `AGENTS.md` and the `project-bootstrap`
   skill: it asks the questions that matter, picks the smallest stack that fits, resolves current
   package versions **live**, records the decision in `docs/`, and scaffolds the repo — product
   and site side by side.

## What's in here

- `AGENTS.md` — the four rules, the PM/subagent model, and the no-stack-assumed workflow.
- `docs/` — `product.md` (the brief), `architecture.md`, `decisions.md`, `status.md`,
  `development.md`.
- `.commandcode/agents/` — `implementer`, `verifier`, `docs-writer`.
- `.commandcode/skills/` — `project-bootstrap` (choose + scaffold the stack), `ship-release`.
- `scripts/init.mjs` — renames the template once; delete it after.

## Why nothing is pinned

Templates that ship a pinned stack go stale in weeks and force yesterday's tools onto today's
project. This template ships the **shape** — one repo, product + site, docs-first, PM + subagents
— and leaves the stack to be decided with you at project start, with versions resolved on that
day. The version numbers in `examples/` (if present) are reference implementations, not advice.

## License

[MIT](./LICENSE)
