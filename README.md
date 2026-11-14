# Jury Forge

**A self-hosted AI code-review jury for your repositories.** Bring your own model keys, run it on
your own infrastructure, and keep your code and credentials inside your own perimeter.

Jury Forge is an MIT-licensed, self-hostable code review platform. You define specialised
reviewers — security, architecture, backend, frontend, performance, testing, documentation, or
roles that do not have a name yet — bind each one to the model you want, and let the jury review
pull requests as one consolidated verdict with inline findings.

> **Status: documentation and discovery.** This repository is in its product-definition phase.
> There is no product code yet. The first deliverable is the knowledge base and the decisions that
> the implementation will follow. The proof of concept that inspired this product lives at
> [`PrakashSewani/jury-forge-poc`](https://github.com/PrakashSewani/jury-forge-poc); it is a
> reference, not a starting point.

## Why another code reviewer?

The PoC proved that a configurable AI review jury is useful. It also proved the ceiling of its
runtime: a Cloudflare Worker, D1, and a Durable Object per run shaped almost every product
decision — budgets measured in bytes, 10 ms CPU ceilings, one installation per instance, no
queue, no real background worker, and no place to run serious code intelligence.

Jury Forge starts again from the product, not from the deployment target:

- **Self-hosted first.** Container-first, vendor-neutral, no managed-service requirement.
- **Yours end to end.** Your infrastructure, your database, your object storage, your keys.
- **Provider-agnostic.** OpenAI-compatible, Anthropic-compatible, and local model servers.
- **A jury, not a slot machine.** Multiple specialist agents, grounded findings, explicit
  disagreements, and a verdict you can audit.
- **A conversation, not a comment.** Every PR gets a durable session; the author can reply, ask,
  fix, and the jury responds with context alive. Only Jury Forge resolves its threads, after a
  satisfactory response.
- **Manual-first.** Ask on any PR in an installed account/org. No repo enable/disable toggles;
  automatic review is opt-in config-as-code.
- **Models you can actually use.** Add a provider key, fetch its model catalog, bind agents to
  catalog models — no free-text model entry, keys encrypted.
- **Diff-first with a memory.** Default reviews stay on the diff; full-repo reviews use an
  incrementally updated repository knowledge graph so context is reused, not rebuilt.
- **Open source, MIT.** Fork it, extend it, run it commercially, no open-core trap.

## What this repository contains today

| Path                  | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `docs/`               | The knowledge base: PoC study, flaw register, product and architecture |
| `AGENTS.md`           | How humans and agents work in this repository                         |
| `.agents/skills/`     | Project skills for recurring workflows                                |
| `.pi/agents/`         | Project agent roles for the documentation and delivery chain          |
| `.pi/prompts/`        | Reusable workflow prompts                                             |
| `LICENSE`             | MIT                                                                   |

## Start here

1. [`docs/README.md`](docs/README.md) — the knowledge-base map.
2. [`docs/poc/overview.md`](docs/poc/overview.md) — what the PoC is and what it proved.
3. [`docs/analysis/flaws.md`](docs/analysis/flaws.md) — what we will not repeat.
4. [`docs/product/vision.md`](docs/product/vision.md) — what this product is becoming.
5. [`docs/architecture/overview.md`](docs/architecture/overview.md) — the target shape.
6. [`docs/delivery/roadmap.md`](docs/delivery/roadmap.md) — the path from here to a first release.

## Working on Jury Forge

Read [`AGENTS.md`](AGENTS.md) before changing anything. For contribution mechanics, see
[`CONTRIBUTING.md`](CONTRIBUTING.md). For security reports, see [`SECURITY.md`](SECURITY.md). The
short version:

- Documentation is the source of truth. Code follows approved docs.
- Every durable choice gets an ADR. Options, trade-offs, and consequences are written down.
- Evidence beats memory. Inspect the code, resolve versions live, cite file and line.
- No product code until the product and architecture docs are approved.
- MIT, no CLA, no contributor licence gymnastics.

## License

[MIT](LICENSE) © 2026 Prakash Sewani
