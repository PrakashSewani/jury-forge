# Spec: Provider and model discovery

- Status: draft for owner review — **MVP gate**: owner approval required before Phase 1b work that implements it (per-milestone approval, 2026-11-27). **Revised 2026-11-27** in the MVP spec review (release tiers, ADR alignment; see `delivery/status.md`); not yet approved
- Date: 2026-11-15
- Owner: platform + security
- Related: ADR-0011, ADR-0029 (capability probes), ADR-0030 (local provider egress), ADR-0028 (v1 roles)
- Parent: [`agentic-review-sessions.md`](agentic-review-sessions.md)

## Owner directive

The operator adds a provider key; Jury Forge **fetches the models available with that key**. The
operator never types a model name. Keys are stored encrypted.

## Release tiers

- **MVP (G1, WP 1-18 to 1-20):** provider kinds `openai`, `anthropic`, `commandcode`, `openrouter`,
  `openai-compatible`, and `local`; key validation by an authenticated call; `/models` discovery;
  the catalog with the bundled registry snapshot; the capability probe (§2.1) as the binding gate;
  agent binding (§3); envelope encryption (§4); pricing sources 1, 3, 4, and 5 (§6); the API (§7)
  and the providers/catalog/probe UI (§8). One operator, the owner, manages providers.
- **v1:** the cost preview for a typical review, the catalog diff on refresh, and maintainer
  read access to provider status (ADR-0028).
- **Not tiered yet:** the signed provider manifest (§5, option 2; no org signing-key model exists
  yet), an opt-in signed registry refresh (§2), and custom-header providers (Azure, gateways).
  In the MVP a provider without a usable `/models` endpoint is rejected (§5, option 1).

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
| `local` | operator URL (Ollama/vLLM/…); plain HTTP allowed only to a loopback/private host under [ADR-0030](../../decisions/ADR-0030-local-provider-egress.md) | `GET /v1/models` | optional key |

**CommandCode (verified 2026-11-15):** the live models endpoint is
`https://api.commandcode.ai/provider/v1/models`. Each model carries a `supported_endpoints` field
(chat completions, responses, and/or messages); Claude models answer on `/v1/messages` only. Pricing
is on the separate Pricing & Limits page, not necessarily in `/models`. **Spike 2026-11-27**
([`../../analysis/spikes/2026-11-27-commandcode-structured-output.md`](../../analysis/spikes/2026-11-27-commandcode-structured-output.md)):
`/models` needs **no auth** (200 with no key or a bad key), so it cannot validate a key; it returns
only `id`, `object`, `name`, `created`, `owned_by`, `context_length`, and `supported_endpoints` —
no pricing and no capability flags. The catalog must store the
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
  → server makes one authenticated minimal call (a short completion on a catalog model) when the
    model endpoint is public — CommandCode's `/models` answers 200 without a key (spike 2026-11-27)
  → 401/403 from either call: reject, store nothing
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
| `capabilities` | Registry claims (chat, tools, structured output, vision, streaming, embeddings); structured output and auth are verified by the capability probe (§2.1) |
| `supportedEndpoints` | Provider (CommandCode `supported_endpoints`) or adapter default: `chat`, `responses`, `messages` |
| `pricingSource` | `catalog` / `registry` / `manual` / `unknown` |
| `source` | `provider` or `registry` |
| `firstSeenAt`, `lastSeenAt` | Jury Forge |
| `status` | `available`, `stale`, `unknown`, `deprecated` |

- The catalog is cached per provider; refresh on demand and daily (a `worker` cron in the MVP,
  technical-approach §3.3).
- Known models are enriched by a **versioned model registry** (JSON, signed or bundled with the
  release). Unknown models are still selectable only if the provider returns them, flagged
  `unknown`, and use conservative limits.
- The registry is not a vendor price list we maintain forever; it is an operator-overridable
  catalog. **Default: the snapshot bundled with the release, and no network fetch.** Refreshing it
  from a signed URL is opt-in, off by default, and uses an operator-configured URL, because a
  default fetch from a project-run host would be a phone-home (AGENTS.md; non-negotiable 5).
  Between releases, stale prices are corrected by an admin price override (§6); budgets stay
  token-based, so a stale price never lets a turn exceed its cap.
