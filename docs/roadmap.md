# Roadmap

Accepted improvements beyond the phase-2 scope, recorded 2026-10-07 (D-017). Every slice lands
as a stacked PR (D-011) with its own decision entries and tests. Phase 3 (promo site) and
phase 4 (launch) follow the improvement slices that precede launch.

## Sequencing

| Slice | Items   | Scope                                                                                 | Status          |
| ----- | ------- | ------------------------------------------------------------------------------------- | --------------- |
| 6     | 1, 2, 4 | Run hygiene: superseded-run skip, review minimization, priority file order            | in review (#14) |
| 7     | 3, 6    | Resolution tracking + output contract (per-reviewer summary, `startLine`, usage)      | planned         |
| 8     | 5, 11   | Instance settings (tunable caps/budgets) + optional blocking mode (default off)       | planned         |
| 9     | 10      | Repo instructions (`AGENTS.md`/`CONTRIBUTING.md`) in prompts                          | planned         |
| 10    | 7, 12   | Credential key rotation + audit trail                                                 | planned         |
| 11    | 9, 13   | Distribution: guided deploy + reviewer import/export (with phase 3/4 launch polish)   | planned         |
| —     | 8       | Access re-checks — parked; needs a deliberate decision (user-token storage trade-off) | open            |

## Items

1. **Superseded-run skip** — a run whose PR already has a newer run finishes `skipped`
   (newest run wins; same-SHA duplicates also resolve to the newest). Cuts wasted provider
   spend on rapid pushes.
2. **Review minimization** — after posting, previous Jury Forge reviews for the PR are
   minimized best-effort (GraphQL `minimizeComment`, `OUTDATED`). Threads stay on the latest
   verdict.
3. **Resolution tracking** — the previous run's findings join the next prompt; the summary
   gains Resolved / Still present / New buckets.
4. **Priority file order** — under the D-010 budget, added/changed source files are sent
   before renames and docs, so truncation drops the least valuable diffs.
5. **Instance settings** — `instance_settings` table + dashboard Advanced section for the
   D-009/D-010 numbers (current values as defaults).
6. **Output contract v2** — optional per-reviewer `summary`, multi-line findings (`startLine`),
   provider token `usage` captured into run detail.
7. **Key rotation** — key-versioned ciphertexts + lazy re-encrypt on write (v2 format).
8. **Access re-checks** — decide between shorter session TTL and stored-token re-verification.
9. **Guided deploy** — `npm run deploy:guided` (D1 create → secrets → deploy → wizard URL);
   evaluate a "Deploy to Cloudflare" button.
10. **Repo instructions** — bounded `AGENTS.md`/`CONTRIBUTING.md` excerpts in prompts (opt-in).
11. **Optional blocking mode** — `REQUEST_CHANGES` above an error-findings threshold; off by
    default, so D-013 stays the default posture.
12. **Audit trail** — activity table + dashboard view (sign-ins, key changes, toggles, kicks).
13. **Reviewer import/export** — JSON export/import of reviewer configs.
