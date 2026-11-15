# Quality spike harness (THROWAWAY)

**This is not part of the Jury Forge product.** It is analysis tooling for
[`docs/analysis/quality-spike-2026-11-15.md`](../../docs/analysis/quality-spike-2026-11-15.md)
(ADR-0023, Workstream A). It contains no product code, no secrets, and no results.

## Status

**Blocked — the experiment has not run.** The owner has not supplied an experiment provider, model,
prices, a dataset with human ground truth, or permission to send diffs to a provider. The fetch,
run, and scoring commands are not implemented yet. Only the offline plumbing exists and is tested.

## What is here

| Path | Purpose |
| ---- | ------- |
| `prompts/` | Pre-registered prompts for baseline, Security, Correctness, Tests, and the Chair, plus shared data-handling and schema blocks. Hashes are in the analysis doc. |
| `config.json` | Frozen parameters: temperature 0, 4096 output tokens, caps, match and duplicate thresholds, decision margin, budget. |
| `src/diff.mjs` | Unified-diff parser and the annotated view every condition sees (new-side line numbers). |
| `src/schema.mjs` | Strict parsing of model text and validation of findings and chair output. |
| `src/providers.mjs` | One model call for OpenAI-compatible and Anthropic-compatible APIs. Keys come only from environment variables. Plain HTTP to a non-local host is refused. |
| `src/util.mjs` | Hashing, redaction, path normalisation, and similarity helpers. |
| `test/unit.test.mjs` | Offline checks for the modules above (no network). |

## Pinned versions

- Node.js: `v24.19.0` (checked on the author's machine; `engines` requires `>=22`).
- Dependencies: none. Everything uses Node built-ins (`node:test`, `node:crypto`, `fetch`).

## Commands

```bash
cd spikes/quality
npm test          # offline unit checks; no network, no key
```

`npm run spike` is declared in the plan but not implemented. It will be added only after the owner
approves the dataset and provider.

## Secrets and data

- API keys are read from environment variables named in the run configuration. Never put a key in a
  file in this directory, in a commit, or in a chat.
- Redaction removes known key values from logged responses.
- Do not run against private repositories without written owner permission. The dataset must be
  public or synthetic.

## Before running for real

1. Owner approves the dataset, ground truth, provider, models, and prices (see the analysis doc §8).
2. The prompts and `config.json` are hashed and recorded. Any change after a result is seen is
   logged and the run is repeated.
3. Budget ≤ $25 and ≤ 2 hours; the run stops and reports if either is exceeded.
