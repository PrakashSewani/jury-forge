# ADR-0025: v1 review pipeline — T0+ context, verifier, code-first chair, model roles

- Status: accepted (G0, 2026-11-16; large-PR fitting + coverage manifest in MVP)
- Date: 2026-11-16
- Owners: architecture + review quality
- Amends: ADR-0019 (rejection of T1 stays; T0+ is narrower), ADR-0011 (model roles), ADR-0023 (v1 scope)
- Closes (proposed): Q-037, Q-038, Q-040, Q-041, Q-044
- Revisit trigger: the Phase 3 replay benchmark, or cost per accepted finding above budget.

## Context

The capability deep dive ([`../analysis/capability-deep-dive-2026-11-16.md`](../analysis/capability-deep-dive-2026-11-16.md))
found five weaknesses in the v1 pipeline compared with the market:

1. Strict T0 cuts a hunk mid-function, so jurors guess at signatures and guards. PR-Agent extends
   each hunk to its enclosing function.
2. Nothing between the jurors and the chair drops ungrounded claims. CodeRabbit runs a dedicated
   verification agent.
3. The chair is a prompt, so dedup and severity are not reproducible.
4. Every task uses the expensive model. Greptile separates "smart" and "fast" models.
5. Large PRs fall back to a silent partial review, and existing CI evidence is ignored.

## Decision

### 1. T0+ context for PR review

Each hunk is expanded to its **enclosing function, method, or class** in the head version of the same
file. The enclosing unit is found with tree-sitter; if no parser exists for the language, the
fallback is ±20 lines. The cap is 200 lines per hunk. No file outside the diff is read. The
expansion is deterministic and listed in the coverage manifest. T1 (reads of arbitrary files)
stays rejected.

### 2. Large-PR fitting and a coverage manifest

Files are ordered by the repo's main languages, additions come before deletion-only hunks, and
patches are fitted to the token budget largest-first. What does not fit is listed as
`summarised` (name + stats) or `skipped`. The **coverage manifest** (reviewed / expanded /
summarised / skipped / excluded, each with a reason) is part of the receipt. The review body states
partial coverage in its first line whenever it applies.

### 3. Evidence ingest

The PR's linked issue (title and body, same forge) and SARIF results from the PR's completed check
runs are added as **trust-labelled evidence blocks**. Jurors may adopt an analyzer result. Nothing
from analyzers is posted unless a juror adopts it and the verifier confirms it. Running analyzers
ourselves is v1.x and needs its own ADR.

### 4. Pipeline order

```
resolve → fetch → plan(T0+) → review* (jurors, parallel) → ground (code) → verify (model, non-voting)
        → chair (code) → summarise (fast model) → publish → evaluate
```

- **ground** (code): file, line, and quoted evidence exist at the reviewed SHA; any suggestion
  applies cleanly.
- **verify** (reasoning model, one call per review): for each grounded candidate it answers
  `confirmed | unconfirmed | wrong` with a reason. `wrong` findings are dropped and
  `unconfirmed` ones are collapsed. The verifier does not vote, add findings, or change severity
  upward.
- **chair** (code only): merge by fingerprint (ADR-0024 §4); severity = the highest severity among
  confirming jurors, capped by policy; agreement = jurors flagging the finding ÷ jurors that saw the
  file; rank by `severity × confidence × agreement`; apply the noise budget (S3) and suppressions
  (S4). These rules are printed in the receipt.
- **summarise** (fast model): the 3-line review summary and the dissent text only.

### 5. Model roles

The instance binds two catalog models: **`reasoning`** (jurors, verifier, appeals) and **`fast`**
(reply-intent classification, summaries, risk explanation). A reviewer may override `reasoning`.
Prompts use a stable prefix order (system → instructions → packs → evidence → diff) so provider
prompt caching applies; cache hits are recorded in the receipt.

## Options considered

1. Keep strict T0, a prompt chair, and one model. Simple, but low precision and high cost.
2. Allow T1 bounded reads. Rejected again; it reopens ADR-0019 and the injection surface.
3. **This ADR.** Deterministic context and decisions, with models used only where judgement is
   needed. **Chosen.**

## Consequences

- Better precision and reproducibility; the receipt explains every inclusion, omission, and merge.
- Lower cost per reply.
- New dependency: tree-sitter grammars (MIT). Language coverage is uneven; the fallback is recorded.
- One more model call per review (the verifier).

## Security and operations

- T0+ reads only head-SHA content of files already in the diff; no new egress class.
- SARIF and linked-issue content is untrusted, so it is trust-labelled and covered by the injection corpus.
- New metrics: verifier drop rate, coverage ratio, cache-hit ratio.
