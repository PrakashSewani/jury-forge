# ADR-0026: v1 stack

- Status: accepted (Phase 1a, 2026-11-16)
- Date: 2026-11-16
- Owners: architecture
- Related: ADR-0003, 0004, 0005, 0006, 0010 (amended), 0020; full analysis in
  [`../architecture/technical-approach.md`](../architecture/technical-approach.md)
- Revisit trigger: a pinned dependency changes licence, a Phase 1b spike (S-A to S-E) fails its
  criterion, or the footprint budget (§6 of the approach) is missed.

## Context

The product and behaviour decisions were accepted at G0. Phase 1a evaluated the stack against the
constraints C1–C9: MIT/self-hosted, a 2 vCPU / 4 GB floor, Compose only, durable sessions, "models
propose, code decides", multi-provider, replayable signed receipts, untrusted input everywhere, and
one maintainer.

## Decision

| Area | Choice |
| ---- | ------ |
| HTTP | Fastify 5 (raw-body HMAC, schema validation, OpenAPI) |
| UI | React 19 + Vite 8 + TanStack Router/Query SPA, served by `app`; Radix + Tailwind |
| GitHub | Octokit (`@octokit/app`); REST plus GraphQL for thread state; per-installation write queue; no git clone in v1 |
| Models | Thin turn runner; provider gateway on the `ai` SDK; zod schemas → structured output, one repair attempt |
| Parsing | `web-tree-sitter` (WASM), 8 grammars, ±20-line fallback |
| Crypto | `node:crypto` only: AES-256-GCM envelope encryption (KEK from a file), Ed25519 receipts over RFC 8785 JCS; `@noble/ed25519` only in the offline verifier |
| Egress | One `undici` dispatcher: allowlist, DNS re-check, private-range block, redirect re-validation |
| Redaction | In-process rules derived from gitleaks' MIT ruleset |
| Observability | pino logs, Prometheus `/metrics` on an internal port, OpenTelemetry opt-in; no phone-home |
| Testing | vitest, fast-check, testcontainers, recorded GitHub fixtures, stub model, corpora, Playwright + axe, licence allowlist |
| Layout | pnpm monorepo: `apps/{server,web,cli}`, `packages/{contracts,domain,pipeline,gateway,forge,parsing,store,crypto,testkit}`; `domain` has no I/O (lint-enforced) |
| Image | Distroless Node 24 by default (switch to slim if spike S-B fails); non-root, read-only root filesystem, amd64 and arm64, ≤ 250 MB |
| CLI | Bash wrapper over `docker compose`, plus a Node offline receipt verifier |

## Consequences

- One language, four containers, and one datastore. v1 and v1.1 add modules, not infrastructure.
- Several dependencies move fast (`ai` 7, TypeScript 7, graphile-worker 0.x). Each sits behind a
  port, is pinned, and has a fallback (TR-1 to TR-3).
- We own the turn loop. That is more code than a harness, but it is replayable and auditable by
  construction.

## Security and operations

The mapping from each threat to its control is in §7 of the approach. The KEK is never stored in an
environment variable in production and is excluded from backups by default.
