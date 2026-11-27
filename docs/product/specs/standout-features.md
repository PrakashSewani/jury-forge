# Spec: Standout features — what makes Jury Forge more than "another AI reviewer"

- Status: draft for owner review
- Date: 2026-11-16
- Related: ADR-0023 (trust loop), ADR-0024 (conversation safety), [`jury-output.md`](jury-output.md),
  [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Problem

Hosted reviewers (Copilot review, CodeRabbit, Greptile, Qodo/PR-Agent) already comment on diffs and
reply to threads. "Self-hosted" alone is a deployment choice, not a reason to pick a product. Jury
Forge needs features that only make sense because it is **a jury** that **keeps a record** and
**runs inside the operator's perimeter**.

## The six standout features (S1–S6)

S7–S13 below are table stakes from the competitive scan, not standout features.

Each one builds on the trust loop; none adds a platform surface.

### S1. Appeal — the author can challenge a finding and the jury re-deliberates (v1)

The jury metaphor, made real. When the PR author disagrees ("this is intentional because…"), they
reply in the thread. The reply is classified as `dispute`, `question`, `fixed`, `wont_fix`, or `other`.

- `dispute` → an **appeal turn**: the finding's reviewer plus one other jury member re-examine the
  finding with the author's argument and the current hunk.
- Outcome is `upheld`, `downgraded`, or `withdrawn`, posted with reasons and any dissent.
- `withdrawn` findings feed the repo's suppression memory (S4).
- One appeal per finding; a second dispute goes to a human (ADR-0024 turn budgets).

**Acceptance:** an appeal produces exactly one reply with an outcome label; the receipt records the
appeal and votes; a withdrawn finding is not reposted on later pushes.

### S2. Verified fixed — the bot proves the fix instead of re-reviewing (v1)

On push, only threads whose anchored code changed get a cheap recheck (ADR-0024 §5). The bot replies
"Verified fixed in `abc123`" with the before/after hunk, or "Still present" with the remaining line.
Humans resolve with one click (`suggest`) or the guard does it (`auto`).

**Acceptance:** a fix push produces at most one reply per affected thread; untouched threads get no
new comments.

### S3. Noise budget — fewer, better comments (v1)

Each review has a **comment budget** (default 7 inline comments). Findings are ranked by
`severity × confidence × jury agreement`; the rest go into one collapsed summary section. Findings
that cannot quote a line from the diff are **withheld** and listed in the receipt — never posted.

**Acceptance:** no review exceeds the budget; every inline finding quotes diff text that exists at
the reviewed SHA.

### S4. Repo memory — learns from feedback without training (v1)

`wrong`, `won't fix`, and withdrawn appeals become **per-repo suppression rules** (fingerprint +
category + path glob), stored in Postgres, visible and editable in the UI, with a 90-day expiry by
default. Accepted findings become positive examples in the reviewer's prompt (capped, trust-labelled).
No data leaves the instance; no model is fine-tuned.

**Acceptance:** a finding marked `wrong` is not reposted on the same pattern in the same repo until the
rule expires or is deleted; every suppression is shown in the receipt.

### S5. Signed review receipt — an auditor can verify it offline (v1)

The receipt (ADR-0023) is serialised as canonical JSON, hash-chained to the previous receipt for the
installation, and signed with an instance Ed25519 key. `jury-forge receipt verify <file>` checks the
signature and the chain without network access. A receipt link is attached to the Check Run.

**Acceptance:** tampering with any field or deleting a receipt in the chain fails verification.

### S6. Egress preview (v1) and replay (internal tool in Phase 3; operator UI v1.1)

- **Egress preview:** before the first review on a repo, the owner can see exactly what would be sent
  (redacted diff, instruction files, prompt) without calling a provider.
- **Replay:** re-run a stored review's exact context against another model or reviewer version,
  without posting. The internal tool (WP 3-03) runs the Phase 3 benchmark; the operator-facing
  replay UI and public scorecard ship in v1.1 (Q-045). Results are compared with the original and with human feedback. This is how
  quality is measured after v1, on the operator's real PRs, instead of a pre-v1 spike.

**Acceptance:** replay never posts to GitHub and never uses a model outside the catalog; the
comparison shows precision on feedback-labelled findings.

## Table stakes from the competitive scan

From [`../../analysis/competitive-landscape-2026-11-16.md`](../../analysis/competitive-landscape-2026-11-16.md).
Without these, the standout features will not get a fair trial.

### S7. Jury presets with a cost estimate up front (v1)

`Quick` (1 reviewer, small model), `Standard` (the 3-reviewer jury), and `Deep` (3 reviewers on
high-reasoning models + a chair). Chosen per trigger (label `jury:quick|standard|deep`, Check Run
action, or UI). Before the run, the Check Run shows the estimated tokens and cost from the catalog
prices. The estimate is stored in the receipt next to the actual figures.

Prices come from the registry or an admin override when the provider's `/models` has none (CommandCode
has none); without a price the estimate shows tokens and "cost unknown". Output estimates include
the reasoning-token share recorded by the model's capability probe (ADR-0029); on the spike model it
was about half of all output on `/chat/completions`.

