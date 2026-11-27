# Contributing to Jury Forge

Jury Forge is MIT-licensed and open to contributions. We do not require a CLA. By contributing, you
agree that your contribution is licensed under the repository's MIT licence.

## Before you write code

This repository is in **Phase 1b (walking skeleton)**. Code follows the approved docs and the
work packages in [`docs/delivery/implementation-plan.md`](docs/delivery/implementation-plan.md).
Read:

1. [`AGENTS.md`](AGENTS.md) — the operating contract.
2. [`docs/README.md`](docs/README.md) — the knowledge base map.
3. [`docs/delivery/ways-of-working.md`](docs/delivery/ways-of-working.md) — the process.
4. [`docs/delivery/quality-gates.md`](docs/delivery/quality-gates.md) — the gates.

## What we welcome

- Corrections with evidence (a PoC file/line, a broken link, a contradiction).
- Clearer documentation, diagrams, and runbooks.
- A product spec for a capability the owner has approved.
- An ADR for a durable choice, with options and trade-offs.
- A bug fix with a regression test (once code exists).
- A benchmark, a test, or an operational drill.

## What we do not accept

- A feature without an approved spec.
- A prompt change without a benchmark.
- A security control weakened to make a test pass.
- A dependency that breaks MIT or self-hosting.
- A secret, a customer's code, or generated build output.
- A large refactor bundled with a feature.

## Process

1. Open an issue or a discussion for anything non-trivial.
2. Branch from `dev`: `docs/<topic>`, `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.
3. Make one logical change per commit.
4. Update the docs and the status file.
5. Open a pull request with: what, why, evidence, risk, docs, checks, open questions.
6. A reviewer checks correctness, security, reliability, simplicity, tests, docs, and licence.
7. Squash/rebase as the repository convention requires; do not push directly to `dev`.

## Checks

Prerequisites: Node 24 (`.node-version`), pnpm (the version in `package.json`), and Docker for
the integration tests.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` must pass before merge. It runs, in order:

| Step | Command | What it enforces |
| ---- | ------- | ---------------- |
| Typecheck | `pnpm run typecheck` | TypeScript 7, strict; CI also typechecks with the 5.x fallback |
| Lint and format | `pnpm run lint` | Biome on code and JSON (Markdown is not reformatted) |
| Import boundaries | `pnpm run check:deps` | `.dependency-cruiser.cjs`: `domain` imports only `contracts` and does no I/O; `pipeline` uses ports; `testkit` only in tests |
| Licences | `pnpm run check:licences` | `licence-policy.json`: MIT/Apache/BSD/ISC-class only; BSL, SSPL, unknown fail |
| Unit + coverage | `pnpm run test:coverage` | vitest + fast-check; `packages/domain` ≥ 90 % |
| Integration | `pnpm run test:integration` | testcontainers PostgreSQL 17; skipped with a warning locally without Docker, a failure in CI |

A docs change is also checked by: all relative links resolve, referenced paths exist, the docs
map and the ADR index are current, no secrets or customer data, and `docs/delivery/status.md` is
honest.

## Security

Do not open a public issue for a vulnerability. See [`SECURITY.md`](SECURITY.md).

## Code of conduct

Be direct, be kind, argue with evidence. A separate `CODE_OF_CONDUCT.md` will land before public
launch.
