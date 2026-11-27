# ADR-0011: Provider and model discovery

- Status: accepted (G0, 2026-11-16; amended by ADR-0025 model roles; key validation and verified capabilities amended by ADR-0029; egress for the `local` kind amended by ADR-0030)
- Date: 2026-11-15
- Owners: platform + security
- Supersedes: —
- Revisit trigger: a provider without a models endpoint becomes a first-class requirement, or a
  registry-update mechanism is needed.

## Context

The owner wants operators to add a provider key and see the models that key can use. Free-text model
entry lets an agent bind to a model that does not exist, is retired, or is not available to the key;
the failure appears only at review time. Model metadata (context, price, tools) is also needed for
budgeting and capability checks.

## Options

1. **Free-text model ID** — flexible, error-prone, rejected.
2. **Static bundled list** — no live validation, stale, rejected as the only source.
3. **Provider `/models` discovery + versioned registry enrichment** — live truth + metadata; chosen.
4. **Signed provider manifest** — fallback for gateways without `/models`; chosen as a guarded
   exception.
5. **Provider-specific hard-coded catalogs** — maintenance burden; only as registry entries.

## Decision

- Every provider must expose a model catalog via a `/models` endpoint at add/verify time.
- The UI and API accept only a `modelId` present in that provider's catalog. There is no free-text
  model field.
- Pricing is a best-effort enrichment: parse provider `/models` pricing when exposed, else use the
  versioned registry, else an audited admin override, else show “cost unknown” and enforce token
  budgets. See [`../product/specs/provider-model-discovery.md`](../product/specs/provider-model-discovery.md#6-pricing-discovery).
- Known models are enriched from a versioned model registry (context window, max output, prices,
  capabilities); unknown models are flagged and use conservative defaults.
- Keys are validated before storage; invalid keys store nothing.
- Keys are envelope-encrypted, write-only, origin-bound, and rotatable. A key cannot be reused
  against a different base URL.
- If a provider has no `/models`, the default is to reject; a signed provider manifest is the only
  fallback, and it is audited.
- CommandCode is an *example* OpenAI-compatible provider (not a requirement); verify
  `https://api.commandcode.ai/provider/v1/models` (or `/v1/models`) in the spike.

## Consequences

**Easier:** no invalid model bindings; live provider truth; metadata for budgets/capabilities;
clear failure states; safer key handling.

**Harder:** providers without `/models`; registry maintenance; catalog refresh and deprecation; a
provider outage can hide models (last-known cache helps).

**Invariants:** an agent version references a catalog entry; a removed model marks the agent
`configuration_error`; no API accepts an unvalidated model string.

## Security and operations

- Model endpoint calls enforce HTTPS, block private/loopback/link-local/metadata ranges, and bind to
  the provider origin.
- Key verification is rate-limited; errors are mapped to safe codes; no key in logs.
- Refresh is scheduled and on demand; stale catalogs are marked.
- Audit provider add/verify/refresh/rotate/delete and model deprecation.

## Evidence

- CommandCode provider package exposes `/v1/models` and `/provider/v1/models`; model IDs include
  OpenAI/Anthropic/Google/Qwen/MiniMax/DeepSeek families.
- Spec: [`../product/specs/provider-model-discovery.md`](../product/specs/provider-model-discovery.md).
- Parent: [`../product/specs/agentic-review-sessions.md`](../product/specs/agentic-review-sessions.md).

## Follow-ups

- Spike with a real CommandCode key: exact path, response shape, auth header, model metadata.
- Define the model registry schema and update channel.
- Decide whether operators can override prices for private models (default: yes, audited).
