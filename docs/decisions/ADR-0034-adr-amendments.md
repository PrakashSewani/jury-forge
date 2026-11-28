# ADR-0034: How an accepted ADR changes — frozen body, a new ADR, a pointer

- Status: accepted (owner delegated the decision, 2026-11-28; readiness review)
- Date: 2026-11-28
- Owners: architecture + docs
- Amends: `AGENTS.md` (rule 3 and "stop on contradiction"), [`README.md`](README.md) (process,
  statuses, index), and the ADR template in
  [`../delivery/ways-of-working.md`](../delivery/ways-of-working.md#4-the-adr-template)
- Supersedes: —
- Revisit trigger: a reviewer cannot tell from an ADR's status line and the index which decision is
  binding, or the amendment chain on one ADR grows past three.

## Context

`AGENTS.md` and the decision log say that ADRs are append-only: an accepted decision is superseded
by a new one and never rewritten. The practice has differed:

- Some accepted ADR **bodies** were edited in place. For example, the 2026-11-16 T0+ pass reworded
  ADR-0007, ADR-0014 (including its title), ADR-0016, ADR-0018, and ADR-0019.
- Many status lines record a later change ("amended by ADR-0029", "accepted as amended"), and the
  status list has no word for that.
- Newer ADRs (ADR-0024, ADR-0025, ADR-0027–ADR-0030, ADR-0033) already use an `Amends:` field to name
  the part of an older ADR they change.

Jury Forge sells an **auditable** review layer (ADR-0023). Its own decision record should meet the
same bar: a reader must be able to see what was decided, when, and what changed it, without
reconstructing it from git history. A reader must also not be misled by text that a later decision
replaced.

## Options

1. **Supersede every changed ADR with a full replacement.** Strictly append-only, but a one-clause
   change (ADR-0033 changing one phrase in ADR-0025 §4) would mean copying the whole ADR. That is a lot
   of churn, and the reason for the change gets lost in a large copy.
2. **Allow edits in place, with "accepted as amended".** Cheap, and the body always reads current,
   but the original reasoning is lost and nothing shows who changed what. This is what the
   2026-11-16 pass did.
3. **Frozen body; a new ADR amends or supersedes; the old ADR gets a pointer.** Partial changes are
   small new ADRs with an `Amends:` field. The only edit to an accepted ADR is its status line, which
   names the amending ADR. **Chosen.**

## Decision

Option 3.

1. **An accepted ADR's body is frozen:** title, context, options, decision, consequences, and
   evidence. The only edits allowed are mechanical ones that do not change meaning: a broken link, a
   typo, or a renamed path.
2. **A change to what an ADR decides is a new ADR.**
   - If it changes part of the decision, it lists the ADR and section in `Amends:`.
   - If it replaces the whole decision, it lists the ADR in `Supersedes:`.
   - The new ADR goes through the normal process (proposed → the owner's decision → accepted).
3. **The older ADR gets a pointer.** When the new ADR is accepted, the older ADR's status line gains
   a dated pointer of one clause (`accepted (…; <what> amended by ADR-YYYY)`), or the status
   becomes `superseded by ADR-YYYY`. The pointer is a summary. Where the two texts differ, the
   amending ADR wins.
4. **Owner answers to open questions** can be noted on an ADR's status line only when they fill in
   something the ADR left open (for example, Q-049 on ADR-0028). A change to the decision itself
   needs a new ADR.
5. **The index shows the chain.** [`README.md`](README.md) gains an **Amended by** column. The
   status words stay `proposed`, `accepted`, `rejected`, `superseded`, and `deprecated`. "Accepted as
   amended" is retired as a status: an amended ADR is `accepted`, and the column names what amends
   it.
6. **Past edits stay.** The body edits made before this ADR are not reverted. Reverting would bring
   back wording that later decisions replaced, and git history keeps the earlier text. From
   2026-11-28 the rule applies to every accepted ADR.

## Consequences

- Each change to a decision is a small, dated, reviewable ADR. The history reads forward: ADR-0025,
  then ADR-0033.
- A reader of an old ADR sees on its first lines that it was amended, and by what.
- The index needs care: an accepted amending ADR must update the **Amended by** column and the older
  ADR's status line in the same pull request.
- Bodies such as ADR-0003, ADR-0004, ADR-0006, and ADR-0022 still describe options that later
  decisions replaced. That is expected under this rule. The status lines and the index point to the
  binding text.

## Security and operations impact

None at runtime. A frozen, forward-only decision record is part of the project's own audit trail:
a security reviewer can see when a control (for example, row-level security in ADR-0004) was
narrowed, and by which decision.

## Evidence

- `AGENTS.md` rule 3 and "stop on contradiction"; [`README.md`](README.md) ("never rewritten").
- `git diff` of ADR-0014 since it was added: its title and context were reworded after acceptance.
- Status lines of ADR-0010, ADR-0011, ADR-0012, ADR-0022, ADR-0025, and ADR-0032; the `Amends:` fields
  of ADR-0024, ADR-0025, and ADR-0027–ADR-0033.
- The gap was first noted in `delivery/status.md` on 2026-11-27 and raised again by the readiness
  review on 2026-11-28.
