# ADR-0029: Model capability probes — test a model before a reviewer trusts it

- Status: accepted (owner decision, 2026-11-27)
- Date: 2026-11-27
- Owners: AI pipeline + security
- Amends: ADR-0011 (key validation; where catalog capabilities come from), ADR-0026 and
  `architecture/technical-approach.md` §3.4 (how the gateway chooses a structured-output mode)
- Supersedes: —
- Revisit trigger: a probed mode fails in production more than the repair budget allows, a provider
  publishes reliable capability metadata in `/models`, or the `ai` SDK major version changes.

## Context

The 2026-11-27 spike ([`../analysis/spikes/2026-11-27-commandcode-structured-output.md`](../analysis/spikes/2026-11-27-commandcode-structured-output.md))
showed that a provider's and a library's stated capabilities are not enough:

- CommandCode's `/models` answers **without a key**, so the ADR-0011 flow ("a 401 from the model
  endpoint means a bad key") would store an invalid key.
- `/models` has no capability flags. The registry can say a model "supports structured output", but
  the same model behaved very differently by mode: forced tool 18/18 valid, `json_schema` 16/18 with
  a whitespace runaway to the token cap, `output_format` 0/18 because the gateway appears to drop it.
- About half the output tokens of a reasoning model are reasoning, so a cap sized for visible output
  returns nothing.

`technical-approach.md` §3.4 said "native structured output where the provider supports it". That
trusts metadata the spike showed is wrong or missing. The owner decided on 2026-11-27 that a model
is tested before a reviewer relies on it.

## Options

1. **Probe each provider + model + endpoint before binding** (chosen). A small, synthetic,
   budgeted test decides the structured-output mode and records the model's real behaviour.
2. **Trust the registry and the SDK defaults.** No probe cost; the failures in the spike would reach
   real reviews.
3. **Hard-code a mode per provider.** Works for one provider; breaks on the next model or gateway
   change.

## Decision

### What a probe is

A **capability probe** is a short, automatic test run with the operator's key against one
`(provider, model, endpoint)`. It uses only **built-in synthetic fixtures** — never repository
content — and has a hard token budget (default 60 000 tokens, shown as an estimate before it runs).

It checks, in order:

1. **Auth.** One authenticated minimal completion with enough output tokens for a reasoning model
   (default 256). A 401/403 rejects the key; `/models` alone never validates a key.
2. **Structured-output modes** that the endpoint offers, each on the probe set (at least one case
   with findings, one with **no** findings, and one prompt-injection case; 2 runs each by default):
   - forced tool call (Anthropic Messages `tool_choice: any`, or OpenAI `tools` + `tool_choice`);
   - native schema (`response_format: json_schema`, or `output_format`);
   - schema in the prompt, with one repair attempt.

   A mode **passes** only if every run is schema-valid (after at most one repair, and only for the
   prompt mode), no run ends with `finish=length`, and p90 latency is inside the per-call wall-clock
   cap. The gateway uses the passing mode with the highest first-try validity, then the lowest p90.
3. **Behaviour facts** recorded for caps and cost: reasoning-token share, whether cache-read tokens
   are reported, output tokens per call, and latency.

If no mode passes, the model cannot be bound; the UI shows why.

### When a probe runs

- When a model is first bound to a reviewer or to a model role (`reasoning`/`fast`, ADR-0025 §5).
- When the probe version changes (new fixtures, a new adapter, or an `ai` SDK upgrade).
- When the model's `supported_endpoints` change on a catalog refresh.
- After 3 consecutive structured-output failures of a bound model in real turns.
- On demand by the owner.

A re-probe that fails marks the binding `degraded` and visible. The gateway never silently switches
to another mode or model.

### Runtime guards (with or without a probe)

- A structured-output call that ends with `finish=length` is a **failure with a recorded reason**,
  not a repair candidate.
- Per-call output caps budget for reasoning tokens (sized with Q-031), and the wall-clock cap stops
  a runaway early.
- Error handling classifies provider errors by HTTP status, not by body shape.

### Records

- Each probe is stored (`model_probes`) with the provider, model, endpoint, probe version, SDK
  version, per-mode results, the chosen mode, tokens used, actor, and time. Probes are audited.
- The review receipt names the structured-output mode and the probe ID used for each model call.

**Tier:** MVP. The MVP binds one reviewer to a catalog model and depends on structured output.

## Consequences

- A broken mode is found at setup, on synthetic data, not on the first real PR.
- Setup costs a small, visible amount of the operator's tokens per bound model.
- Capability facts become data per instance instead of assumptions in a registry.
- One more step in provider onboarding and one more table.

## Security and operations

- Probes send only built-in synthetic fixtures, so no repository content leaves the perimeter.
- Probe fixtures include a prompt-injection case; the injection corpus (WP 2-31) remains the real
  release gate.
- The probe uses the same egress policy, key handling, and redaction as a review.
- A probe run is rate-limited and audited; its budget is enforced in code.

## Evidence

- [`../analysis/spikes/2026-11-27-commandcode-structured-output.md`](../analysis/spikes/2026-11-27-commandcode-structured-output.md)
  (108 trials, `deepseek/deepseek-v4.1-flash` on CommandCode).
- [`../product/specs/provider-model-discovery.md`](../product/specs/provider-model-discovery.md) §1–§3.

## Follow-ups

- Specify the probe in `provider-model-discovery.md`, the data model, the implementation plan
  (WP 1-19a), and G1 (done with this ADR).
- Finish spike S-C for Ollama and an Anthropic-native model; add any new failure pattern to the
  probe set.
- Size the per-call output cap with Q-031 using the recorded reasoning share.