- **No free-text model field anywhere.** The agent editor's model picker only offers catalog
  entries. The API rejects a `modelId` not present for the provider.

## 2.1 Capability probe (ADR-0029)

Before a model is bound to a reviewer or a model role, Jury Forge runs a **capability probe**: a
short test with the operator's key, on **built-in synthetic fixtures only** (no repository content),
within a hard token budget (default 60 000 tokens, estimated and shown before it runs).

| Step | Checks | Pass rule |
| ---- | ------ | --------- |
| Auth | One authenticated minimal completion, with enough output tokens for a reasoning model (default 256) | HTTP 200; a 401/403 rejects the key |
| Structured output | Each mode the endpoint offers — forced tool call, native schema, schema in the prompt with one repair — on a finding case, an empty case, and an injection case (2 runs each) | Every run schema-valid; no `finish=length`; p90 inside the per-call wall-clock cap |
| Behaviour | Reasoning-token share, cache-read tokens reported, output tokens per call, latency | Recorded, not pass/fail |

- The gateway uses the passing mode with the highest first-try validity, then the lowest p90.
- No passing mode → the model cannot be bound; the UI shows the per-mode results.
- Re-probe when the probe version changes (fixtures, adapter, or `ai` SDK upgrade), when the
  model's `supportedEndpoints` change, after 3 consecutive structured-output failures in real turns,
  or on demand. A failed re-probe marks the binding `degraded`; nothing switches silently.
- Every probe is stored and audited; the receipt names the mode and probe ID used.

Spike evidence for each rule:
[`../../analysis/spikes/2026-11-27-commandcode-structured-output.md`](../../analysis/spikes/2026-11-27-commandcode-structured-output.md).

## 3. Binding an agent to a model

- An agent version references `providerId` + `modelId` + `endpoint` + params.
- The endpoint must be one of the model's `supportedEndpoints`; the UI picks a valid default
  (prefer chat, then responses, then messages) and the gateway routes accordingly. This matters for
  CommandCode, where Claude models only answer on `/v1/messages`.
- On save, the server checks the catalog entry exists and is available, and that a **passing
  capability probe** exists for the provider, model, endpoint, and current probe version (§2.1).
- If the model disappears on refresh, the agent becomes `configuration_error`; the UI explains and
  offers a replacement from the current catalog. Existing sessions keep their snapshot; new turns
  fail visibly rather than silently switching models.
- Model params are validated against the model's capability schema (for example, no `stream: true`
  until streaming is implemented; no tool calls on a non-tool model).

## 4. Encryption and access

- Envelope encryption: a per-provider data key (AES-256-GCM) wrapped by the master key from
  `JURY_MASTER_KEY_FILE` (technical-approach §3.9). An external KMS is not in v1.
- Ciphertext is versioned; rotation re-wraps without re-entering the key.
- The key is decrypted only in the provider gateway, immediately before the call.
- The key is bound to `baseUrl`/allowed origins; no copy-to-arbitrary-URL path.
- Only the **owner** can add, rotate, or delete a provider, with re-authentication; every action is
  audited. (v1 roles are owner/maintainer/reader, ADR-0028; an admin role arrives in v1.2. The MVP
  has one operator, the owner.)
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

**MVP: (1) only.** Option (2) needs an org signing-key model that no ADR defines yet, so it is not
tiered; option (3) is not planned. Do not silently accept an unvalidated model name.

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

CommandCode: its `/models` response has **no pricing** (spike 2026-11-27), so prices come from the
registry or an admin override. Do not hard-code a price list from a package cache.

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
| POST | `/api/v1/providers/:id/models/:modelId/probe` | Run a capability probe (shows the token estimate first) |
| GET | `/api/v1/providers/:id/models/:modelId/probes` | Probe history and per-mode results |

All require session + role; all mutations are audited.

## 8. UI

- **Providers** page: add provider (kind, base URL, key), verify, status, last refresh.
- **Model catalog** table: model ID, context, prices, capabilities, source, staleness; refresh.
- **Probe panel** per model: last probe, chosen structured-output mode, per-mode results, reasoning
  share, tokens spent; run a probe (estimate first).
