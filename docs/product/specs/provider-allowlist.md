# Spec: Per-repo provider allowlist and data zones (B-02)

- Status: draft — **promoted to v1.2** (Q-033, roadmap v1.2; earlier only if a security buyer requires it). Owner approval of this spec is pending.
- Owner: product + security
- Date: 2026-11-15
- Principles: 1 (operator owns the instance), 3 (prompt is not a boundary), 4 (secure and private by
  default), 8 (fail visibly)
- Related ADRs: ADR-0001, ADR-0008, ADR-0011 (providers), ADR-0016 (bindings), ADR-0014 (T2 graph)
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Problem

The product promises that code leaves the perimeter only through requests the operator explicitly
configures. Today the controls are instance-wide: a provider key is origin-bound and egress is
policed globally. A real organisation has repos of different sensitivity ("payments: local model
only; docs: any provider"). Without repo-level control, the only safe choice is to restrict the whole
instance to the most sensitive repo's needs, or to trust every reviewer binder to pick correctly.

## Users and jobs

- **P2 Security lead:** "Guarantee that this repo's code never reaches a third-party model."
- **P1 Platform engineer:** "Set the rule once; reviewers and routers obey it."
- **P6 Auditor:** "Show which providers saw which repo's code."

## Behaviour

1. An admin tags each configured provider with a **zone** (a short operator-defined label such as
   `local`, `self-managed`, `third-party`). A provider has exactly one zone; untagged providers are
   `unclassified`.
2. An admin sets a **data policy** per repo (or an org default, overridden per repo) in one of two
   forms: an explicit **allowlist of providers**, or a **minimum zone** requirement. The instance
   default policy is "all providers the admin has added" in the single-operator MVP (labelled, since
   adding a provider is itself an explicit act) and is changeable to "deny until set".
3. The policy is enforced at three points; the last one is authoritative:
   - **Bind time:** a reviewer whose model's provider is disallowed for the repo cannot be bound; the
     UI explains why.
   - **Route time:** the router skips a reviewer whose provider is disallowed and records the reason.
   - **Call time:** the provider gateway refuses any model call for that repo to a disallowed
     provider, records a deny audit event, and never falls back to another provider.
4. The rule covers **every** call that carries repo content: reviewer turns, chair, verifier,
   summarizers, and any later feature that sends repo-derived text (including branch/T2 context
   and knowledge mining, B-06).
5. A **required** reviewer made unavailable by policy triggers the "required reviewer unavailable"
   fallback comment (ADR-0016); the review does not run a partial jury silently. A `default` or
   `capability` reviewer is skipped with the reason recorded and a visible note; it never causes a
   cross-provider fallback.
6. An **egress ledger** per repo lists, by period, which provider received content, model, token
   counts, and the policy decision. Content itself is not stored in the ledger.

Edge cases:

- Policy tightened mid-session: the next model call re-evaluates; an in-flight call completes only if
  it already left, otherwise it is cancelled; the session shows "policy changed".
- Provider zone changed by an admin: all repo policies referencing the zone are re-evaluated and the
  change is audited with the affected repos listed.
- Local server with a public base URL: the zone is the admin's assertion, not auto-detected; the UI
  warns that the base URL is not loopback/private.
- Provider deleted while referenced: bindings show `configuration_error`; policy is not widened.

## Non-goals

- Not automatic content classification or DLP (redaction is a separate control).
- Not per-file or per-path policies in the first cut.
- Not a guarantee about what a provider does with data; that is the operator's contract with the
  provider. The spec only controls where requests go.

## Acceptance criteria

- [ ] Given a repo allowing only provider A, when any turn would call provider B for that repo, then
      the gateway denies the call, audits it, and no request leaves the instance.
- [ ] Given a policy that excludes a reviewer's provider, when binding it, then binding is refused
      with the reason shown; when routing, the skip reason is recorded.
- [ ] Given a required reviewer excluded by policy, when a review is triggered, then the fallback
      comment is posted and no review runs.
- [ ] Given tightened policy mid-turn, then no further call to the now-disallowed provider occurs.
- [ ] The egress ledger totals match the provider-call records for the repo.
- [ ] A test proves chair/verifier/summarizer calls obey the same policy as reviewer calls.

## Metrics

Deny events (should trend to zero after setup), repos with an explicit policy vs default, time to
answer an auditor's "which providers saw repo X".

## Security and privacy

- Enforcement is server-side in the gateway; the model and UI cannot bypass it (principle 3).
- Policy and zone edits require admin; every change is audited (before/after).
- The ledger stores metadata only (no prompts, no code).
- SSRF/origin binding of keys (ADR-0011) is unchanged; this adds a repo dimension on top.

## Failure modes

Misconfigured policy blocks all reviewers → the fallback comment states the policy is the cause and
who can change it. A policy store outage fails **closed** (deny), never open.

## Rollout

Backlog; target v1 if promoted, with the security phase. Migration: existing repos inherit the
instance default; docs include a "restricted repo" recipe.

## Open questions

- PA-01: ship allowlist only, or zones too? Default: both, because zones scale to many repos; close
  at spec review.
- PA-02: should the instance default be "allow all added providers" or "deny until set"? Default:
  allow in single-operator mode, deny in multi-user mode; close with the roles ADR.
