# Spec: Provider and model discovery

- Status: draft for owner review
- Date: 2026-11-15
- Owner: platform + security
- Related: ADR-0011
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Owner directive

The operator adds a provider key; Jury Forge **fetches the models available with that key**. The
operator never types a model name. Keys are stored encrypted.

## Problem

Model IDs drift constantly. A free-text model field lets an operator bind an agent to a model that
does not exist, a retired model, or a model their key cannot access — and the failure appears only at
review time. A provider catalog makes the invalid state unrepresentable and gives the product the
metadata it needs for token budgeting, cost, and capabilities.

## Supported provider kinds (v1)

| Kind | Base URL shape | Model endpoint | Auth |
| ---- | -------------- | -------------- | ---- |
| `openai` | `https://api.openai.com/v1` | `GET /models` | `Authorization: Bearer` |
| `anthropic` | `https://api.anthropic.com` | `GET /v1/models` | `x-api-key`, `anthropic-version` |
| `commandcode` | `https://api.commandcode.ai/provider/v1` | `GET /models` | Bearer |
| `openrouter` | `https://openrouter.ai/api/v1` | `GET /models` (public; pricing + context) | Bearer (for calls) |
| `openai-compatible` | operator URL | `GET /models` | Bearer or configured header |
| `local` | operator URL (Ollama/vLLM/…) | `GET /v1/models` | optional key |

**CommandCode (verified 2026-11-15):** the live models endpoint is
`https://api.commandcode.ai/provider/v1/models`. Each model carries a `supported_endpoints` field
(chat completions, responses, and/or messages); Claude models answer on `/v1/messages` only. Pricing
is on the separate Pricing & Limits page, not necessarily in `/models`. The catalog must store the
supported endpoints per model and the gateway must choose the right route — do not assume one
provider-wide flavor.

**OpenRouter (verified 2026-11-15):** `GET https://openrouter.ai/api/v1/models` is public and
returns `pricing` (prompt/completion/image/audio/cache read/cache write), `context_length`, and
`supported_parameters`. This is the best-case provider for catalog/pricing discovery.

## 1. Provider onboarding

```
Add provider
  → name, kind, base URL, API key
  → server normalizes the base URL and calls the model endpoint
  → 401/403: reject, store nothing
  → 404/unsupported: offer a signed provider manifest (see §5), or reject
  → success: store encrypted credentials + provider row
  → fetch and cache models
  → show catalog to the operator
```

- The key is validated **before** it is stored.
- The key is write-only: the API returns `hasKey`, never the value or ciphertext.
- The provider is bound to its origin; a key cannot be reused against a different host.
- The operator can verify/refresh later; a failed refresh marks the provider `degraded` but keeps
  the last known catalog (with an `stale` badge) until it expires.
- A provider can be disabled without deleting its key; agents bound to it become unavailable, with a
  visible reason.

## 2. Model catalog

Each entry:

| Field | Source |
| ----- | ------ |
| `modelId` | Provider `/models` |
| `displayName` | Provider or registry |
| `contextWindow` | Registry / provider metadata / unknown |
| `maxOutput` | Registry / provider metadata / unknown |
| `inputPrice`, `outputPrice` | Registry; operator override optional |
| `capabilities` | Registry: chat, tools, structured output, vision, streaming, embeddings |
| `supportedEndpoints` | Provider (CommandCode `supported_endpoints`) or adapter default: `chat`, `responses`, `messages` |
| `pricingSource` | `catalog` / `registry` / `manual` / `unknown` |
| `source` | `provider` or `registry` |
| `firstSeenAt`, `lastSeenAt` | Jury Forge |
| `status` | `available`, `stale`, `unknown`, `deprecated` |

- The catalog is cached per provider; refresh on demand and daily.
- Known models are enriched by a **versioned model registry** (JSON, signed or bundled with the
  release). Unknown models are still selectable only if the provider returns them, flagged
  `unknown`, and use conservative limits.
- The registry is not a vendor price list we maintain forever; it is an operator-overridable
  catalog. A local instance can ship a registry snapshot and refresh it from a signed URL.
- **No free-text model field anywhere.** The agent editor's model picker only offers catalog
  entries. The API rejects a `modelId` not present for the provider.

## 3. Binding an agent to a model

- An agent version references `providerId` + `modelId` + `endpoint` + params.
- The endpoint must be one of the model's `supportedEndpoints`; the UI picks a valid default
  (prefer chat, then responses, then messages) and the gateway routes accordingly. This matters for
  CommandCode, where Claude models only answer on `/v1/messages`.
- On save, the server checks the catalog entry exists and is available.
- If the model disappears on refresh, the agent becomes `configuration_error`; the UI explains and
  offers a replacement from the current catalog. Existing sessions keep their snapshot; new turns
  fail visibly rather than silently switching models.
- Model params are validated against the model's capability schema (for example, no `stream: true`
  until streaming is implemented; no tool calls on a non-tool model).

## 4. Encryption and access

- Envelope encryption: a per-provider data key wrapped by the instance root key/KMS.
- Ciphertext is versioned; rotation re-wraps without re-entering the key.
- The key is decrypted only in the provider gateway, immediately before the call.
- The key is bound to `baseUrl`/allowed origins; no copy-to-arbitrary-URL path.
- Only owner/admin can add, rotate, or delete a provider; every action is audited.
- The key is never logged, included in an error, or returned by an API.
- A provider health check may use the key; the check result is cached and does not leak the key.

## 5. Fallback for providers without a models endpoint

Some OpenAI-compatible gateways do not expose `/models`. Options:

1. **Reject** with a clear message: "This provider does not expose a model catalog. Use a provider
   that does, or install a signed provider manifest."
