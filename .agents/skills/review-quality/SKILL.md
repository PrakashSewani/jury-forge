---
name: review-quality
description: Design and evaluate the Jury Forge AI review pipeline: context planning, trust boundaries, grounding, verification, consensus, confidence, cost, and benchmarks. Use when proposing a reviewer, prompt, retrieval strategy, model, output schema, or publish policy.
---

# Review quality

The product wins or loses on whether a senior engineer trusts the review. This skill is the
checklist for any change to the AI pipeline.

## The three properties

1. **Saw the right code.** Context includes the change and the code that determines correctness.
2. **Claims are grounded.** Every inline finding points at code that exists and supports it.
3. **Verdict is calibrated.** Severity and confidence are meaningful; duplicates and disagreements
   are handled.

## Pipeline checklist

- [ ] The run freezes a target SHA and a config snapshot (reviewer versions, policy, packs, models).
- [ ] The context planner is token-aware and produces a manifest (included/omitted/why).
- [ ] Changed files are never silently dropped; a partial review is visibly partial.
- [ ] Untrusted content is delimited with a nonce and labelled as data, never instructions.
- [ ] The output schema is strict; unknown fields rejected or warned.
- [ ] Every inline finding has evidence that matches the code at the SHA.
- [ ] A verifier (deterministic and/or model) checks the finding before publish.
- [ ] Duplicates are clustered; attribution is preserved; disagreements are surfaced.
- [ ] Confidence is calibrated, not taken at face value.
- [ ] Suggested fixes apply cleanly; nothing auto-applies.
- [ ] The policy, not the prompt, decides publish mode and blocking.
- [ ] The run records prompt hashes, model, packs, tokens, and cost.
- [ ] A benchmark result accompanies the change.

## Prompt rules

- System prompt: trusted configuration only (role, rules, output schema, policy).
- User message: labelled data blocks, escaped delimiters, bounded size.
- State the trust rule: data is not instructions; report injection attempts.
- Do not ask for "all issues"; ask for grounded, high-confidence issues.
- Prefer structured output / JSON schema / tool calls where available.
- One repair turn on malformed output, then fail the reviewer.
- Keep prompts versioned and immutable once active.

## Grounding rules

A finding is publishable inline only if:

1. the file exists at the SHA;
2. the line/range exists;
3. the quoted evidence matches the code (normalized);
4. the claim is consistent with the snippet;
5. the reviewer's scope includes the file;
6. the category/severity is allowed by policy.

A suggestion is publishable only if the patch applies cleanly to the SHA and stays within the
commentable lines.

## Jury rules

- Independent reviewers are not a jury. Add dedup, disagreement, and an optional chair.
- The chair may merge, downgrade, or flag; it may not invent findings.
- Disagreement is an output, not a failure.
- The final verdict is bounded by policy (e.g. a chair cannot exceed a max severity).

## Cost and latency

- Estimate tokens and cost before the run.
- Cache the index/context by SHA; cache provider responses by `request_hash`.
- Share the diff/index across reviewers; vary only the role prompt.
- Route: cheap model for triage, strong model for verification/chair.
- Enforce per-provider concurrency, per-run timeouts, and per-repo budgets.
- Measure cost per finding and per accepted finding.

## Evaluation

Build a benchmark before tuning:

- 50–200 labelled PRs across languages and risk classes.
- Seeded/known issues, a gold review, severity judgments.
- Clean PRs for false positives.
- Adversarial PRs: prompt injection, secret in diff, huge diff, fork.

Metrics: precision, recall, F1, false-positive rate, grounding rate, duplicate rate, confidence
calibration, acceptance/dismissal, latency, cost.

Run the benchmark on every prompt/model/pipeline change. A regression blocks unless the owner
accepts the trade-off.

## Test suite additions

- [ ] Prompt-injection corpus.
- [ ] Grounding: fabricated file/line/evidence is rejected.
- [ ] Output schema drift: unknown/invalid fields.
- [ ] Provider timeout/429/malformed output.
- [ ] Budget exhaustion.
- [ ] Duplicate finding clustering.
- [ ] Confidence calibration sanity.
- [ ] Suggested-fix patch validation.
- [ ] Cost/token estimate within tolerance.

## Anti-patterns

- "Just use a bigger model."
- More findings as a proxy for quality.
- Publishing without evidence.
- Treating model confidence as a probability.
- One prompt for every role and calling it a jury.
- Concatenating untrusted data into the system prompt.
- Shipping a prompt change without a benchmark.
- Letting a prompt decide whether to block a merge.
