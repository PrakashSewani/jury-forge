# Spec: Jury output, verdict, and dissent

- Status: draft for owner review
- Date: 2026-11-15
- Owner: product + AI pipeline
- Principles: 2 (trustworthy review), 6 (measure quality), 9 (one vocabulary), 13 (conversation)
- Related: ADR-0012 (sessions/resolution), ADR-0013 (routing), ADR-0016 (catalog/bindings),
  [`agentic-review-sessions.md`](agentic-review-sessions.md),
  [`reviewer-assignment-and-roles.md`](reviewer-assignment-and-roles.md)

## Problem

The product is called a **jury**, but the current specs define routing, parallel reviewers,
de-duplication, and an optional chair without defining what the user actually sees. If the output
is a merged comment with duplicates removed, Jury Forge is "several prompts, one review" — which is
what the PoC already did.

A jury is not a merge function. It is:

- **composition** — who sat on the jury and why;
- **individual findings** — what each reviewer claimed, with evidence;
- **dissent** — where reviewers disagreed, preserved rather than averaged away;
- **verdict** — the chair's call, with the rule that produced it;
- **accountability** — who said what, with which model, at which confidence.

Without this, the product cannot differentiate on trust, cannot measure reviewer quality, and cannot
explain a bad review.

## Users and jobs

- **PR author:** "Tell me what the jury found, which reviewer found it, and whether they disagreed."
- **Maintainer:** "Show me dissent and the chair's reasoning so I can make the call."
- **SME:** "Show me where my reviewer was right or wrong against the others."
- **Auditor:** "Reconstruct who claimed what, with which model and evidence."

## 1. Output model

A turn produces one **jury result** with four layers:

```
JuryResult
 ├── composition: selected reviewers, skipped reviewers, why
 ├── findings: one or more per reviewer, each with evidence and confidence
 ├── deliberation: agreements, duplicates merged, disagreements, chair decision
 └── verdict: the published review (summary + inline comments) and its policy
```

### Composition

- The reviewers that ran, the reviewers that were skipped, and the reason
  (scope, unavailable, budget, required, capability not requested).
- The mode (`pr-review` / `branch-review`), generation SHA, and context tier (T0/T2).
- The chair (a reviewer, a dedicated chair prompt, or `none`).
- This is already required for the router ("record why"); the jury output makes it visible.

### Findings with provenance

Every published finding keeps:

| Field | Meaning |
| ----- | ------- |
| `reviewer` | The catalog reviewer and version that raised it |
| `model` | Provider + model from the catalog at turn time |
| `evidence` | File/line/hunk at the generation SHA, or a knowledge citation |
| `confidence` | Reviewer confidence, normalized to a shared scale |
| `severity` | `critical` / `high` / `medium` / `low` ([ADR-0032](../../decisions/ADR-0032-finding-severity-scale.md)); the chair takes the highest among confirming jurors, capped by policy |
| `claim` | What the reviewer asserts, in one sentence |
| `status` | Raised, merged, disputed, dismissed, accepted |

- A finding is never published without provenance. Anonymous findings are a bug.
- Provenance is visible in the session detail; the PR comment may show a compact form
  (`Security · high`) and link to the full record.

### Deliberation and dissent

> **v1 mechanics ([ADR-0025](../../decisions/ADR-0025-v1-review-pipeline.md) §4):** findings pass
> code grounding, then a non-voting **verifier** (`confirmed` / `unconfirmed` / `wrong`), then a
> **code-only chair**. The chair merges findings by fingerprint (ADR-0024 §4). Severity is the
> highest among the confirming jurors, capped by policy. Agreement is the number of jurors that
> flagged the finding divided by the number that saw the file. Findings are ranked by
> `severity × confidence × agreement`, then the noise budget and suppressions are applied. A model
> writes only the summary and dissent text. The "chair decision" below is therefore a rule
> application, recorded in the receipt.

When two or more reviewers run, the chair produces a **deliberation record**:

- **Agreement:** the same issue found by more than one reviewer; merged, with the contributing
  reviewers listed.
- **Duplicate:** same file/line, same root cause; merged, not counted twice.
- **Disagreement:** reviewers reach different conclusions about the same code (for example, Security
  says "block", Testing says "fine"). The disagreement is **published as a disagreement**, not
  silently resolved into one verdict.
