# Quality spike: 3-reviewer T0 jury vs single-model baseline (2026-11-15)

- Status: **BLOCKED — NOT RUN.** No results exist. No decision is made.
- Owner question: [ADR-0023](../decisions/ADR-0023-product-direction.md), Workstream A.
- Harness: [`spikes/quality/`](../../spikes/quality/README.md) (throwaway, not product code).

## Summary

1. **Question:** does a 3-reviewer T0 jury (Security, Correctness, Tests) with a chair step beat one
   strong model prompt on the same diff, on precision and recall?
2. **Answer:** not yet known. The experiment was not run.
3. **Evidence:** the protocol, prompts (hashed below), and scoring rules are pre-registered. The
   offline harness plumbing passes 8/8 unit checks. No model was called.
4. **Blocker 1:** no experiment provider key or model was supplied (`PI_*` variables name the
   harness's own model, not an approved experiment provider).
5. **Blocker 2:** no dataset. Five public PRs and a human-authored ground-truth list do not exist.
   The PoC guinea-pig PR (`PrakashSewani/jury-forge-guinea-pig#3`) has findings, but they are model
   output checked by one human pass ([`live-instance.md` §4](../poc/live-instance.md)), and the
   baseline PoC model already saw them. It is contaminated and is not ground truth.
5. **Blocker 3:** owner permission to send PR code to a provider. The dataset must be public or
   synthetic unless the owner says otherwise.
6. **Caveat:** nothing below supports GO, NO-GO, or CHANGE DIRECTION. Those require the run.
7. **Decision rule (pre-registered, unchanged):** the jury must beat the baseline by ≥ 10 points on
   precision or recall without a ≥ 5-point regression on the other, or the 3-reviewer jury is a
   NO-GO as the differentiator. With 5 PRs, even a clear result is directional, not significant.
8. **Budget:** ≤ $25 and ≤ 2 h, unspent.
9. **Next action:** the owner supplies the items in §8.
10. **Install readiness:** a separate pre-test is recorded in
    [`install-readiness-2026-11-15.md`](install-readiness-2026-11-15.md).

## 1. Protocol (pre-registered)

Conditions, identical diff and metadata, temperature 0, same schema, same token cap (4096 output),
same parsing and validation:

| Cond | Calls per PR | Description |
| ---- | ------------ | ----------- |
| **A. Baseline** | 1 | One general review prompt, diff only, structured JSON findings. |
| **B. Jury** | 4 | Security, Correctness, and Tests reviewers (diff only, in parallel), then a Chair that dedupes, assigns severity, and records dissent. |
| **C. Optional** | 4 | Jury with a different model family per reviewer. Only if budget allows. |

Shared inputs for every condition: the annotated diff (new-side line numbers, §3 of the harness
`src/diff.mjs`), PR title and body (capped at 3,000 characters), and the repository's `AGENTS.md`
and `CONTRIBUTING.md` at the base SHA (capped at 6,000 characters each). No tool calls, no repository
file reads, no branch review, no retries that change the prompt.

Parsing: strict JSON. One outer code fence is tolerated, nothing else. A response that fails JSON or
top-level validation scores zero findings and counts as a parse failure. An invalid finding is
dropped and counted.

Scoring rules, fixed before any result:

- **Match:** a finding matches a ground-truth item when the file is the same, the line is within ±3,
  and the category or claim overlaps (token Jaccard ≥ 0.5 on claim text, or category match). Each
  ground-truth item can be matched once.
- **Precision** = matched findings / published findings. **Recall** = matched ground-truth items /
  ground-truth items. **F1** = harmonic mean.
- **Valid-finding rate:** findings a human marks as valid against the diff / findings published.
- **Duplicate rate:** findings that repeat another finding in the same condition (same file, line
  within ±3, claim Jaccard ≥ 0.5) / findings published.
- **Severity accuracy:** matched findings whose severity equals the ground-truth severity / matched.
- **Grounding rate:** findings whose cited file and line exist in the new-side diff and whose
  `evidence` text appears within ±2 lines of that line / findings published.
- **Parse-failure rate:** responses that fail §1 parsing / responses.
- **Cost** from reported usage × list price in the run record. **Latency** = wall clock per PR.

Decision rule (from [`spikes/quality/config.json`](../../spikes/quality/config.json)): the jury
beats the baseline if it leads by ≥ 10 points on precision or recall, and does not trail by more than
5 points on the other. Otherwise: **NO-GO** for the 3-reviewer jury as the differentiator. If recall
for both conditions is below 0.6, record **CHANGE DIRECTION** candidates (branch review, per
ADR-0023) and do not claim the jury is useless.

## 2. Prompts (hashed before running)

SHA-256 of raw file bytes, as written on 2026-11-15, before any model call:

| File | SHA-256 |
| ---- | ------- |
| `prompts/baseline.md` | `87456f0b607efee47f9079fd025a514dd4214fa73453bb0c0b272fb6204ad66c` |
| `prompts/security.md` | `e3f5ffab53910b1e44450eee154cfa124b7ffe566ce35ac7417c9cca1d5bb46e` |
| `prompts/correctness.md` | `c288238fc1032a886dfd10a3a9dd3074a0bb97664b31b4ff0b4fba7d23bbdd62` |
| `prompts/tests.md` | `b5722cb0105cfeeeae02cf46194dfbd489001855c1923db8e9607ebf200e00b4` |
| `prompts/chair.md` | `e0362ebded9ff50ed44d3631e562fa92ad00a80f35f47ee4d4fffb1a71f94dd8` |
| `prompts/_data-rules.md` | `b8d1f43b7c2d6ec09f7f63a53cbd451ec02e99a75b68a702ad0585b85f6a37d4` |
| `prompts/_schema.md` | `1de6091a394aad7db9551b1dcb0d32f6ed4094f6b1e0756ea433a2204e3696c4` |
| `prompts/_user.md` | `8b4a9b5d6b3aa8cd4c3d9db619aae1ba33aec7bb30f58e08cf80b33b26458789` |
| `config.json` | `f54c2aff9f5c0917ef2c228975dbe209b42f27ecf49ad50f6ad222a52deacad5` |

Any change after results are seen is recorded here and the run is repeated (§6).

Untrusted-input handling: PR text, repository instruction files, and other reviewers' output are
wrapped in nonce-delimited data blocks, and the rules state they are data, never instructions
(`prompts/_data-rules.md`). This is a spike control, not a product claim about prompt-injection
defence; that claim needs its own test suite (flaws F-003).

## 3. Dataset

**None fixed.** The protocol requires five real PRs from public repositories (or the guinea pig plus
four others), each with a human-authored ground-truth list of `file`, `line`, `severity`, and a
one-line claim. A model must not generate ground truth. Selection criteria, to be approved by the
owner before any run:

- Public, permissively licensed repositories, at least one non-trivial security-relevant PR, one
  correctness-heavy PR, and one with a test-quality concern.
- Diffs under the 100,000-character cap; no binary-only or merge-commit PRs.
- Ground truth written by a human who did not see any model output for that PR, with a second
  human check on severity.

## 4. Models

**Not chosen.** The owner must name the provider, model, base URL, and the per-token prices used for
cost. The harness refuses plain HTTP to a non-local host and refuses any key that is not in an
environment variable. No key was read or stored.

## 5. Results

None. The following are recorded as zero, not estimated: precision, recall, F1, valid rate, duplicate
rate, severity accuracy, grounding rate, parse failures, cost, latency, and raw counts.

## 6. Change log

- 2026-11-15: protocol, prompts, and config written and hashed. No change after results.

## 7. Threats to validity (for the eventual run)

- **Five PRs** cannot support a statistical claim. A 10-point gap is about one or two matched
  findings per PR; treat the outcome as directional.
- **Ground truth bias:** the writer may know the jury design. Mitigation: a blind second reader.
- **Contamination:** the guinea pig's findings are already public in the repository. Excluding it
  or using it only as a control is preferred.
- **Model asymmetry:** one call versus four plus a chair means the jury also has more context and
  more output tokens. Report cost per PR beside the scores, so the comparison is not only quality.
- **Temperature 0 is not determinism** across hosted endpoints. Record the observed variance by
  re-running one PR.
- **Parser asymmetry:** the jury has a chair that can drop findings. Count dropped and dissent
  entries separately so the chair's effect is visible.

## 8. What is needed to run (owner)

1. An experiment provider key (environment variable name only, no key in chat or in the repo), plus
   model names, base URLs, and per-token prices.
2. Five PRs, or permission to propose candidates for approval, plus who will author ground truth.
3. Written permission to send the chosen public or synthetic diffs to that provider.
4. Confirmation that the guinea-pig PR may be used as one case, given its prior exposure.

Once received, the run is: `npm run spike` in `spikes/quality/`. That command is not implemented
yet; the fetch, run, and scoring modules are the next build step after the dataset is approved.
