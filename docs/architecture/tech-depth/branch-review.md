# Tech depth: branch review

- Status: deferred design note
- Date: 2026-11-15
- Owner: AI pipeline + architecture
- Related: ADR-0014, [`../product/specs/repo-knowledge-graph.md`](../../product/specs/repo-knowledge-graph.md)
- Decision: **not v1**; refine before implementation

## Definition

`jury:branch-review` compares the PR branch to the **repository’s default branch** and reviews the
complete branch delta — not just the latest PR diff. It is a PR-based review, not a whole-repo audit.

```
default branch (compare SHA)
        │
        ├── merge-base
        │
        └── branch head (review SHA)
```

- `compare_sha` = repository default branch head at review time (or policy override).
- `head_sha` = PR branch head.
- `merge_base` = merge-base of default and branch.
- Review target = files/symbols changed between `merge_base` and `head_sha`.
- Untouched files are context, not targets.
- If the PR base is not the default branch, branch review still compares to default unless repo
  policy overrides.

## What “complete” means

- All changed files vs default, including files changed in earlier commits, not just the latest push.
- Added/modified/deleted/renamed files.
- Deleted symbols and callers of deleted code (impact).
- Contracts: exported APIs, types, configs, migrations, feature flags.
- Tests: changed, missing, skipped, flaky.
- Cross-file/dependency impact via the graph.
- Functional/behavioral impact is **analyzed**, not executed by default. A later capability may
  use sandbox `tests.run`/`build.run` if the repo opts in.

## Graph needs

- Index the **default branch** and the **branch head** (or merge-base + head).
- Symbol-level diff: added/removed/changed symbols, signatures, exports.
- Caller/dependent delta: who uses changed/deleted symbols.
- Test map: changed tests, untested changed symbols.
- Config/ownership/conventions delta.
- Content-hash summaries reused across both snapshots.
- Store `compare_sha` and `head_sha` on the run; date the graph versions.

## Pipeline

1. Resolve default branch and compare SHA.
2. Fetch branch diff vs default (not PR base), plus PR metadata.
3. Update both graph snapshots incrementally.
4. Build a coverage plan: changed files, symbols, callers, tests, configs, docs.
5. Run reviewers with branch context; capability agents can query the graph.
6. Ground findings against the branch head; include impact evidence.
7. Chair/merge; publish.
8. Record `review_mode=branch`, `compare_sha`, graph versions, context manifest.

## Cost and limits

- Estimate files/symbols/tokens/cost/time before starting; cancel.
- Cap files/symbols/tokens; degrade visibly.
- Branch review is lower priority than human replies and PR reviews.
- Cache both graph snapshots; reuse unchanged summaries.
- A huge branch may be truncated; say what was omitted.

## Edge cases

| Case | Behavior |
| ---- | -------- |
| Default branch moved after PR opened | Use current default at trigger; record SHA; note if merge-base changed. |
| PR base is a release branch | Branch review still uses default unless policy overrides. |
| Force-push / rewritten history | Recompute diff; invalidate old findings; new generation. |
| Deleted/renamed files | Impact analysis on callers; findings can reference deleted paths in summary. |
| Generated/lock/binary files | Skip per context rules; note. |
| Monorepo | Scope to changed packages + dependents; cap. |
| Fork PR | Policy-controlled; no secrets; sandbox off by default. |
| Default branch unavailable | Fall back to PR base with a visible note, or fail; policy. |

## Open questions

| ID | Question | Default |
| -- | -------- | ------- |
| Q-059 | Do we index both default and head, or merge-base + head? | Both for impact; merge-base for diff. |
| Q-060 | Do we review deleted code impact? | Yes in summary; no inline on deleted lines. |
| Q-061 | Do we run tests/builds by default? | No; opt-in sandbox capability. |
| Q-062 | How large a branch is allowed? | Configurable cap; estimate + cancel. |
| Q-063 | Do we compare functional behavior statically or with tests? | Static by default; sandbox tests opt-in. |
| Q-064 | How do we show branch-review findings on a PR? | Inline where lines exist in the PR; impact items in summary. |

## Why deferred

Branch review needs the graph, symbol diff, impact analysis, and a cost model. Shipping it before the
PR-review session loop is proven would delay the wedge. It is the first v1.1 quality feature.
