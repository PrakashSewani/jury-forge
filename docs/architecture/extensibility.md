# Extensibility

Jury Forge should be extensible without becoming a plugin framework that nobody can operate. The
rule: **opinionated core, replaceable edges, safe extension points**. No arbitrary code execution in
the server process for v1.

## 1. The seams

| Seam | Interface | Default | Replaceable by |
| ---- | --------- | ------- | -------------- |
| Forge | `ForgeAdapter` | GitHub | GHES, GitLab, Gitea, Bitbucket |
| Provider | `ProviderAdapter` | OpenAI-compatible, Anthropic-compatible (vendors such as CommandCode are example presets) | Gateways, local servers, new vendors |
| Model catalog | `ModelCatalog` | Provider `/models` + registry | Signed manifest, curated catalog |
| Agent runtime | `AgentRuntime` | LangGraph.js or thin turn runner | Another harness behind the session contract |
| Queue | `JobQueue` | PostgreSQL `SKIP LOCKED` | Redis/BullMQ, SQS, RabbitMQ |
| Object storage | `ArtifactStore` | Local volume | S3-compatible |
| Identity | `IdentityProvider` | GitHub OAuth | OIDC/SSO, SAML via a proxy |
| Notification | `Notifier` | Webhook + email | Slack, Teams, PagerDuty |
| Context source | `ContextProvider` | Diff (T0) + repo graph (T2, v1.1) + packs | New index types, external knowledge |
| Repository graph | `KnowledgeGraph` | Postgres adjacency | Graph DB, external index |
| Policy | `PolicyEngine` | Built-in schema/DSL | Custom rules, external policy service |

Each seam has a conformance test suite. An adapter that does not pass is not supported.

## 2. Forge adapter

```ts
interface ForgeAdapter {
  readonly id: 'github' | 'ghes' | 'gitlab' | 'gitea' | ...;
  verifyWebhook(headers, rawBody, secret): WebhookVerification;
  normalizeWebhook(payload): ForgeEvent;
  listInstallations(credentials): Installation[];
  listRepositories(installation, page): RepositoryPage;
  fetchPullRequest(repo, number): PullRequest;
  fetchDiff(repo, number, base, head): Diff;
  fetchFile(repo, path, ref): FileText | null;
  listTree(repo, ref, root): Tree;
  publishReview(repo, number, review): PublishedReview;
  minimizeReview(repo, reviewId): void;
  createCheck(repo, sha, check): Check;
}
```

Rules:

- The adapter normalizes forge payloads into our events; the pipeline never sees a GitHub shape.
- The adapter owns rate limits, pagination, retries, and error mapping.
- The adapter is the only place that knows a forge's authentication model.
- A forge-specific capability that does not fit the interface is an explicit optional capability,
  not a leak.

## 3. Provider adapter

```ts
interface ProviderAdapter {
  readonly id: string;
  capabilities(model: string): ModelCapabilities;
  countTokens(model: string, input: PromptParts): number;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  stream?(request: CompletionRequest): AsyncIterable<CompletionChunk>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResult>;
  health(): Promise<ProviderHealth>;
}
```

Rules:

- The gateway, not the pipeline, knows request/response wire formats.
- Structured output is requested natively when supported; otherwise a repair turn.
- Usage is normalized (`promptTokens`, `completionTokens`, `totalTokens`, `costMicros`).
- Errors are classified (`auth`, `rate_limit`, `timeout`, `bad_request`, `server`, `content`).
- The credential is bound to allowed origins; the adapter cannot send it elsewhere.
- A conformance suite covers both API flavors, streaming, tools, malformed output, and usage.

## 4. Policy as data

The policy is a validated JSON/YAML document, not code. It covers:

- reviewer selection (`required`/`default`/`capability`/disabled) per repo/branch/path;
- severity thresholds and publish mode;
- inline caps, body budget, token/cost budgets;
- model allowlist and data policy (redaction, local-only);
- fork policy, suppression rules, preview/approve;
- required checks and labels.

A tiny expression language may cover path/severity conditions, but no `eval`, no arbitrary code.
A policy change is versioned and audited. A per-repo override is a policy row, not a fork.

## 5. Reviewers and templates

- A reviewer is a stable identity with immutable versions.
- A template is a starting document (instructions + rules + role), not a remote dependency.
- An export/import format is versioned JSON with no secrets.
- A "reviewer pack" can bundle templates + knowledge packs + policy defaults for a team; it is
  signed and installed explicitly.
- No marketplace in v1.

## 6. Knowledge packs

- Manifest + docs, content-hashed, optionally signed.
- Grants are instance configuration, never read from the pack.
- Retrieval is a service; a pack can expose a retrieval hint but cannot execute code.
- CI can upload via an API token; the UI is not the only path.
- Provenance is recorded per run.

## 7. Notification and integration events

Outbound webhooks for:

- `run.completed`, `run.failed`, `run.canceled`;
- `review.published`, `review.failed`;
- `budget.threshold`, `budget.exceeded`;
- `installation.created`, `installation.suspended`;
- `security.egress_blocked`, `security.redaction`.

Events are signed (HMAC), retried with backoff, and replayable. A receiver can verify the
signature and deduplicate by event id. This is how teams integrate Slack, PagerDuty, or an internal
portal without us building every integration.

## 8. Plugin model (later)

If a real need appears, the safe progression is:

1. **Configuration plugins:** JSON/YAML for providers, policies, templates, packs. No code.
2. **Out-of-process adapters:** a sidecar service implementing a documented HTTP/gRPC contract.
3. **WASM plugins:** sandboxed, capability-scoped, no network unless granted.
4. **Native plugins:** only for trusted, first-party integrations, with a stable ABI.

Never load arbitrary Node modules from a user-controlled directory into the API process.

## 9. API and SDK

- Versioned REST API (`/api/v1`) generated from the same schemas as the dashboard.
- OpenAPI document published with the release.
- API tokens with scopes: `runs:read`, `runs:write`, `reviewers:read`, `reviewers:write`,
  `packs:write`, `audit:read`, `admin`.
- Idempotency keys on mutating requests.
- Pagination, filtering, and stable error envelopes with request ids.
- A small TypeScript SDK and a CLI for automation.

## 10. Compatibility and deprecation

- SemVer for the API and the product.
- Deprecation policy: announce, support for at least one minor, document the migration.
- Provider/forge adapters declare a supported API version.
- Schema evolution uses additive changes; breaking changes require a new major and a migration
  guide.
- Pack/reviewer export formats are versioned and forward-compatible.

## 11. Extension anti-patterns

- A plugin that can read the database directly.
- A provider URL that bypasses the egress policy.
- A policy rule that executes code.
- A reviewer template that downloads a prompt at run time.
- A pack that grants itself.
- A webhook that calls back into the API without authentication.
- A fork of the core to add one model. Add an adapter instead.

## 12. Extensibility roadmap

| Phase | Extension |
| ----- | --------- |
| v1 | GitHub adapter, OpenAI/Anthropic/local providers, policy schema, packs, signed webhooks, API tokens |
| v1.1 | GHES, more provider capabilities (tools/streaming), outbound integrations |
| v1.2 | GitLab adapter, OIDC/SSO, external policy service |
| Later | Out-of-process adapters, WASM plugins, marketplace (only if the core is trusted) |