2. **Signed provider manifest:** a small JSON file (operator-supplied, signed by the org) listing
   model IDs and metadata. It is an explicit, auditable fallback, not a free-text field.
3. **Operator-curated catalog** in the UI: still a selection from a server-validated list, never a
   free-text field.

The default is (1) + (2). Do not silently accept an unvalidated model name.

## 6. Pricing discovery

Pricing is a **best-effort enrichment**, not the source of model existence. The model exists because
`/models` returned it; the price comes from the best available source.

Sources, in order:

1. **Provider `/models` pricing fields.** Some OpenAI-compatible gateways (for example OpenRouter)
   return `pricing.prompt`, `pricing.completion`, `pricing.request`, `pricing.image`, and
   `context_length`. Parse and normalize per-token/per-million values.
2. **Provider pricing endpoint** if the adapter knows one. Rare; do not scrape HTML pages.
3. **Versioned model registry** for known OpenAI/Anthropic/Google/CommandCode families.
4. **Admin price override** for a custom/private model. Audited; shown with a source and date.
5. **Unknown** — token-only budget; the UI shows “cost unknown,” never a fake dollar figure.

CommandCode: verify whether its `/models` response includes pricing. If it does, parse it; if not,
use the registry or an admin override. Do not hard-code a price list from a package cache.

**Base URL detection:** map known hosts to adapters (`api.openai.com`, `api.anthropic.com`,
`openrouter.ai`, `api.commandcode.ai`, localhost). A custom base URL uses the OpenAI-compatible
adapter with a provider manifest. Pricing is fetched only if the endpoint exposes it; never scrape
HTML pricing pages. An admin can set a manual price for a custom/private model.

Normalized pricing fields:

| Field | Meaning |
| ----- | ------- |
| `inputPrice` | per 1M input tokens |
| `outputPrice` | per 1M output tokens |
| `cacheReadPrice` | per 1M cached-input tokens (if provider charges separately) |
| `cacheWritePrice` | per 1M cache-write tokens (if provider charges) |
| `source` | `catalog` / `registry` / `manual` / `unknown` |
| `updatedAt` | when the price was last resolved |

- A manual override does **not** add a model to the catalog; the model still has to come from
  `/models`.
- A price change is audited and shown on the provider detail. It affects estimates, not whether an
  agent can run.
- If the provider reports cache reads/writes in usage, price them separately; otherwise charge the
  normal input price (conservative).
- Budget enforcement always has a token ceiling; currency is additive when a price is known.

## 7. API surface (proposed)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/v1/providers` | List providers (no secrets) |
| POST | `/api/v1/providers` | Add + validate + fetch models |
| GET | `/api/v1/providers/:id` | Provider detail + catalog status |
| POST | `/api/v1/providers/:id/verify` | Re-validate the key |
| POST | `/api/v1/providers/:id/refresh` | Re-fetch the model catalog |
| PATCH | `/api/v1/providers/:id` | Rename, rotate key, disable |
| DELETE | `/api/v1/providers/:id` | Soft-delete; agents become unavailable |
| GET | `/api/v1/providers/:id/models` | Cached catalog |
| POST | `/api/v1/providers/:id/models/refresh-metadata` | Re-enrich from registry |

All require session + role; all mutations are audited.

## 8. UI

- **Providers** page: add provider (kind, base URL, key), verify, status, last refresh.
- **Model catalog** table: model ID, context, prices, capabilities, source, staleness; refresh.
- **Agent editor**: provider select → model select (catalog only) → params; no text input for model.
- **Unavailable state:** a clear banner when a provider is degraded or a model disappeared.
- **Cost preview:** per-model price and estimated cost for a typical review.
- **Key management:** set/replace/rotate/delete; never reveal.

## 9. Security

- Key validation must not be an SSRF: enforce HTTPS, block private/link-local/loopback/metadata
  ranges, and bind the destination to the provider's allowed origin.
- The model endpoint is called with a short timeout and a size cap.
- Provider errors are mapped to safe taxonomy codes; no raw body or headers in logs.
- A provider key cannot be copied to a different base URL; credential reuse is by reference, not by
  ciphertext copy.
- Rate-limit provider verification to prevent abuse.

## 10. Acceptance criteria

- [ ] Adding a valid OpenAI-compatible key (e.g. CommandCode, OpenAI) fetches a model list and stores the provider encrypted.
- [ ] An invalid key is rejected and nothing is stored.
- [ ] The agent editor has no free-text model field; only catalog entries are selectable.
- [ ] A model missing from the catalog cannot be saved via the API.
- [ ] A provider without `/models` is rejected or uses a signed manifest; no free text.
- [ ] Refreshing the catalog marks removed models deprecated and surfaces affected agents.
- [ ] The key is never returned, logged, or sent to an origin other than the provider.
- [ ] A provider refresh is audited; a rotation is audited.
- [ ] The model catalog shows context, price, and capabilities for known models.
- [ ] A provider that exposes pricing in `/models` shows it with `source=catalog` and a date.
- [ ] A custom provider can be priced manually; the model list is still provider-driven.
- [ ] Unknown pricing shows “cost unknown” and enforces a token budget.
- [ ] Cache reads/writes are priced separately when reported; otherwise charged as input.

## 11. Open questions

- Exact CommandCode models endpoint/response shape and whether it exposes pricing (spike with a
  real key).
- Which providers expose pricing in `/models` vs require the registry/manual override?
- Do we ship a registry snapshot in the image, or fetch it? (Default: bundled snapshot + optional
  signed refresh.)
- Do we allow an operator price override for private/self-hosted models? (Default: yes, audited.)
- How do we handle providers that require custom headers (Azure, gateways)? (Adapter config; not v1
  free text.)
