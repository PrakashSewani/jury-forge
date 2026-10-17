# Roadmap

Accepted improvements beyond the phase-2 scope, recorded 2026-10-07 (D-017). Every slice lands
as a stacked PR (D-011) with its own decision entries and tests. Phase 3 (promo site) and
phase 4 (launch) follow the improvement slices that precede launch.

Slices 2b–6 and this slate landed on `dev` on 2026-10-17 (#9 → #14, `c47f87f2` … `5c8f71ce`); slice
6 is merged, and the rest of the slate followed in #16 (`f277f1e4`).

Slices 7–11 and item 8 landed **together in one pull request** against `dev` at the owner's
instruction (D-019, 2026-10-17; #16 merged as `f277f1e4`) — a deliberate departure from D-011's
one-slice-per-PR flow. Each slice still landed as its own docs commit and implementation commit with
`npm run check` green, so the slices stayed separately reviewable.

## Sequencing

| Slice | Items   | Scope                                                                               | Status |
| ----- | ------- | ----------------------------------------------------------------------------------- | ------ |
| 6     | 1, 2, 4 | Run hygiene: superseded-run skip, review minimization, priority file order          | merged |
| 7     | 3, 6    | Resolution tracking + output contract (per-reviewer summary, `startLine`, usage)    | merged |
| 8     | 5, 11   | Instance settings (tunable caps/budgets) + optional blocking mode (default off)     | merged |
| 9     | 10      | Repo instructions (`AGENTS.md`/`CONTRIBUTING.md`) in prompts                        | merged |
| 10    | 7, 12   | Credential key rotation + audit trail                                               | merged |
| 11    | 9, 13   | Distribution: guided deploy + reviewer import/export (with phase 3/4 launch polish) | merged |
| —     | 8       | Access re-checks — shorter session TTL, no stored user tokens (D-024)               | merged |

## Items

1. **Superseded-run skip** — a run whose PR already has a newer run finishes `skipped`
   (newest run wins; same-SHA duplicates also resolve to the newest). Cuts wasted provider
   spend on rapid pushes.
2. **Review minimization** — after posting, previous Jury Forge reviews for the PR are
   minimized best-effort (GraphQL `minimizeComment`, `OUTDATED`). Threads stay on the latest
   verdict.
3. **Resolution tracking** — the previous run's findings join the next prompt; the summary
   gains Resolved / Still present / New buckets (D-020, slice 7).
4. **Priority file order** — under the D-010 budget, added/changed source files are sent
   before renames and docs, so truncation drops the least valuable diffs.
5. **Instance settings** — `instance_settings` table + dashboard Advanced section for the
   D-009/D-010 numbers (current values as defaults) (D-021, slice 8).
6. **Output contract v2** — optional per-reviewer `summary`, multi-line findings
   (`startLine`), provider token `usage` captured into run detail (D-020, slice 7).
7. **Key rotation** — key-versioned ciphertexts + lazy re-encrypt on write (v2 format)
   (D-023, slice 10).
8. **Access re-checks** — shorter session TTL, no stored user tokens (D-024, lands with the
   slate).
9. **Guided deploy** — `npm run deploy:guided` (D1 create → secrets → deploy → wizard URL);
   evaluate a "Deploy to Cloudflare" button (D-025, slice 11 — the button is evaluated and not
   adopted for now).
10. **Repo instructions** — bounded `AGENTS.md`/`CONTRIBUTING.md` excerpts in prompts (opt-in)
    (D-022, slice 9).
11. **Optional blocking mode** — `REQUEST_CHANGES` above an error-findings threshold; off by
    default, so D-013 stays the default posture (D-021, slice 8).
12. **Audit trail** — activity table + dashboard view (sign-ins, key changes, toggles, kicks)
    (D-023, slice 10).
13. **Reviewer import/export** — JSON export/import of reviewer configs (D-025, slice 11).

## Post-phase-2 rework (2026-10-17)

The owner's rework item lands as four stacked pull requests against `dev` (D-011's flow), after the
improvement slate; slice A merged as **#17** (`77541fbb`), slice B merged as **#18** (`c48e825e1b`),
slice C merged as **#19** (`b93d2f04b1`), and D is in progress:

| Slice | Scope                                                                                   | Status                               |
| ----- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| A     | Design system: token layer + `product/src/ui/` primitives + the UI test harness (D-026) | merged to `dev` (`77541fbb`) (#17)   |
| B     | The shell, dark mode, the retuned tokens and all 8 screens on the primitives (D-027)    | merged to `dev` (`c48e825e1b`) (#18) |
| C     | Product shape: readiness, templates, reviewer↔repo visibility, try-a-reviewer (D-028)   | merged to `dev` (`b93d2f04b1`) (#19) |
| D     | Architecture: validated contracts, error taxonomy, client routing, run polling (D-029)  | in progress                          |

Slice C (D-028) covers computed readiness, the seven built-in reviewer templates, reviewer↔repo
visibility, and manual try runs. Slice B (the shell, wired dark mode, the retuned token ladder and
all eight screens rebuilt on the primitives) merged to `dev` from
`feat/rework-b-shell-screens-20261017`, and post-merge canary verification passed on the merged
tree. Slice D (D-029) makes the Worker↔dashboard boundary real — zod schemas as the contract source,
one error taxonomy, validated responses on both sides, real client-side routing and a polling data
layer — and stacks on C's merge (`b93d2f04b1`). The rework is product work, not a phase — phase
3 (promo site) still starts after it. **Nothing deploys: the hold stands.**
