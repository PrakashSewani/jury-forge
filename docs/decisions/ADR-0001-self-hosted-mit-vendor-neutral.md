# ADR-0001: Self-hosted, MIT, vendor-neutral product

- Status: accepted
- Date: 2026-11-14
- Owners: product + architecture
- Supersedes: —
- Revisit trigger: a deliberate owner decision to offer a hosted service, or a dependency that
  cannot be self-hosted.

## Context

The PoC proved a self-hosted AI review jury on Cloudflare. The owner has directed that Jury Forge
is a **self-hosted code reviewer**, **MIT-licensed**, and **not** the Cloudflare approach. The
product must run on infrastructure an operator controls, with no required central service.

## Options

1. **Self-hosted, MIT, vendor-neutral.** The operator runs the product; the project ships software
   and docs; no custody of customer code.
2. **Hosted SaaS.** Easier onboarding, but contradicts the privacy thesis and creates custody,
   billing, and multi-tenant obligations.
3. **Open-core with a hosted tier.** A permissive core plus paid features; risks a two-tier product
   and a licence trap.
4. **Cloudflare-specific self-hosted.** Cheap to deploy, but locks the product to one runtime and
   repeats the PoC's constraints.

## Decision

Option 1. The core product is MIT, self-hosted first, and vendor-neutral. The reference deployment
runs on ordinary Linux with containers and PostgreSQL. Cloudflare is not a supported target for the
core architecture.

## Consequences

**Easier:** trust, privacy, adoption by teams that cannot use a SaaS, contribution, forking.

**Harder:** install/upgrade/backup must be excellent; support is distributed; no central telemetry;
we cannot push a fix to every instance.

**Not allowed without a new ADR:** a required managed service, a licence server, a closed plugin
required for core review, a Cloudflare-specific runtime dependency.

## Security and operations

- The project holds no customer data.
- The operator owns secrets, backups, and network policy.
- Security fixes must be shippable as signed releases and documented upgrade steps.
- A hosted demo, if any, must be clearly separate and hold no customer code.

## Evidence

- Owner directive, 2026-11-14.
- PoC D-004 (self-hosted, single-tenant) and D-005 (private app/credentials).
- `docs/product/vision.md`, `docs/product/principles.md`, `docs/analysis/inherit-reject.md`.

## Follow-ups

- ADR-0003 (deployment), ADR-0004 (storage), ADR-0005 (runtime).
- Add `SECURITY.md` and a disclosure process before public launch.
- Ensure every dependency is MIT-compatible.