- **Minority finding:** a finding only one reviewer raised, with no contradicting finding. It is
  published as a normal finding with single-reviewer provenance; it is not suppressed because the
  majority did not see it.
- **Chair decision:** for each disagreement, the chair records a call (`block`, `warn`, `dismiss`,
  `needs human`) and the rule it used (severity policy, evidence weight, reviewer priority, or
  explicit "cannot decide — human needed").

Rules:

1. **No fake consensus.** The chair may not present a decision as unanimous when reviewers
   disagreed.
2. **Dissent is preserved.** A merged finding keeps the list of reviewers and any minority view.
3. **Confidence is not evidence.** A high-confidence finding with weak evidence is downgraded, not
   published as fact.
4. **The chair is explainable.** Every chair call names the rule or the evidence that decided it.
5. **Humans can override.** In v1 the owner or a maintainer can accept, dismiss, or reopen a
   finding; only the owner dismisses a `critical` one (ADR-0028). SME/admin rights arrive in v1.2
   (ADR-0012). The override is recorded and fed to the reviewer scorecard.

## 2. Verdict policies

The verdict is the published outcome, not the internal deliberation. Three policies:

| Policy | Verdict | When |
| ------ | ------- | ---- |
| **Advisory** (default) | A review comment with findings and a summary; never blocks | Default for all repos until policy says otherwise |
| **Check** | A Check Run conclusion (`neutral` / `failure`) with a details link | Repo policy chooses it |
| **Request changes** | A GitHub review requesting changes | Explicit repo policy only; never the default |

- The verdict never exceeds the configured policy. A finding cannot unilaterally block a merge.
- A `failure` conclusion must name the blocking findings and the policy that made them blocking.
- The verdict always includes the composition and the dissent summary, even when the findings are
  few.

## 3. Display surfaces

### GitHub (the primary surface)

- **One review per turn**, not one comment per reviewer.
- Inline comments carry the finding and a compact provenance (`Security · high · evidence`).
- The review body carries:
  - the jury composition ("Reviewed by Security, Testing; skipped Docs — no docs changed");
  - the verdict and the policy;
  - a dissent section if reviewers disagreed;
  - a coverage line ("reviewed 6 of 8 changed files; 2 skipped — generated");
  - a link to the session detail for provenance and the full deliberation.
- No reviewer names are hidden, and no machine codes are printed.

### Website (the deep view)

- **Jury panel:** composition, deliberation, dissent, chair rule, confidence, cost.
- **Finding detail:** the claim, evidence, reviewer/model, status, and override history.
- **Replay:** the turn's inputs, selected context, and each reviewer's output, for audit.
- The panel is the same data as the review, not a second source of truth.

### Review receipt (v1)

Every review publishes a **machine-readable receipt** — the answer to “what left the perimeter, to
whom, under what policy, with what evidence?” It is the security buyer's artifact, not a log.

| Field | Meaning |
| ----- | ------- |
| `reviewId`, `repo`, `pr`, `generationSha` | What was reviewed |
| `mode`, `tier` | `pr-review` / `branch-review`; T0/T2 |
| `reviewers[]` | Catalog reviewer + version that ran, and skipped reviewers with reasons |
| `provider`, `model`, `endpoint` | Where the request went |
| `tokens` | Input, output, cache read/write |
| `cost` | Estimated/actual when pricing is known; `unknown` otherwise |
| `redactions` | Count and categories (never the secret values) |
| `withheld` | Files/sources withheld by policy or `never_quote` |
| `context` | Sources, versions/hashes, and what was dropped for budget |
| `coverage` | Coverage manifest: reviewed / expanded (T0+) / summarised / skipped / excluded files, each with a reason |
| `verifier` | Counts of confirmed / unconfirmed / wrong, and the model used |
| `chairRules` | The deterministic rules applied and their parameters |
| `suppressed` | Findings suppressed by repo memory or recurrence (fingerprint + rule id) |
| `instructions` | Instruction files used: path, base SHA, token count |
| `preset`, `estimate` | Preset used and the pre-run cost estimate vs actual |
| `signature`, `prevHash` | Ed25519 signature and the previous receipt hash (chain; S5) |
| `policy` | Verdict policy and the rules applied |
| `verdict`, `resolver` | The published verdict and who resolved it |
| `createdAt` | Timestamp and policy version |