**Acceptance:** every run records the preset, the estimate, and the actual cost; `Deep` needs write
access and respects the budgets in ADR-0024.

### S8. Fix handoff to the developer's own agent (v1)

Each finding has a **Copy fix prompt** link. It contains the file, line range, evidence, and the
reviewer's suggestion as a ready-to-paste prompt for any coding agent (Claude Code, Copilot, Cursor,
Codex, local). Jury Forge never edits code itself and never calls another vendor.

**Acceptance:** the prompt quotes only the finding and the diff, includes the reviewed SHA, and is
also available for all open findings at once.

### S9. PR risk score (v1)

The Check Run summary shows a risk score: `low`, `medium`, `high`, or `critical`. It is computed by
**code, not the model**, from the paths touched (auth, crypto, migrations, CI, infra), diff size, the
highest finding severity, and how far the reviewers disagree. The session inbox sorts by risk.

**Acceptance:** the score is deterministic for the same inputs and lists the factors that produced it.

### S10. Feedback through native GitHub reactions (v1)

👍 / 👎 on a Jury Forge comment counts as `valid` / `wrong` feedback, alongside the UI buttons. It is
stored locally and feeds repo memory (S4). Reactions are polled, because GitHub sends no webhook for
them. They are read only from users with write access.

**Acceptance:** a 👎 from a write-access user creates a suppression candidate, shown in the UI.

### S11. Broad instruction-file compatibility, read from the base SHA (MVP; ADR-0027)

Jury Forge reads `AGENTS.md`, `CONTRIBUTING.md`, `REVIEW.md`, `CLAUDE.md`,
`.github/copilot-instructions.md`, and path-specific `.github/instructions/**/*.instructions.md`
**from the base SHA**, within caps and labelled as trusted instructions. A PR that changes these
files gets a visible note: "review rules changed in this PR; they take effect after merge."
Teams that already use Copilot then get relevant reviews with no extra setup. A PR also cannot
rewrite the rules it is reviewed by, which Copilot allows because it reads from the head branch.

**Acceptance:** the receipt lists every instruction file used, with its path, SHA, and token count;
edits in the head branch never affect the current review.

### S12. Jury charges — natural-language pass/fail checks (v1, Q-039)

A repo defines up to 10 charges in `.jury-forge.yml` (read from the base SHA). Examples: "every
migration has a down step", "the PR links an issue". Each charge appears as a pass, fail, or n/a line
in the Check Run, with the juror's evidence. Failing charges can gate merges through the Check Run
policy (deep dive §6.6). The verdict comes from the jury and the verifier; a single model call never
decides it alone.

### S13. Analyzer evidence (v1 ingest, v1.x run; Q-041)

v1: read SARIF results already produced by the PR's CI check runs and give them to the jurors as
evidence. v1.x (needs an ADR): run pinned analyzers on the changed files in a no-network, read-only
container. Analyzer output is never posted on its own; a juror must adopt it and the verifier must
confirm it.

## Non-goals

- Auto-fix, auto-merge, or code generation.
- Training or fine-tuning on customer code.
- A public leaderboard that requires sending data out of the instance.

## Metrics

- Accepted-finding rate (feedback `valid`/`fixed` ÷ posted) — target ≥ 60 %.
- Comments per review (median ≤ 5).
- Appeals upheld vs withdrawn, per reviewer.
- Repeat-finding rate after `wrong` feedback — target 0.
- Wrong-resolution rate in `auto` — target ≤ 2 %.

## Security and privacy

- Author replies in appeals are untrusted input (ADR-0024 §2); the appeal may lower or withdraw a
  finding but cannot trigger tools outside the reviewer's grant or resolve a `critical` finding.
- Suppression rules are scoped per repo and audited; an owner can review and purge them.
- The receipt signing key is generated at install, stored encrypted, and included in backups;
  rotation starts a new chain segment.

## Open questions

- SF-01: Default comment budget (7?) and whether it is per policy.
- SF-02: Should an upheld appeal escalate to a human reviewer automatically on `critical` severity?
- SF-03: Suppression expiry default (90 days?) and whether owners can make rules permanent.
- ~~SF-04: Is replay v1 (for the launch scorecard) or v1.x?~~ Closed by Q-045: egress preview is v1;
  replay is an internal Phase 3 tool and an operator UI in v1.1.
