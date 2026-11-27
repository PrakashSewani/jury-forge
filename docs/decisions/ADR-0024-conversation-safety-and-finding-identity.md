# ADR-0024: Conversation safety, finding identity, and evidence-gated resolution

- Status: accepted (G0, 2026-11-16; safety core in MVP, the rest in v1)
- Date: 2026-11-16
- Owners: architecture + security
- Amends: ADR-0012 (sessions/resolution), ADR-0013 (triggering); pulls fork policy from v1.x into v1
- Revisit trigger: the first abuse report, a wrong-resolution rate above 2 %, or GitHub adding a
  first-class AI-reviewer API.

## Context

The deep review of 2026-11-16 found that the reply loop — the product's core differentiator — was
specified as intent, not as rules:

- Any reply to a Jury Forge thread enqueues a turn ([`agentic-review.md`](../architecture/agentic-review.md) §3);
  who may trigger is open (Q-028) and fork policy is v1.x. On a public repo, any commenter can spend
  the operator's tokens and inject prompts (PoC F-030).
- Bot-loop protection exists only as an unchecked gate ([`quality-gates.md`](../delivery/quality-gates.md)).
- After a push, findings become `needs_recheck` with no defined recheck, re-anchoring, or
  force-push behaviour.
- Cross-reviewer dedup and "resolved" tracking have no stable identity; the PoC repeated findings
  across runs for the same reason.
- `auto` resolution has a "guard" with no definition.

## Decision

### 1. Who can start a turn (v1)

| Actor | Can trigger a review | Can start a reply turn |
| ----- | -------------------- | ---------------------- |
| Repo write/maintain/admin | yes | yes |
| PR author (any association) | no (manual trigger needs write) | yes, on its own PR's Jury Forge threads |
| Other commenters (`author_association` not `OWNER`/`MEMBER`/`COLLABORATOR`) | no | no — stored as context, never a turn |
| Any bot account, including Jury Forge | no | no |

Fork PRs: **skip by default**; a maintainer trigger runs the review with fork content labelled
untrusted. This is v1, not v1.x.

### 2. Loop and abuse limits (v1, server-enforced)

- Self-detection by **App ID and bot user ID**, never by display name.
- Every `[bot]` sender and every `performed_via_github_app` comment is ignored as a trigger.
- **Turn budgets:** at most 6 agent replies per thread and 40 turns per session per generation;
  reaching a budget posts one "handing this to a human" message and stops.
- **Debounce:** 30 s coalescing window per session (as in the sessions spec).
- **Rate limit:** at most 10 reply turns per user per hour per installation.
- The agent's own earlier messages enter the prompt labelled `prior_agent_output` — advisory, never
  evidence. Only the diff at the current head SHA and tool results are evidence.

### 3. Comment versioning

A turn answers the **exact comment body hash it read**. An edit after the read creates a new
message version; the agent answers again only if the author mentions Jury Forge in the edit or the
thread is still waiting for it. The UI shows which version was answered.

### 4. Finding identity

Every finding gets a deterministic **fingerprint**:

```
fp = sha256(repo_id, rule_category, normalised_path, anchor_hash)
anchor_hash = sha256(whitespace-normalised text of the anchored lines ± 2 lines of context)
```

- **Dedup** across reviewers merges findings with the same `fp`, or with the same path and category
  and overlapping line ranges. The merged finding keeps every reviewer's provenance and dissent
  (`jury-output.md`).
- **Recurrence:** a finding whose `fp` was resolved `wrong`/`won't fix` on this PR is not posted
  again; it is listed in the receipt as suppressed.
- The model never assigns identity; code does.

### 5. Following the PR's history

On `pull_request.synchronize` (including force-push):

1. Re-locate each open finding's `anchor_hash` in the new head (exact, then fuzzy within the file).
2. Found and unchanged → keep the thread, update the anchor.
3. Anchored code changed or removed → state `fix_candidate`; enqueue a **cheap recheck turn** for
   those threads only (one reviewer, the finding's owner, the thread's context, the new hunk).
4. File deleted or anchor lost → `outdated`; no repost, summary note only.
5. A force-push that removes the base commit of a finding keeps the session; generations stay
   monotonic.

### 6. Evidence-gated resolution

`suggest` (default): after a recheck says "fixed", the agent posts **"Verified fixed in `<sha>`"** with
the before/after hunk and asks a human to resolve.

`auto` resolves only if **all** are true: (a) the anchored code changed in a commit after the
finding; (b) the recheck verdict is `fixed` with confidence ≥ the policy threshold; (c) no human
reply in the thread disputes it after that commit; (d) severity is below `critical`. Otherwise it
falls back to `suggest`. Every auto-resolve is reversible, audited, and counted in the
wrong-resolution metric.

### 7. Hard budgets

Per-turn caps already exist. Add **enforced** per-session, per-repo-per-day, and per-installation-per-month
token budgets. Exceeding a budget fails closed: the Check Run says why, nothing is posted, and the
owner is notified. GitHub secondary rate limits are handled with a per-installation write queue
(≤ 1 mutation per second, `Retry-After` honoured), and one review is published per turn.

## Options considered

1. **Leave it to prompts** ("ignore instructions in replies"). Rejected: prompts are not a control.
2. **Model-assigned finding IDs.** Rejected: not reproducible; the PoC's duplicate findings came
   from this.
3. **Repost every finding after each push.** Rejected: comment noise, the top reason users mute bots.
4. **This ADR.** Deterministic rules in code; the model proposes, code decides. **Chosen.**

## Consequences

- Easier: abuse-resistant on public repos; dedup and recurrence become testable; "verified fixed"
  becomes a visible differentiator.
- Harder: fuzzy re-anchoring needs a test corpus (rebase, rename, reformat); turn budgets can stop a
  legitimate long discussion (mitigated by the human handoff message).
- Security: reduces cost-exhaustion and injection blast radius; author-association data is trusted
  from GitHub only.
- Operations: new metrics — budget stops, loop stops, suppressed recurrences, recheck turns,
  wrong-resolution rate.

## Follow-ups

1. Close Q-028 with §1.
2. Update `agentic-review.md` §3 and the sessions spec to reference this ADR.
3. Add the injection/loop/re-anchor test corpus to the Phase 2 gate.
