# ADR-0028: v1 resolution rights — maintainers override, the owner decides critical findings

- Status: accepted (owner decision, 2026-11-27)
- Date: 2026-11-27
- Owners: product + security
- Amends: ADR-0012 (human override, for the v1 role set), Q-028 (resolve rights)
- Supersedes: —
- Revisit trigger: the dismissed-then-reopened rate for maintainer overrides goes above the
  wrong-resolution budget (2 %, ADR-0024), the first abuse report, or v1.2 adding admin and SME.

## Context

ADR-0012 and Q-028 define human override for the full role model: owner and admin act on any thread,
SME acts in its domain, a **maintainer can only reopen**, author and member reply, auditor reads.

v1 ships only **owner, maintainer, and reader** (ADR-0023). With no admin or SME, the ADR left the
owner as the only person who could accept or dismiss a finding in Jury Forge — one person for a
20–200 person organisation. Three documents had already drifted away from the ADR:

- `scope.md` §3: "owner/maintainer override is v1";
- `v1-ui.md` acceptance: "Owner/maintainer can override a resolution/reopen";
- `jury-output.md` §1 rule 5: "a maintainer/SME/admin can accept, dismiss, or reopen".

The owner chose on 2026-11-27.

## Options

1. **Maintainers override; the owner decides critical findings** (chosen). No single-owner
   bottleneck; the highest-severity calls stay with the accountable role.
2. **Full maintainer override.** Matches the drifted documents; a maintainer could dismiss a
   critical security finding on their own PR's repository.
3. **Keep ADR-0012 (reopen only).** Strictest; the owner becomes the bottleneck for every dismissal.

## Decision

| Actor (v1) | Accept a finding | Dismiss a finding | Reopen | Resolve in the UI |
| ---------- | :--------------: | :---------------: | :----: | :---------------: |
| Owner | ✓ | ✓ (any severity) | ✓ | ✓ |
| Maintainer | ✓ | ✓, **except `critical`** | ✓ | ✓, **except `critical`** |
| Reader | — | — | — | — |
| PR author | reply and appeal (S1) only | — | — | — |

- Every override needs a **reason**, is **audited**, and feeds the reviewer scorecard. The agent
  does not re-resolve or re-raise an overridden finding without new evidence (ADR-0012).
- A maintainer can **reopen** a critical finding and can ask the owner to decide; only the owner
  dismisses it or resolves it in the UI.
- **MVP:** one operator, the claimed owner, so the owner row applies.
- **v1.2:** admin and SME get their ADR-0012 rights. The maintainer keeps the rights in this ADR
  unless a later ADR narrows them.

**GitHub-native resolution.** Anyone with write access can resolve a thread in GitHub, and ADR-0012
says the session records that and does not fight it. That stays true. For a `critical` finding, a
native resolve by someone other than the owner is recorded as a human resolve but **does not clear
a `failure` merge gate** (Q-043): only a verified fix (S2) or an owner dismissal does. This is the
default assumption in Q-049 until the owner confirms it.

## Consequences

- Teams can triage noise without waiting on one person.
- Critical findings have one accountable decider, which is what a security lead needs from the
  audit trail.
- The authorization check needs the finding's severity, not only the actor's role.

## Security and operations

- Authorization is enforced in the service layer, never only in the UI (`security.md` §6).
- A maintainer cannot change a finding's severity, so the critical rule cannot be bypassed by
  downgrading first. Severity comes from the chair (ADR-0025 §4) and can be lowered by an appeal
  (S1); both are audited.
- Override reasons are untrusted text; they are stored and shown, never sent to a model as
  instructions.

## Evidence

- [`ADR-0012-pr-sessions-and-resolution.md`](ADR-0012-pr-sessions-and-resolution.md) (human override).
- [`../analysis/open-questions.md`](../analysis/open-questions.md) Q-028, Q-043.
- [`../product/scope.md`](../product/scope.md) §3, [`../product/specs/v1-ui.md`](../product/specs/v1-ui.md),
  [`../product/specs/jury-output.md`](../product/specs/jury-output.md) §1.

## Follow-ups

- Align `scope.md`, `v1-ui.md`, `jury-output.md`, `security.md` §6, the Q-028 row, and the ADR
  indexes (done with this ADR).
- Owner to confirm Q-049 (native resolve of a critical finding and the merge gate).
