# ADR-0035: `org_id` on every tenant-owned table, enforced by composite foreign keys

- Status: accepted (owner delegated the decision, 2026-11-28; readiness review; the exception list amended by ADR-0037, 2026-11-28)
- Date: 2026-11-28
- Owners: architecture + security
- Amends: [`../architecture/data-model.md`](../architecture/data-model.md) design rule 1 ("directly
  or through a parent"); [`../architecture/technical-approach.md`](../architecture/technical-approach.md)
  §3.2 (tenancy line). Refines ADR-0008 ("the data model is tenant-scoped from day one").
- Supersedes: —
- Revisit trigger: multi-installation or multi-org support (technical-approach §3.2 "Later"), the
  row-level security decision, or a measured write or storage cost from the extra keys.

## Context

ADR-0008 requires that every query is tenant-scoped. Technical-approach §3.2 says "every table
carries `org_id`". `data-model.md` rule 1 says rows are scoped "directly or through a parent". The
data model's own tables disagree: `reviewer_repo_bindings`, `model_probes`, `provider_models`,
`session_threads`, `turn_steps`, and others list no `org_id`. WP 1-09 makes `org_id` mandatory in
the store's repositories, and its exit test is cross-tenant isolation. The WP 1-08 migrations
cannot be written until this is settled.

v1 uses no row-level security (technical-approach §3.2). The only tenant controls are the store's
repository layer and the tests (`security.md` T-12). v1 runs one org per instance, so a mistake
leaks nothing today. Multi-org is a stated future, however (ADR-0008, the revisit trigger in §3.2),
and a schema that relies on joins for scoping is costly to change once data exists.

One more constraint: first-run setup writes rows **before the owner claim**, such as the public
origin (ADR-0021), the GitHub App secrets, the installation, and audit events. Those rows need a
tenant too.

## Options

1. **Scope child tables through their parent** (the data-model rule as written). Fewer columns. But
   every query on a child table needs a join to be scoped. "Mandatory `org_id` in queries" (T-12)
   cannot then be checked mechanically, and a missed join is a silent cross-tenant read. Rejected.
2. **`org_id` on every tenant-owned table, checked in code only.** Queries filter on the table they
   read, but nothing stops a child row from pointing at another org's parent. Rejected as
   incomplete.
3. **`org_id NOT NULL` on every tenant-owned table, plus composite foreign keys.** Every tenant
   reference is `(org_id, parent_id) REFERENCES parent (org_id, id)`, and each parent has
   `UNIQUE (org_id, id)`. The database refuses a cross-tenant link. **Chosen.**

## Decision

Option 3.

1. **Every tenant-owned table has `org_id uuid NOT NULL REFERENCES orgs (id)`.** That covers every
   table in `data-model.md` except the exceptions in point 4. The indicative column lists there do
   not repeat it.
2. **Tenant references are composite.** A foreign key from one tenant-owned table to another is
   `(org_id, <parent>_id) → <parent> (org_id, id)`. Every referenced parent table has
   `UNIQUE (org_id, id)`. Polymorphic references, which have no foreign key (`audit_events.target_id`,
   `budgets.scope_id`), are scoped by the store and covered by the cross-tenant tests.
3. **Indexes and uniqueness lead with `org_id`** where a query filters by tenant. For example,
   `finding_fingerprints` is unique on `(org_id, repository_id, fingerprint)`.
4. **Exceptions, which have no `org_id`:**
   - `users` and `user_sessions`. A GitHub identity is instance-level and may belong to several orgs
     later. Access to an org is checked through `orgs.owner_user_id`, GitHub repo access, and the
     v1.2 `role_bindings`.
   - graphile-worker's own schema, and the migration bookkeeping table.
5. **The instance org exists before setup.** The first migration creates the instance's single org
   row, with `owner_user_id` NULL (unclaimed). Every row written before the claim carries that org's
   id. The first-owner claim (first-run-setup Stage 3) sets `owner_user_id`. How `name` and `slug`
   are filled is a detail for WP 1-16, not part of this decision.
6. **Jobs carry the tenant.** Every job payload includes `org_id`, and the handler's store calls use
   it.
7. **The store makes `org_id` a required argument** of every repository function for a
   tenant-owned table. A table missing `org_id`, other than the listed exceptions, fails a
   migration test.

## Consequences

- WP 1-08 writes the composite keys from the first migration. WP 1-09's cross-tenant tests gain a
  database-level case: inserting a child that points at another org's parent fails.
- Row-level security stays out of v1. If it is adopted later, it is one policy on `org_id` per
  table, with no schema migration.
- Org-scoped purge, export, and retention become single-column deletes and selects
  (`data-model.md`, Retention).
- Cost: one 16-byte column per row and one composite index per parent table, which is negligible at
  the v1 sizing floor (Q-048). Writes must supply `org_id`, which the store already has from the
  request or job context.

## Security and operations impact

- It closes the "missed join" class of the T-12 tenant-isolation failure. Scoping is visible on
  every table, and the database enforces cross-tenant references.
- No change to backups or deployment.
- `doctor` and the migration test can check that every non-exempt table has a non-null `org_id`.

## Evidence

- ADR-0008 ("every query is tenant-scoped"); technical-approach §3.2 ("every table carries
  `org_id`") against `data-model.md` rule 1 ("directly or through a parent") and its MVP tables
  that list no `org_id`.
- `security.md` T-12 (controls: "mandatory `org_id` in queries", no row-level security in v1).
- WP 1-08 and WP 1-09 in `delivery/implementation-plan.md`.
- First-run-setup: the origin step (ADR-0021) and the App creation run before the owner claim.
