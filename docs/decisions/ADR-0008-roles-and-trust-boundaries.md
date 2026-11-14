# ADR-0008: Roles and trust boundaries

- Status: proposed
- Date: 2026-11-14
- Owners: security + architecture
- Supersedes: the PoC's single-owner access model
- Revisit trigger: v1 launch, or the first multi-user deployment.

## Context

The PoC assumed a single owner: any session that passed the installation-access gate could read and
change everything, including reusing a stored model key with an arbitrary base URL. That is not safe
for a team product, and it is expensive to retrofit. The product also treats PR content, repository
files, packs, and model output as untrusted, but the PoC piped them into prompts without a trust
boundary.

## Options

1. **Single-owner only.** Simplest; excludes teams; unsafe for shared instances.
2. **Installation-access gate + roles.** GitHub access decides who may enter; app roles decide what
   they can do; tenant scoping isolates data.
3. **Full external IdP/SSO from v1.** Strong; more setup; can be optional with GitHub OAuth as the
   default.
4. **No roles, rely on network isolation.** Not acceptable for a self-hosted team product.

## Decision

Option 2. The data model is tenant-scoped from day one. Roles: owner, admin, maintainer, viewer,
auditor. Every mutating endpoint has an authorization test. Single-operator mode is a tenant with
one member, not a bypass. Trust boundaries are explicit in the prompt and enforced in code
(grounding, output validation, egress binding). SSO is a later adapter behind the identity
interface.

## Consequences

**Easier:** teams can share an instance; audit and least privilege are possible; security review can
pass; the model generalizes to multi-installation.

**Harder:** more schema, UI, and tests; role UX; migration from a single-owner mental model;
credential-use permissions.

**Required invariants:** every query is tenant-scoped; every mutation is audited; a credential is
bound to an allowed origin; untrusted data never becomes instructions; a finding without evidence is
not published inline.

## Security and operations

- Authorization matrix in `docs/architecture/security.md`.
- Row-level security as defense in depth.
- Re-auth for credential/role/data-export changes.
- Session revocation and membership-change invalidation.
- Audit events for every mutation and egress decision.

## Evidence

- `docs/architecture/security.md`.
- `docs/analysis/flaws.md` F-003, F-004, F-029, F-030, F-035.
- PoC D-012, D-024 (access), and the missing role model.

## Follow-ups

- Write the authorization matrix into code and tests.
- Decide the first-run bootstrap flow (one owner, explicit).
- Decide whether viewer/auditor can see prompts and raw responses (default: no).
- Add a security review to the G2 gate.
