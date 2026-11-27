# Spike: CommandCode model discovery (ADR-0011) and structured output (S-C, WP 1-07)

- Date: 2026-11-27
- Status: done (time-boxed, throwaway code, not part of the product)
- Provider: CommandCode, base URL `https://api.commandcode.ai/provider/v1`
- Model: `deepseek/deepseek-v4.1-flash` (chosen by the owner)
- Libraries: `ai` 7.0.173 (the pinned version in `technical-approach.md` §3.4),
  `@ai-sdk/openai-compatible` 3.0.96, `@ai-sdk/anthropic` 4.0.110, `zod` 4.6.7
- Runtime: Node v24.19.0, Windows 11
- Code: throwaway scripts in the session scratch folder, outside the repository. The key was read
  from a user environment variable and never printed, logged, or written to a file.

## Questions

1. **ADR-0011 follow-up:** the exact `/models` path, auth, response shape, and model metadata for
   CommandCode.
2. **S-C:** how reliably does the `ai` SDK get schema-valid structured output from this provider,
   which output mode works best, and how often is a repair needed? The result should freeze the
   gateway's structured-output strategy.

## 1. Model discovery

| Probe | Result |
| ----- | ------ |
| `GET /models`, no auth header | **HTTP 200**, full list |
| `GET /models`, `Bearer not-a-real-key` | **HTTP 200**, full list |
| `GET /models`, real key | HTTP 200, 105 models |
| `POST /chat/completions`, no auth | HTTP 401 `{"success":false,"error":{"code":"UNAUTHORIZED",...}}` |
| `POST /chat/completions`, bad key | HTTP 401 `{"error":{"type":"authentication_error","code":"UNAUTHORIZED",...}}` |
| `POST /chat/completions`, real key | HTTP 200 |

Response shape: `{"object":"list","data":[...]}`. Every model has exactly these fields: `id`, `object`,
`name`, `created`, `owned_by`, `context_length`, `supported_endpoints`.

- **No pricing and no capability flags** (structured output, tools, vision, reasoning) in `/models`.
- `created` is the same value for all 105 models and `owned_by` is always `command-code`; neither
  is useful metadata.
- `supported_endpoints` is reliable routing data: `/chat/completions` 93 models, `/responses` 79,
  `/messages` 16. The chosen model supports all three.
- `context_length` ranges from 200 000 to 1 050 000.
- IDs mix forms: 79 have a vendor prefix (`deepseek/...`), 26 do not (`claude-sonnet-5-5`).

**Consequences:**

- **`/models` cannot validate a key on this provider.** The flow in
  [`../../product/specs/provider-model-discovery.md`](../../product/specs/provider-model-discovery.md)
  §1 treated a 401 from the model endpoint as "bad key". Here it would store an invalid key and
  fail the spec's own acceptance criterion. Validation needs an authenticated probe: a one-token
  completion on a catalog model (spec updated with this spike).
- The two 401 bodies have different shapes, so the adapter must classify errors by HTTP status, not
  by body.
- Prices come from the registry or an admin override (spec §4 options 3–4); `/models` will not
  supply them. Capabilities must also come from the registry or from a probe (see §2).

## 2. Structured output (S-C)

### Method

Six synthetic diffs: a removed tenant check (TypeScript), SQL injection (Python), a retry
off-by-one (Go), a deleted test (TypeScript), a prompt-injection comment with `eval` (TypeScript),
and a README-only change with nothing to find. Each was run **3 times** in each mode.

- Schema: `{ findings: Finding[] (max 10), summary: string }`, built with `z.strictObject`, so unknown
  fields are rejected. `Finding` has file, line range, a severity enum, a category enum, title,
  evidence quote, explanation, confidence 0–1, and a nullable suggestion.
- The SDK call is `generateText` with `output: Output.object(...)`; `generateObject` is deprecated
  in `ai` 7. `maxOutputTokens` 8000, timeout 180 s, one SDK retry.
- Repair: one extra model call that shows the model its output and the validation error,
  following the design in `technical-approach.md` §3.4.
- Grounding check (code): the finding's file is in the diff and its evidence quote matches a
  changed line.

Modes, with the request shape confirmed by inspecting the outgoing request body:

| Mode | Endpoint | What is sent |
| ---- | -------- | ------------ |
| `oa-json-schema` | `/chat/completions` | `response_format: json_schema`, `strict: true`; schema not in the prompt |
| `oa-json-prompt` | `/chat/completions` | `response_format: json_object` + the JSON Schema in the system prompt |
| `an-json-tool` | `/messages` | a forced `json` tool (`tool_choice: any`) whose input is the schema |
| `an-output-format` | `/messages` | `output_format: json_schema`; schema not in the prompt |
| `oa-control-no-schema` | `/chat/completions` | `json_object` with **no** schema anywhere (control) |

