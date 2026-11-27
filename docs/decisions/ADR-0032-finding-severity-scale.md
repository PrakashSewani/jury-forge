# ADR-0032: Finding severity scale and ranking weights

- Status: accepted (owner decision, 2026-11-28; architecture audit Q-A)
- Date: 2026-11-28
- Owners: product + review quality
- Supersedes: —
- Revisit trigger: the Phase 3 replay benchmark shows the ranking buries findings humans accept, or
  operators ask for a non-actionable `info` level.

## Context

Several accepted decisions depend on a finding severity, but no accepted document listed the levels:

- ADR-0024 §6 lets the bot resolve in `auto` only when the severity is below `critical`;
- ADR-0028 lets only the owner dismiss or resolve a `critical` finding;
- suppressions never apply to `critical` (S4);
- `gate: critical` makes the Check Run conclusion `failure` (technical-approach §14);
- the chair takes "the highest severity among confirming jurors" and ranks by
  `severity × confidence × agreement` (ADR-0025 §4), so each level needs a numeric weight.

The only example, in `architecture/ai-pipeline.md` §6, used `info|warning|error`, which has no
`critical`. The `contracts` schema for M1.5 needs the scale. The architecture audit
([`../analysis/architecture-audit-2026-11-28.md`](../analysis/architecture-audit-2026-11-28.md), Q-A)
raised it.

## Options

1. **Four levels: `critical | high | medium | low`.** These are the same words as the risk score
   (S9: `low`/`medium`/`high`/`critical`), so the product has one vocabulary (principle 9). Nits are
   `low`.
2. **Five levels, adding `info`** for non-actionable notes. That is an extra level whose only job is
   to be ignored; summaries already carry context.
3. **Three levels, `critical | warning | note`.** It maps straight onto SARIF, but it does not match
   the four-level risk score, and "warning" mixes ordinary bugs with nits.

For the ranking weights: doubling (8/4/2/1), linear (4/3/2/1), or no default (repo-defined).

## Decision

Option 1, with doubling weights. Chosen by the owner on 2026-11-28.

| Severity | Meaning | Ranking weight | SARIF level |
| -------- | ------- | -------------: | ----------- |
| `critical` | An exploitable security flaw, a leaked secret, or data loss or corruption | 8 | `error` |
| `high` | A likely bug or security weakness with real impact | 4 | `error` |
| `medium` | A real issue with limited impact | 2 | `warning` |
| `low` | A minor issue or a nit | 1 | `note` |

- The scale is ordered `critical > high > medium > low`. The chair's "highest severity" and the
  policy cap use this order.
- The weights only order and trim findings under the noise budget. They never change a finding's
  severity. They are fixed in v1: there is no `.jury-forge.yml` key for them (technical-approach
  §14), and the receipt prints them with the other chair rules.
- Whether a severity blocks a merge is the `gate` policy's decision, not the severity's. Under
  `gate: critical`, only `critical` findings fail the Check Run.
- A juror's output is validated against this enum; an unknown value is rejected, not mapped
  (technical-approach §3.4).
- A secret found in added lines is always `critical` (technical-approach §3.10).

## Consequences

- One vocabulary across findings, the risk score, and the UI.
- A single `critical` finding outranks several lower findings even at lower confidence, which
  matches the guards that already treat `critical` specially.
- SARIF export and a future CLI exit-code threshold get a fixed mapping.
- A later `info` level would be additive (a new enum value with weight 0), but it would need a new
  ADR.

## Security and operations

- `critical` drives authorization (ADR-0028) and the auto-resolve guard (ADR-0024 §6). Only the
  chair sets severity, and an appeal can only lower it (ADR-0028), so a maintainer cannot dodge the
  owner-only rule by downgrading first.
- The juror prompts must define the four levels in the same words as this ADR. A prompt change
  needs a passing stub-model eval (technical-approach §16).

## Evidence

- ADR-0024 §6; ADR-0025 §4; ADR-0028; technical-approach §3.4, §3.10, §14, §16.
- `product/specs/standout-features.md` S3 (noise budget), S4 (suppressions), and S9 (risk score).
- `product/specs/jury-output.md` §1, which now points here.

## Follow-ups

- M1.5: put the enum and weights in `contracts` and `domain`, with property tests for the ordering
  and the ranking.
- The juror prompt files define the levels in these words.