- **Agent editor**: provider select → model select (catalog only) → params; no text input for model.
- **Unavailable state:** a clear banner when a provider is degraded or a model disappeared.
- **Cost preview:** per-model price and estimated cost for a typical review.
- **Key management:** set/replace/rotate/delete; never reveal.

## 9. Security

- Key validation must not be an SSRF: enforce HTTPS, block private/link-local/loopback/metadata
  ranges, and bind the destination to the provider's allowed origin. **The one exception is the
  `local` kind** ([ADR-0030](../../decisions/ADR-0030-local-provider-egress.md)): only the owner
  sets it; the exact host entered is resolved and pinned; plain HTTP only to loopback/private
  addresses; link-local, metadata, the instance's own listeners, and the database host are always
  refused; no redirects.
- The model endpoint is called with a short timeout and a size cap.
- Provider errors are mapped to safe taxonomy codes; no raw body or headers in logs.
- A provider key cannot be copied to a different base URL; credential reuse is by reference, not by
  ciphertext copy.
- Rate-limit provider verification to prevent abuse.

## Non-goals

- A free-text model field, anywhere, ever.
- Scraping provider pricing pages, or maintaining a vendor price list as a service.
- A hosted model registry the instance must contact; the registry ships with the release.
- Automatic model fallback without an explicit policy (ADR-0016).
- Tool use in PR review; a forced tool call is only a structured-output mode (ADR-0029).

## 10. Acceptance criteria

All MVP unless marked.


- [ ] Adding a valid OpenAI-compatible key (e.g. CommandCode, OpenAI) fetches a model list and stores the provider encrypted.
- [ ] An invalid key is rejected and nothing is stored, including on a provider whose `/models`
      answers without a key.
- [ ] A model cannot be bound without a passing capability probe; the probe sends only synthetic
      fixtures and stays inside its token budget.
- [ ] A structured-output call that ends with `finish=length` fails with a recorded reason and is
      not repaired.
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
- [ ] Only the owner can add, rotate, disable, or delete a provider; a non-owner attempt is refused
      and audited.
- [ ] SSRF: a non-`local` provider URL that resolves to a private, loopback, link-local, or metadata
      address is refused, and a redirect to one is refused.
- [ ] A `local` provider on a loopback or private address works over plain HTTP; the same URL on a
      public address requires HTTPS; link-local, metadata, the instance's own listeners, the
      database host, and a changed DNS answer after pinning are refused (ADR-0030).
- [ ] With no network access to any registry host, the catalog is still enriched from the bundled
      snapshot and no registry fetch is attempted by default.
- [ ] (v1) The cost preview shows an estimate for a typical review per model.

## Metrics

- Provider add success rate on the first attempt, by kind, and the error codes of failures.
- Probe pass rate per model and mode; probe tokens spent against the estimate.
- Catalog refresh failures and stale-catalog duration per provider.
- Turns that failed because a bound model disappeared or degraded (target: every one surfaced with
  a reason, none silently switched).

## Rollout

- Ships in M1.3 (WP 1-18 egress, 1-19 onboarding, 1-19a probe, 1-20 gateway) and is reached from
  first-run-setup Stage 4. No feature flag: a review cannot run without it.
- Contract tests per provider kind use recorded fixtures; a live smoke test per kind runs nightly
  with opt-in CI secrets (technical-approach §18), never as a contributor gate.
- Docs: an operator page per provider kind, including running a `local` server on the Docker host
  gateway and the plain-HTTP warning.


## 11. Open questions

- ~~Exact CommandCode models endpoint/response shape and whether it exposes pricing.~~ Answered by
  the 2026-11-27 spike: public `/models`, no pricing, no capability flags.
- Which providers expose pricing in `/models` vs require the registry/manual override?
- ~~Do we ship a registry snapshot in the image, or fetch it?~~ Decided in the MVP spec review
  (2026-11-27): bundled snapshot, no default fetch; a signed refresh from an operator-configured URL
  is opt-in and not tiered yet.
- Do we allow an operator price override for private/self-hosted models? (Default: yes, audited.)
- How do we handle providers that require custom headers (Azure, gateways)? (Adapter config; not v1
  free text; not tiered.)
- Who signs a provider manifest, and with which key? (Open; the manifest is not tiered until an ADR
  answers it.)
