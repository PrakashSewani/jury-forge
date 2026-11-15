# ADR-0009: MIT licence, no CLA

- Status: accepted
- Date: 2026-11-14
- Owners: owner
- Supersedes: —
- Revisit trigger: a legal or sustainability requirement that cannot be met under MIT (requires an
  owner decision and a new ADR).

## Context

The owner has stated the project will be MIT-licensed. A self-hosted product's licence is part of
its trust story: operators must be able to inspect, modify, and run it commercially without a
licence server or a contributor agreement.

## Options

1. **MIT, no CLA.** Maximum adoption and contribution; no copyleft; a competitor can host it.
2. **Apache-2.0.** Patent grant; slightly more ceremony; compatible with the same goals.
3. **AGPL.** Protects against hosted competitors; scares some enterprises; conflicts with the
   "run it anywhere" simplicity.
4. **Open-core / BSL.** Protects revenue; undermines the open-source promise.

## Decision

Option 1. The repository is MIT (see `LICENSE`). No CLA. Contributions are accepted under the
inbound=outbound norm; a DCO-style sign-off is optional if the owner wants it later.

## Consequences

**Easier:** adoption, forking, commercial self-hosting, contribution, trust.

**Harder:** a competitor can offer a hosted version; there is no copyleft lever. The answer is
product quality, not licence restrictions.

**Not allowed without a new ADR:** a closed core feature, a licence key, a required hosted service,
or a contributor agreement.

## Security and operations

- Dependency licences must be compatible with MIT; add a licence audit to CI.
- Do not vendor code with an incompatible licence.
- Keep the copyright notice and the licence file in distributions.
- A commercial support offering is allowed; it must not subtract from the open product.

## Evidence

- Owner directive, 2026-11-14.
- PoC `LICENSE` (MIT) and the owner's stated intent.
- `docs/product/principles.md` principle 10.

## Follow-ups

- Add `CONTRIBUTING.md` with the contribution terms (no CLA).
- Add a dependency licence check to CI.
- Add `SECURITY.md` and `CODE_OF_CONDUCT.md` before public launch.