### Results

| Mode | Trials | Valid first try | Repaired | Failed | Grounded findings | p50 | p90 | Avg out tokens (reasoning) |
| ---- | -----: | --------------: | -------: | -----: | ----------------: | --: | --: | -------------------------: |
| `an-json-tool` | 18 | **18 (100 %)** | 0 | 0 | 30/30 | 8.5 s | 11.7 s | 813 (0 reported) |
| `oa-json-schema` | 18 | 16 (89 %) | 0 | **2** | 24/24 | 11.4 s | 85.6 s | 787 (390) |
| `oa-json-prompt` (two runs) | 36 | 28 (78 %) | 7 | 1 | 47/47 | 8–12 s | 18–27 s | 680–920 (380–630) |
| `an-output-format` | 18 | 0 | 0 | **18** | — | — | — | — |
| `oa-control-no-schema` | 18 | 0 | 3 | 15 | — | 4.1 s | 4.3 s | 50 |

The control fails every first try. So the `oa-json-schema` successes mean the `json_schema` request
reached the model; the model did not just guess the shape.

### Findings

1. **`an-json-tool` (the Anthropic Messages format with a forced tool) was the most reliable and the
   fastest:** 18/18 valid on the first try, the lowest p90, and every finding grounded.
2. **`oa-json-schema` has a runaway failure on empty results.** On the README-only diff, 2 of 3 runs
   wrote `{"findings": []` and then only whitespace until the 8000-token cap (`finish=length`,
   95–105 s each). The repair call looped the same way. This is the costliest failure seen:
   about 16 000 wasted output tokens per trial.
3. **CommandCode appears to ignore `output_format` on `/messages` for this model.** The model
   answered in markdown or with its own field names (`line`, `description`) as if no schema had
   been sent. Repair cannot fix this, because the schema never reaches the model.
4. **Prompt-only JSON needs repair in about 20 % of trials.** The one cause fully captured was a
   missing required top-level field (`summary`); the other causes were cut off by the spike's
   1500-character capture limit. One repair fixed 7 of 8.
5. **Reasoning tokens:** on `/chat/completions` about half of the output tokens are reasoning. A
   probe with `max_tokens: 5` returned `content: null`, with all the tokens spent on reasoning.
   Caps (Q-031) must budget for reasoning, and a key-validation probe must allow enough tokens.
6. **Prompt caching works through CommandCode:** 51 of 90 trials reported cache-read tokens,
   consistent with the fixed prefix order in ADR-0025 §5.
7. **Prompt injection (informational, one fixture):** all 9 valid outputs on the injection diff
   stayed in schema and still reported the `eval` defect. One fixture proves nothing; the
   injection corpus (WP 2-31) is the real test.
8. **The clean diff** returned zero findings in all 10 valid outputs.

### Cost

Recorded usage for successful calls was about 33 000 input and 40 000 output tokens. Failed calls
add an estimated 60 000 more output tokens (no usage is reported for a failed call): about 32 000
from the runaway in finding 2, and most of the rest from the `output_format` failures and their
repairs. That is well under one US dollar
at the published DeepSeek V4 Flash rate. The V4.1 price is not in `/models`.

## Recommendations (for the owner; nothing below is decided)

- **Gateway strategy (`technical-approach.md` §3.4).** Choose the structured-output mode **per
  provider + endpoint + model, from a recorded probe**, not from the SDK's capability defaults. For
  CommandCode + `deepseek/deepseek-v4.1-flash`, use `/messages` with the forced-tool mode. Keep
  `json_schema` as an alternative only with the guards below. Treat `output_format` as unsupported
  until a probe shows it works.
- **Runaway guard:** a call that ends with `finish=length` while producing structured output is a
  failure with a recorded reason, not a repair candidate. The per-call output cap should sit well
  below 8000 tokens for juror calls (sized with Q-031), and the wall-clock cap must cut a runaway
  off early.
- **One repair attempt** is worth keeping for prompt-only JSON (7 of 8 fixed), but not for a
  runaway or an ignored-schema mode.
- **Key validation** uses an authenticated minimal call, never `/models` alone (spec updated).

## Not covered

- Ollama or any local server (none running here); Anthropic-native Claude models; the `/responses`
  endpoint; streaming structured output; tool calling beyond the forced JSON tool.
- More than one model. Results are for `deepseek/deepseek-v4.1-flash` on CommandCode only and do
  not carry over to other models or providers without a probe.
- Review quality. The grounding check is mechanical; the planted defects were not scored, and the
  pre-v1 quality spike stays dropped (ADR-0023).
