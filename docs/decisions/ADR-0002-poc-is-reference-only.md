# ADR-0002: The Cloudflare PoC is reference only

- Status: accepted
- Date: 2026-11-14
- Owners: architecture
- Supersedes: —
- Revisit trigger: none expected; a future ADR may reuse a specific idea, never the runtime.

## Context

`PrakashSewani/jury-forge-poc` is a complete product slice on Cloudflare Workers, D1, and Durable
Objects. It is valuable as evidence and product inspiration. It is also shaped by constraints that
are incompatible with the target product: 10 ms CPU, 50 subrequests, byte budgets, one Durable
Object per run, no queue, no code index, one installation per instance.

## Options

1. **Port the PoC.** Reuse the code and change the storage/runtime.
2. **Reference only.** Reuse the ideas and contracts; build a clean architecture.
3. **Ignore the PoC.** Start from a blank page.

## Decision

Option 2. The PoC is a reference. We keep its product instincts and lessons; we do not copy its
architecture or runtime. No PoC code is imported into this repository without a specific ADR.

## Consequences

**Easier:** we can choose the right runtime, data model, and pipeline; we are not constrained by the
PoC's schema or Durable Object shape.

**Harder:** we cannot reuse the PoC's implementation; the first walking skeleton takes longer than a
port.

**Preserved:** the product vocabulary (reviewer, run, finding, knowledge pack, readiness, try run),
the contract discipline, the design-system/accessibility work, and the decision-log process.

## Security and operations

Porting code would carry the PoC's flaws (see `docs/analysis/flaws.md`): non-idempotent publish,
stuck runs, prompt injection, key exfiltration, no roles. A clean build with explicit controls is
safer than a patchwork port.

## Evidence

- `docs/poc/` study.
- `docs/analysis/flaws.md`, `docs/analysis/inherit-reject.md`.
- PoC D-001, D-006, D-010, D-030, D-034.

## Follow-ups

- Link to specific PoC ideas when they are reused (templates, readiness, packs).
- Do not copy PoC code without a licence and provenance note; the PoC is MIT, but a port still needs
  a review.
