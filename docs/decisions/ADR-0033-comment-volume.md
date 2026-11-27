# ADR-0033: Comment volume — no noise budget by default, a fixed safety ceiling

- Status: accepted (owner decision, 2026-11-28; closes SF-01)
- Date: 2026-11-28
- Owners: product + review quality + security
- Amends: ADR-0025 §4 ("apply the noise budget (S3)") and ADR-0032 ("the weights only order and
  trim findings under the noise budget"); `product/specs/standout-features.md` S3
- Supersedes: —
- Revisit trigger: the Phase 3 replay benchmark or pilot feedback shows reviews regularly hit the
  ceiling, or operators ask for a product-level default cap.

## Context

S3 in `standout-features.md` gave every review a **comment budget of 7 inline comments**, with the
rest ranked into a collapsed summary. ADR-0025 §4 tells the chair to "apply the noise budget (S3)",
and ADR-0032 says the ranking weights "order and trim findings under the noise budget".

The number 7 had no evidence behind it. SF-01 listed it as "7?", and no analysis document gives a
source. The owner's position (2026-11-28): the product should not cap comments for taste. Noise is
controlled by how reviewers are defined (their charge, scope, and instructions). A product cap would
hide real findings and blame the reviewer's output on the platform.

One concern remains, and it is about safety rather than taste. PR content is untrusted
(`security.md`), so a prompt-injected diff or a misbehaving model can produce hundreds of grounded
but worthless findings. Posting them all would flood the PR, burn the installation's GitHub write
budget (secondary rate limits; ADR-0024 §7 write queue), and turn the bot into an amplifier for the
attacker.

## Options

1. **Keep a default noise budget (7, configurable).** Predictable and quiet. Rejected by the owner:
   the number is arbitrary, and the cap hides findings that a well-defined reviewer meant to post.
2. **No limit of any kind.** Every grounded finding is posted inline. Rejected: it leaves the
   injection and rate-limit risk open, which is a security floor (non-negotiable 6).
3. **No noise budget by default, plus a fixed safety ceiling.** Inline comments are not capped for
   taste. An optional per-repo cap exists for teams that want one. A high, fixed ceiling bounds abuse
   only. **Chosen.**

## Decision

Option 3.

- **No default noise budget.** Every grounded, non-suppressed finding that the verifier does not
  mark `wrong` is posted inline (v1 still collapses `unconfirmed` findings, ADR-0025 §4).
- **Optional repo cap.** `.jury-forge.yml` may set `review.max_inline_comments` (base SHA,
  technical-approach §14). It can only lower the ceiling. When it applies, findings are ranked by
  `severity × confidence × agreement` (ADR-0032 weights) and the overflow goes into the collapsed
  summary section.
- **Safety ceiling: 50 inline comments per review**, a code constant that no setting can raise. It
  is an abuse guard, not a quality setting. Findings past it are ranked the same way, listed in the
  review's collapsed section and in the UI, and counted in the receipt. Nothing is dropped silently.
- **`critical` findings always post inline**, even past a repo cap. Past the 50-comment ceiling they
  still go first in ranking.
- **Reviewer guidance.** The built-in reviewers and the reviewer editor tell operators to define a
  narrow charge and to skip style nits that a linter covers. A review that hits the ceiling says so
  in its summary and points to the reviewer settings.
- The ranking weights (ADR-0032) still order findings in the review body, the summary, and the
  inbox. They trim only under a repo cap or the safety ceiling.
- **Grounding is unchanged:** a finding that cannot quote a line from the diff is withheld and
  listed in the receipt, never posted (S3).

## Consequences

- A well-defined reviewer's findings all reach the author. A poorly defined one is noisy, and the
  fix is the reviewer definition, which the summary points to.
- The MVP is not affected: it has one reviewer and posts within forge limits (WP 1-34). WP 2-15
  implements the ceiling, the optional repo cap, and the overflow section.
- The ceiling is a constant in `domain`, tested, and printed in the receipt with the chair rules.

## Security and operations impact

- An injected or runaway review is bounded at 50 inline comments plus one summary. GitHub writes
  stay inside the per-installation write queue (ADR-0024 §7).
- Turn budgets (ADR-0024) and per-turn caps (Q-031) still bound tokens and time.
- New metric: `jf_review_inline_ceiling_hits_total`, so operators can see a reviewer that floods.