- Linked from the PR review body and downloadable from the session UI (JSON).
- No raw prompt, no full code, no secret values; the finding list is optional and operator-controlled.
- Immutable for the generation; exported with the audit stream; retained per policy.
- A receipt is produced for every turn that publishes; a failed turn records why no receipt exists.

## 4. Single-reviewer mode

A repo with one bound reviewer still produces a jury result with a composition of one. The
deliberation section is empty; the verdict is that reviewer's findings. This keeps one output
contract and avoids a second code path.

## 5. No silent degradation

- The chair is code (ADR-0025 §4). If it fails, that is an internal error: the turn fails visibly
  and nothing is published as a clean review. It never invents a verdict.
- If a reviewer fails, the review publishes the rest and names the missing reviewer and why.
- If the deliberation cannot be computed (for example, missing provenance), the review is held and
  fails visibly; it is not published as a clean review.
- **If the verifier fails (v1)** — it errors after the gateway's retries, or it stops at the token
  cap (`finish=length`, no repair; ADR-0029) — **no finding is published**. The turn fails with
  reason `verifier_unavailable` and is retryable; the Check Run follows the provider-failure row of
  [`review-progress-and-completion.md`](review-progress-and-completion.md) §5 (`neutral` with the
  remedy under the default gate, `failure` under a blocking gate); and one failure message gives
  the remedy. The jurors' step results are stored, so a retry re-runs only `verify`. No receipt is
  signed, because no review was published. Decided by the owner on 2026-11-28 (architecture audit
  Q-F): an unverified finding is never published as reviewed.
- If reviewers disagree and the chair cannot decide, the verdict is `needs human` with the
  disagreement shown.

## 6. Acceptance criteria

- [ ] A multi-reviewer turn publishes one review with composition, findings, and a dissent section
      when reviewers disagreed.
- [ ] Every published finding names its reviewer, model, evidence, and confidence.
- [ ] Duplicate findings are merged; contributing reviewers are still listed.
- [ ] A minority finding is published, not suppressed.
- [ ] A chair decision names the rule or evidence used; a `needs human` outcome is possible.
- [ ] The verdict respects the repo policy (advisory default; check/request-changes opt-in).
- [ ] A failed reviewer or chair degrades visibly; no clean verdict is fabricated.
- [ ] (v1) When the verifier fails or hits the token cap, no finding is published, the turn fails
      with `verifier_unavailable`, and a retry re-runs only `verify` (Q-F).
- [ ] The session detail can replay the deliberation and the finding provenance.
- [ ] A human override is recorded and visible in the finding history.
- [ ] The PR review body and the UI jury panel show the same composition and verdict.
- [ ] A review receipt is produced and linked; it records provider, model, tokens, redactions,
      withheld sources, context, policy, verdict, and resolver, with no secret values or raw prompt.

## 7. Metrics

- **Dissent rate:** turns with at least one reviewer disagreement / multi-reviewer turns.
- **Chair agreement:** chair calls a human does not override / chair calls.
- **Minority survival:** minority findings published / minority findings raised.
- **Provenance completeness:** published findings with reviewer + model + evidence / all findings.
- **Verdict override rate:** human overrides / verdicts.
- **Composition accuracy:** router selections a human changes / all selections.

## 8. Security and privacy

- Reviewer names, model names, and evidence are operator data; they stay in the operator's instance.
- The PR comment must not expose internal prompts, pack hashes, `never_quote` content, or provider
  keys.
- A dissent section is untrusted model output; it is validated and grounded like any finding.
- The chair is not a privileged actor: it cannot resolve threads, change policy, or bypass the
  resolution guard.

## 9. Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| JO-01 | Is the chair a dedicated reviewer, a role, or a policy algorithm? | A dedicated chair prompt over structured findings; no free-form debate. |
| JO-02 | Does the PR comment show all reviewer provenance, or only a compact badge? | Compact badge + link to the session; full provenance in the UI. |
| JO-03 | How is dissent displayed when it is noisy (many small disagreements)? | Collapse to a "disagreements (3)" section with one line each. |
| JO-04 | Is `request changes` ever allowed to be the default? | No; explicit repo policy only. |
| JO-05 | Does a single-reviewer turn show a composition section? | Yes, one line; keeps the contract stable. |
