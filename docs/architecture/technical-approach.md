# Technical approach (Phase 1a)

- Status: **accepted by the owner (Phase 1a, 2026-11-16)** as ADR-0026, with ADR-0003/0004/0005/0006/0010/0020 accepted. No code has been written.
- Inputs: accepted ADRs 0001, 0002, 0007–0009, 0011–0018, 0021–0025; the specs; the deep dive.
- Decides: ADR-0003, 0004, 0005, 0006, 0010, 0020 and the areas that had no ADR yet. Those decisions
  are recorded as ADR-0026 or as amendments to the existing ADRs (ADR-0003/0004/0005/0006/0010/0020
  are accepted; ADR-0010 is accepted, amended by this document: a thin turn runner, no harness in v1).
- Evidence: package versions and licences resolved live from the npm registry on 2026-11-16
  (§13). Node v24.19.0 was observed locally (`node -v`), with pnpm 12.4.2.

---

## 1. Constraints that drive every choice

These come from accepted decisions, not taste:

| # | Constraint | Source | Consequence for the stack |
| - | ---------- | ------ | ------------------------- |
| C1 | Self-hosted, MIT, no managed service, no BSL/SSPL/EE | ADR-0001/0009/0010 | Every dependency is MIT/Apache/BSD/ISC; a licence check runs in CI |
| C2 | Floor of 2 vCPU / 4 GB / 20 GB for ≤20 devs | Q-048 | **One** datastore, no JVM, no separate queue server, no object store in v1 |
| C3 | Compose-only v1; Helm in v1.2 | ADR-0023/0022 | 12-factor config; one image, several roles |
| C4 | Durable per-PR sessions; serialized turns; restarts and days of waiting | ADR-0012/0024 | A reply is a **new job**, not a parked process; state lives in Postgres |
| C5 | "Models propose, code decides" | AGENTS.md, ADR-0024/0025 | Chair, fingerprints, budgets, guards, and risk are **plain code**. The harness must not own decisions |
| C6 | OpenAI-compatible + Anthropic-compatible + local providers, `/models` discovery | ADR-0011 | A provider adapter layer with structured output and tool calls |
| C7 | Deterministic, replayable reviews; signed receipts | ADR-0025, S5 | Pure functions over stored inputs; canonical JSON; Ed25519 |
| C8 | Untrusted input everywhere | security.md | Strict schemas at every boundary; nonce-delimited prompts; egress module |
| C9 | One maintainer plus an agent chain | ADR-0023, R-039 | One language end to end, few moving parts, boring tools |

## 2. Shape of the system

```
                  ┌──────────── Docker Compose (one host) ─────────────┐
 GitHub ──HTTPS──▶│ caddy (TLS, on-demand cert per ADR-0021)           │
                  │   └──▶ app  (HTTP API + webhook ingest + static UI) │
                  │          │ enqueue (same DB txn)                    │
                  │          ▼                                          │
                  │        postgres  ◀── worker (jobs, turns, cron)    │──HTTPS──▶ model providers
                  │                          │                          │──HTTPS──▶ GitHub API
                  └──────────────────────────┴──────────────────────────┘
```

- **Four containers:** `caddy`, `app`, `worker`, `postgres`. `app` and `worker` are the **same image**
  started with a different command. Cron jobs (the §3.3 list) run inside `worker`, so there is no
  separate scheduler container in v1.
- **No Redis, no MinIO, no message broker.** Postgres is the queue, the session store, the audit
  log, and the artefact store (bounded `bytea` with retention) in v1. Object storage becomes an
  optional adapter in v1.2.
- **Modular monolith.** Modules have hard boundaries (§4), but they ship in one process type.
  Extraction is possible later; it is not planned.

## 3. Decisions

Each row: choice, alternatives considered, why, and the risk with its mitigation.

### 3.1 Language and runtime — ADR-0005 → **accept: TypeScript on Node.js 24 LTS**

| Option | Verdict |
| ------ | ------- |
| **TypeScript / Node 24 LTS** | **Chosen.** One language for API, worker, UI, and shared schemas (C9). The best SDK coverage for GitHub (Octokit) and model providers. `web-tree-sitter` runs as WASM. Ed25519 and AES-GCM ship in `node:crypto`. |
| Go | Smaller footprint and single binary, but a second language for the UI and weaker agent/LLM libraries. Rejected for v1. |
| Python | Best ML ecosystem, but we do no ML. Two languages, and a heavier runtime for the floor. Rejected. |
| Bun / Deno | Attractive, but less operational track record and edge cases with native and crypto APIs. Revisit after v1. |

- Compiler: **TypeScript 7.0.2** (Apache-2.0; the native compiler) for type checking. Production
  runs plain JS emitted by the build; no `ts-node` at runtime.
- Package manager: **pnpm** workspaces, with a lockfile and frozen installs in CI.
- Risk: TS 7 is new. Mitigation: pin it, and keep the TS 5.x line available as a fallback in CI
  until the first release.

### 3.2 Datastore — ADR-0004 → **accept: PostgreSQL 17 as the only datastore**

- Used for: relational data, queue (§3.3), audit (append-only tables plus a trigger that blocks
  UPDATE and DELETE), artefacts (`bytea`, ≤ 2 MB each, with retention), and later the graph
  (adjacency tables, ADR-0014).
- No `pgvector` in v1 (no embeddings). Postgres 17 is the minimum; 16 is tested for operators who
  bring their own database.
- **Data access: Kysely 0.29.9 (MIT)**, a typed SQL query builder. No ORM: the data model is
  explicit, and we want SQL we can read in review and `EXPLAIN`.
  - Rejected: Drizzle 0.45 (Apache-2.0; good, but its schema-as-code and migrations duplicate the SQL
    migrations), Prisma (engine binary, heavier, weaker raw-SQL ergonomics), TypeORM.
- **Migrations: plain SQL files run by `node-pg-migrate` 9.0.0 (MIT)** in a one-shot `migrate`
  container before `app` and `worker` start (compose `depends_on: condition: service_completed_successfully`).
  Expand/contract only; every migration has a tested down step until the release that drops it.
  Kysely types are generated from the live schema (`kysely-codegen`) in CI and checked in.
  *WP 1-09 (2026-11-28):* the file is `packages/store/src/db.generated.ts`; an integration test
  regenerates it from a migrated PostgreSQL 17 and fails on any difference, and `AGENTS.md` names
  it as the one generated file allowed in the repository (owner decision). IDs come from the SQL
  `uuid_v7()` default only.
  - Rejected: dbmate (an extra Go binary), Kysely's built-in migrator (its migrations are TS rather than SQL).
- Tenancy: v1 is single-org per instance, but every table carries `org_id`. Row-level security is
  **not** used in v1: a repository layer that always filters by org, plus cross-tenant tests, is
  simpler to reason about. Revisit for multi-installation (Later).
  *Amended 2026-11-28 (ADR-0035):* "every table" means every tenant-owned table, as `org_id NOT
  NULL` with composite tenant foreign keys `(org_id, parent_id)`. `users`, `user_sessions`, and
  graphile-worker's schema are the exceptions. The first migration creates the unclaimed instance
  org, and every job payload carries `org_id`.
  *Amended 2026-11-28 (ADR-0037):* `worker_heartbeats` is a further exception.

### 3.3 Queue and workers — ADR-0006 → **accept: Postgres-backed queue, `graphile-worker`**

The key requirement is **per-session serialization** (one active turn per PR session; replies
coalesce) plus transactional enqueue (webhook row and job in one transaction).

| Option | Per-session serial | Txn enqueue | Notes | Verdict |
| ------ | ------------------ | ----------- | ----- | ------- |
| **graphile-worker 0.18.0** (MIT) | **Yes:** `queue_name` = session id runs jobs strictly in order | Yes (SQL `add_job` in the same txn) | `LISTEN/NOTIFY` low latency; `job_key` for dedup/debounce (`job_key_mode: replace` gives the 30 s coalescing window); built-in cron | **Chosen** |
| pg-boss 12.38.2 (MIT) | Partial (`singletonKey`, policies) | Yes | More mature API, archive tables; serialization needs extra work | Strong fallback |
| BullMQ + Redis | Via groups (Pro feature) | No | Adds Redis; group concurrency is commercial | Rejected (C1, C2) |
| Temporal | Yes | No | Server + visibility store; far beyond the floor | Rejected (C2) |

- **Mapping:**
  - `webhook.ingest` → per delivery, deduplicated by `job_key = delivery_id`.
  - `session.turn` → `queue_name = session:<id>`, `job_key = session:<id>:pending` with
    `run_at = now + 30 s` and replace mode. This is the debounce: several replies collapse into one turn.
  - `publish.github` → `queue_name = install:<id>:writes`. This serializes writes per installation,
    the GitHub write queue from ADR-0024 §7.
  - `cron`: reconciler (10 min), retention (daily), stalled sessions (hourly), reaction poll (5 min,
    open sessions only), stuck-turn sweep (5 min), catalog refresh (daily).
    *Amended 2026-11-28 (owner decision, architecture audit Q-D):* the last two were added.
    - **Stuck-turn sweep** (MVP): a turn `running` longer than the threshold (default 20 min, 2× the
      p95 completion target, configurable; `review-progress-and-completion` RP-03) is failed with
      reason `stuck`, its job is released, and its Check Run is completed under that spec's failure
      rules. Worst case, a stuck Check Run ends about 25 min after it started.
      *Amended 2026-11-28 (ADR-0037):* the same sweep releases the queue locks of a dead worker,
      whose pool has sent no heartbeat for 2 minutes: it fences the pool, then calls
      `forceUnlockWorkers`. A crashed worker's sessions then resume within about 7 minutes instead
      of graphile-worker's 4 hours.
    - **Catalog refresh** (MVP): each provider's `/models`, once a day and staggered, plus the
      on-demand refresh. A removed model marks its reviewers `configuration_error` and never switches
      a binding (`provider-model-discovery`). The catalog diff shown on refresh is v1.
    - **Abandoned setup is not a cron job:** `/metrics` exposes `jf_setup_incomplete_seconds`,
      `doctor` warns after 7 days with the stage reached, and `/setup` shows how long it has waited.
      Before an owner is claimed there is nobody to notify, and notifications are v1.2.
- **Idempotency:** each step writes its result keyed by `(turn_id, step)`; a retried job reads it
  back instead of redoing side effects. Publish uses a stored `external_id` check before posting.
- **Generations:** a turn carries `(session_id, generation)`. A step aborts as `superseded` if the
  generation moved (ADR-0024).
- Risk: graphile-worker is pre-1.0. Mitigation: the queue sits behind a 5-function `JobQueue`
  interface (`enqueue`, `enqueueTx`, `cancel`, `schedule`, `onJob`), and the pg-boss adapter is
  written in the Phase 1b spike as proof that the swap works.
- *Spike S-A, 2026-11-28 ([note](../analysis/spikes/2026-11-28-queue-serialization-debounce.md)):*
  the choice stands. Both libraries kept one job per session (0 overlaps in 4,000 runs) and
  collapsed concurrent triggers into one turn; the pg-boss adapter fits the same port. Three
  corrections to the table above:
  - "Strictly in order" is one at a time, ordered by `priority, run_at`.
  - pg-boss 12.38.2 has a `key_strict_fifo` policy, so its serialization no longer "needs extra work",
    but a failed job blocks its key.
  - graphile-worker holds a crashed worker's lock for 4 hours.

  Both questions it raised were closed by the owner the same day: Q-051 (a named licence exception
  for `argparse`, §13) and Q-052 (ADR-0037, above).
- *WP 1-10 (2026-11-28):* the port is `JobQueue` in `contracts`, and the graphile-worker adapter is
  `GraphileJobQueue` in `store`. Its settings, the cron task-name rule, the ADR-0037 release with its
  grace wait, and the fenced-completion guard are described in [`job-pipeline.md`](job-pipeline.md).
  Integration tests with two worker processes cover serialization, debounce, transactional enqueue,
  cron once per tick, graceful stop, a killed worker, and a fenced worker.

### 3.4 Agent runtime — ADR-0010 → **change the recommendation: thin turn runner, no harness**

ADR-0010 proposed spiking LangGraph.js first. After ADR-0024/0025 that no longer fits:

- Every hard decision is now **code** (C5): routing, fingerprints, grounding, chair, budgets,
  resolution guards. The model calls left are bounded and well typed: juror review, verifier,
  appeal, recheck, reply intent, summary.
- **Durability comes from the queue and our tables** (C4). A turn is a short job of seconds to
  minutes. "Waiting for a human" is a session state, not a parked graph, so LangGraph's
  `interrupt/resume` and checkpointer would duplicate state we already own (ADR-0010 invariant 4).
- **Replay and receipts** need every model input and output stored canonically. With a harness we
  would have to intercept its internals to get that.

**Decision:** a **thin, explicit turn runner** (a step pipeline: `resolve → fetch → plan → review* →
ground → verify → chair → summarise → publish → evaluate`), each step a pure function plus a
persisted result. Model access goes through our **provider gateway**, built on the **Vercel AI SDK
`ai` 7.0.173 (Apache-2.0)** for provider adapters, structured output, tool calls, and streaming.

| Option | Verdict |
| ------ | ------- |
| **Thin runner + `ai` SDK adapters** | **Chosen.** Smallest surface; every step persisted and replayable; the provider adapters are maintained upstream. |
| LangGraph.js + Postgres checkpointer | Rejected for v1: a second state store; the graph abstraction is unused when the chair is code; LangChain dependency weight. Revisit if v1.1 branch review needs multi-step tool exploration. |
| OpenAI Agents SDK 0.22.0 (MIT) | Rejected: provider breadth is narrower, and its sessions duplicate ours. |
| Mastra 1.83.0 (Apache-2.0 core, `ee/` portions) | Rejected: open-core risk (C1) and framework lock-in. |

- **Gateway rules:**
  - Catalog-only model IDs.
  - Keys are resolved by ID inside the gateway, never passed into step state.
  - Egress goes through the egress module (allowlist, DNS re-check, no redirects to private ranges).
  - Per-provider token bucket.
  - Hard per-call token and time caps.
  - Every request and response is stored redacted for the receipt.
- **Structured output:** **zod 4.6.7 (MIT)** schemas are converted to JSON Schema. **Amended by
  ADR-0029 (2026-11-27):** the mode — forced tool call, native schema, or a strict JSON prompt with
  **one** repair attempt — is the one the model's **capability probe** passed, not the provider's or
  the SDK's claimed support. A call that ends with `finish=length` fails and is not repaired. Unknown
  fields are rejected. In `ai` 7, use `generateText` with `output: Output.object(...)`;
  `generateObject` is deprecated.
- **Tool use in v1:** none for T0+ PR review (the context is pre-planned). Tool calling exists in
  the gateway for v1.1 branch review.
- **Risk:** the `ai` SDK changes fast (major 7). Mitigation: the gateway exposes our own
  `complete({model, messages, schema, caps})` interface; `ai` is an implementation detail behind
  it, and its version is pinned.
- *WP 1-11 (2026-11-28):* the runner core is built: `runTurn` in `pipeline`, over the `TurnStore`
  port in `contracts`; the store implements the port, and `domain` holds canonical JSON (for step
  input hashes) and the retry policy. Each step is an `input` function plus a `run` function, and the
  runner persists the result. The behaviour is in [`job-pipeline.md`](job-pipeline.md), "The runner
  as built". The review steps arrive with M1.5.

### 3.5 HTTP server — **Fastify 5.12.8 (MIT)**

- Chosen over Hono 4.13.18 (MIT; excellent, but edge-first, with fewer Node-native plugins) and
  Express (slower, weaker schema story).
- Fastify gives JSON-schema validation per route (fed from zod), raw-body access for **webhook
  HMAC verification before parsing**, rate limiting, helmet/CSP, cookies, and an OpenAPI generator.
- Routes: `/api/webhooks/github` (raw body, HMAC, persist + enqueue in one txn, 202 in < 100 ms),
  `/api/auth/*`, `/api/*` (session-cookie auth, CSRF token), `/healthz`, `/readyz`, `/metrics`
  (bound to an internal port), and static UI files.

### 3.6 UI — **React 19 + Vite 8 + TanStack Router, served by `app`**

- React 19.3.1, Vite 8.3.8, @tanstack/react-router 1.170.46, plus TanStack Query (MIT). The output
  is a static SPA served by Fastify, so there is no Node SSR server and no separate container.
- Component layer: Radix primitives with Tailwind tokens (MIT), carrying the PoC's accessibility
  rules (44 px targets, focus, reduced motion).
- Rejected: Next.js (SSR server and its operational coupling are unnecessary for an admin SPA),
  SvelteKit (a second ecosystem for one maintainer).
- API types are shared from the `contracts` package (§4), so the UI and the API cannot drift.

### 3.7 GitHub integration — **Octokit (`@octokit/app` 16.1.4, MIT) behind a forge adapter**

- **Auth:** App JWT, then per-installation tokens cached until 5 min before expiry. The dashboard login
  uses the same App's OAuth.
- **REST** for checks, reviews, comments, reactions, and contents at a SHA. **GraphQL** only for
  review-thread state (`isResolved`, resolve/unresolve), which REST does not expose.
- **Writes:** all go through `publish.github` jobs (§3.3). The rate-limit and throttling plugins
  honour `Retry-After` and secondary limits; one review per turn; at most one mutation per second
  per installation.
- **Reads at a SHA:** the diff via `pulls.get` (diff media type) and file contents via
  `repos.getContent?ref=`. No git clone in v1, so the image needs no git binary. Clone and fetch
  arrive with branch review in v1.1.
- **Forge adapter contract:** `ForgeAdapter` interface plus a **contract test suite** that a
  recorded-fixture GitHub adapter passes. GitLab is a port against the same suite in v1.2.
- **Fixtures:** webhook and API payloads are recorded and redacted into `fixtures/github/`, which keeps CI offline.

### 3.8 Code parsing for T0+ — **`web-tree-sitter` 0.27.2 (MIT, WASM)**

- WASM, not native bindings, so it works on amd64 and arm64 with no compiler in the image.
- Grammars are shipped as prebuilt `.wasm` files for v1: **TS/JS/TSX, Python, Go, Java, C#, Rust, Ruby,
  PHP**. Each grammar's licence is recorded (most are MIT). Others use the ±20-line fallback
  (R-037).
- Queries are kept per language in `parsing/queries/<lang>.scm`, finding the enclosing
  `function | method | class`.
- Parsing runs in a worker thread pool, with a 2 s per-file timeout and a 1 MB file cap. On timeout
  the fallback is used and the coverage manifest says so.
- *Spike S-B (2026-11-28, [note](../analysis/spikes/2026-11-28-tree-sitter-distroless.md)):*
  - `web-tree-sitter` 0.27.2 runs in the distroless image on amd64 and arm64 (arm64 under QEMU),
    read-only and as `nonroot`.
  - The ten upstream grammar `.wasm` files total 15.9 MB, but the grammar npm packages are about
    227 MB, so only the `.wasm` files ship.
  - On amd64 a 1 MB file parses in 153–311 ms. Native arm64 timing is still to measure.
  - WASM memory is not returned, so the worker pool needs a bound and recycling.

### 3.9 Cryptography and secrets — **`node:crypto` only (no third-party crypto)**

- **Envelope encryption:** a 32-byte master key (KEK) from `JURY_MASTER_KEY_FILE` (Docker secret or
  file, mode 0400), never an environment variable in production. Each secret gets a DEK
  (AES-256-GCM), wrapped by the KEK. `key_id` supports rotation. `jury-forge rotate-key` rewraps
  the DEKs.
- **Receipt signing:** Ed25519 via `crypto.sign(null, …)`. The signing key is stored encrypted under
  the KEK and its public key is published at `/api/receipts/public-key`. The receipt is canonical JSON
  (RFC 8785 JCS), with `hash = sha256(JCS)` and `prev_hash` chained per installation.
  `@noble/ed25519` 3.2.0 (MIT) is used **only** in the standalone verifier CLI, so verification
  needs no Node crypto quirks.
- **Webhook HMAC:** `timingSafeEqual` on the raw body; deliveries older than 5 min are rejected.
- **Sessions:** opaque random IDs, stored hashed in Postgres; `HttpOnly; Secure; SameSite=Lax`;
  idle 8 h / absolute 7 d; re-auth for sensitive actions.
- **Backups** include the KEK only if the operator opts in to "include key"; otherwise the restore
  drill asks for the key file. Both paths are documented and tested.

### 3.10 Secret redaction — **in-process rules derived from gitleaks' MIT ruleset**

- A curated rule set (high-precision rules plus entropy checks) is compiled to JS regexes, with
  per-rule tests from gitleaks' examples. It runs before any egress.
- Matches are replaced with `«REDACTED:<rule>:<n>»`. Counts by rule go into the receipt. A
  secret found in **added** lines also becomes a `critical` Security finding, with the value
  never quoted.
- Rejected: shelling out to the gitleaks binary (an extra binary, process overhead, and its output would
  still need mapping).

### 3.11 Egress module — **one choke point**

- Every outbound request goes through a custom `undici` dispatcher. It checks the allowlist (GitHub
  base URL, configured provider origins), re-checks DNS after resolution, blocks
  private/loopback/link-local/metadata ranges, uses HTTPS only, re-validates every redirect, and
  enforces size and time caps. **Exception:** the `local` provider kind may reach the loopback or
  private host the owner entered, pinned and audited, never link-local or metadata (ADR-0030).
- Keys are bound to their provider origin: the gateway refuses to send a key to any other origin.
- Optional `HTTPS_PROXY`. Air-gapped installs are v1.1+.

### 3.12 Observability — **pino + Prometheus + optional OpenTelemetry**

- **pino 10.4.0 (MIT)** JSON logs, with redaction paths for tokens and keys; a request/turn/job ID
  appears on every line.
- **`/metrics`** in Prometheus format on an internal port: queue depth and age, turn latency, provider
  latency and errors, tokens and cost, budget stops, loop stops, verifier drop rate, coverage ratio,
  cache-hit ratio.
- **OpenTelemetry** (`@opentelemetry/sdk-node` 0.301.2, Apache-2.0) traces are **off by default** and
  turn on with `OTEL_EXPORTER_OTLP_ENDPOINT`. Nothing phones home (ADR-0001).
- `jury-forge doctor` checks DB, migrations, queue lag, GitHub App auth, provider reachability,
  clock skew, certificate expiry, disk, and KEK presence.

### 3.13 Packaging and install — ADR-0003 and ADR-0020 → **accept**

- **Image:** a multi-stage build onto a distroless Node 24 base (or `node:24-slim` if distroless blocks
  tree-sitter WASM; decided in the spike). It runs non-root with a read-only root filesystem, built
  for amd64 and arm64. The target is ≤ 250 MB.
  *WP 1-12 (2026-11-28), as built:*
  - **Bases:** the build stage is `node:24-trixie-slim`, and the runtime is
    `gcr.io/distroless/nodejs24-debian13:nonroot`, both pinned by multi-arch digest.
  - **Build:** `pnpm run build` emits `dist/` per runtime package. `pnpm deploy --prod` assembles
    the server with its production dependencies, and `scripts/apply-publish-config.ts` points each
    workspace package at its `dist` (pnpm 12's deploy keeps `files` but not
    `publishConfig.exports`).
  - **Running it:** the entrypoint is `node /app/dist/main.js`, and the command is the role
    (`migrate` today).
  - **Size,** measured as the unpacked root filesystem (`docker export`): 207.6 MB on amd64 and
    213.5 MB on arm64. Of that, 31.1 MB is `typescript`, a resolved optional peer of graphile-worker's
    `cosmiconfig`.
  - **CI** builds natively on both architectures, applies the size gate, and runs `migrate` as
    `nonroot` with a read-only root filesystem and all capabilities dropped.
- **Compose:** `caddy`, `migrate` (one-shot), `app`, `worker`, `postgres`, with healthchecks and
  `restart: unless-stopped`. Setup listens on `127.0.0.1:8080` only (ADR-0021).
  *WP 1-13 (2026-11-28), as built:* `deploy/compose.yaml`, with the differences from the
  illustrative shape in `deployment.md` §3 ("The bundle as built"):
  - three networks, the service-to-service one without egress;
  - secret files owned by the container user that reads them, because Compose ignores `uid`/`mode`
    for file secrets;
  - `app` probed by `main.js healthcheck`.

  `app` serves `/healthz` and `/readyz` with Fastify. `/readyz` covers the database, migrations at
  head, and the queue schema, and the master key joins with WP 1-15. `worker` runs the queue with
  its heartbeat and no tasks yet. `scripts/compose-smoke-test.sh` is the exit check, run by the CI
  `image` job on both architectures.
- **Caddy** (Apache-2.0) handles TLS with on-demand certificates, using the `ask` endpoint on `app`
  to approve the configured domain (this fixes install-readiness blocker B2).
- **Release bundle (ADR-0020):** a `.tar.gz` with `compose.yaml`, `Caddyfile`, `.env.example` and
  the `jury-forge` CLI, signed with **minisign** (ISC). Images are signed with **cosign keyless**
  (Apache-2.0) and ship with an SBOM (syft) and SLSA provenance. Releases follow SemVer, with a
  changelog. There is no `curl | sh`.
- **CLI `jury-forge`:** a Node single-executable application (SEA) or a bash wrapper around `docker
  compose`, decided in the spike. Commands: `install`, `setup domain`, `doctor`, `backup`, `restore`,
  `upgrade`, `rotate-key`, `receipt verify`, `export`.

### 3.14 Testing approach

| Layer | Tool | What it proves |
| ----- | ---- | -------------- |
| Unit | **vitest 5.1.0** (MIT) | Pure functions: fingerprints, anchoring, chair, risk score, budgets, redaction, fitting |
| Property | fast-check (MIT) | Fingerprint stability under whitespace/reorder; chair determinism; JCS canonicalisation |
| Integration | vitest + **testcontainers** Postgres | Queue serialization, debounce, idempotent steps, migrations up/down |
| Contract | Recorded GitHub fixtures | Forge adapter; webhook mapping; thread state |
| Stub model | A deterministic fake provider that scripts outputs per fixture | The full turn pipeline offline; eval harness v0 (~20 PRs) |
| Corpora | Injection, re-anchor, redaction, large-PR | Release gates (G1/G2) |
| Fault injection | Kill the worker mid-step; duplicate deliveries; publish-then-crash | Exactly-once effects |
| E2E (nightly, opt-in) | A real GitHub test org and a real provider key from CI secrets | A smoke test, never a gate for contributors |
| UI | Playwright (Apache-2.0) + axe | Key flows and accessibility |
| Licence | `pnpm licenses list` + `scripts/check-licences.ts` allowlist (`licence-policy.json`) | C1 |
| Import boundaries | dependency-cruiser (MIT) rules in `.dependency-cruiser.cjs` | The dependency rule in §4 |

The single check command is `pnpm check`: typecheck, lint (Biome, MIT), unit, integration,
contract, stub-model eval, licence, plus the size budgets.

## 4. Repository layout

```
/apps
  /server        Fastify app + worker entrypoints (same build, two commands)
  /web           React SPA
  /cli           jury-forge CLI (+ offline receipt verifier)
/packages
  /contracts     zod schemas, API types, finding/receipt schemas (no deps on others)
  /domain        pure logic: fingerprint, anchor, chair, risk, budget, policy, JCS   ← no I/O
  /pipeline      turn runner steps (orchestrates domain + ports)
  /gateway       provider gateway (ai SDK inside), catalog, egress, redaction
  /forge         ForgeAdapter + github implementation + contract tests
  /parsing       web-tree-sitter wrapper, grammars, queries
  /store         Kysely repositories, migrations (SQL), queue adapter
  /crypto        envelope encryption, signing, receipts
  /testkit       stub provider, fixtures loader, corpora
/deploy          compose.yaml, Caddyfile, .env.example, release scripts
/docs            (unchanged)
```

**Dependency rule, enforced by lint:** `domain` imports nothing internal except `contracts`.
`pipeline` depends on `domain` and **ports** (interfaces); `gateway`, `forge`, `store`, and `crypto`
implement those ports. Apps wire them together. The rules that decide outcomes are therefore pure
and testable without a database, network, or model ("code decides").
*Added 2026-11-28 (WP 1-10):* port interfaces live in `contracts`, the leaf that `pipeline` and the
implementing packages can both import; the first is `JobQueue`.

## 5. Key runtime flows

### 5.1 Webhook → turn

1. Caddy → `POST /api/webhooks/github`: verify HMAC on the raw body, reject if older than 5 min.
2. In one transaction: insert `webhook_deliveries` (unique `delivery_id`), map the event to an
   intent (ADR-0024 authz: sender association, bot or self, fork), and `add_job` if actionable.
   Return 202.
3. `session.turn` is debounced by `job_key`, and per-session order comes from `queue_name`.

### 5.2 Turn pipeline (worker)

`resolve` (snapshot config and versions, generation check) → `fetch` (diff, files at the head SHA,
base-SHA instructions and `.jury-forge.yml`, linked issue, SARIF) → `plan` (T0+ expansion, fitting,
coverage manifest, budget estimate, fail closed on budget) → `review*` (jurors in parallel, bounded by
the provider bucket) → `ground` → `verify` → `chair` → `summarise` → `publish` (enqueue
`publish.github`) → `evaluate` (scorecard counters) → receipt (sign and chain).

Each step stores `{input_hash, output, tokens, ms}`. On retry, finished steps are skipped. Replay
in v1.1 re-runs steps from the stored inputs.

### 5.3 Reply → appeal or answer

Comment event → authz → store a new `message_version` → debounced turn → `fast`-model intent
classification → for a dispute, an appeal (originating juror plus one other juror, then the verifier,
then code decides the outcome); for a question, an answer from the originating juror; anything else,
an acknowledgement or nothing.

### 5.4 Push → recheck

`synchronize` → advance the generation, cancel stale jobs → re-anchor open findings (code) →
`fix_candidate` findings get a recheck turn (one juror, the hunk only) → "Verified fixed" or "Still
present" → `auto` mode applies the guard (ADR-0024 §6).

## 6. Performance and footprint budgets

| Budget | Target | How it is checked |
| ------ | ------ | ----------------- |
| Idle RAM (app + worker + Postgres) | ≤ 1.2 GB | Compose stats in a CI soak test |
| Webhook ack | p99 < 300 ms | Load test |
| Queue pickup | p95 < 2 s | Integration timer |
| Non-model overhead per turn | ≤ 5 s p95 | Stub-model eval timing |
| Image size | ≤ 250 MB | CI gate |
| DB growth | ≤ 50 MB per 1,000 reviews (excluding raw I/O retained 30 d) | Seeded soak |

## 7. Security architecture mapping

| Threat (security.md) | Control in this stack |
| -------------------- | --------------------- |
| T-01 prompt injection | Trust-labelled, nonce-delimited prompt builder in `gateway`; strict zod output; no tools in T0+; injection corpus in CI |
| T-02 secret egress | Redaction before the gateway; egress preview; receipt counts |
| T-03 key to a bad URL | Origin-bound keys in the gateway; catalog-only models |
| T-04 SSRF | `undici` egress dispatcher (§3.11) |
| T-05 authz | Fastify preHandler role check per route; an authz test per mutating route (generated from the route table) |
| T-06 stale/duplicate publish | Generation check, `external_id` idempotency, and the installation write queue |
| T-07 supply chain | pnpm frozen lockfile, licence allowlist, cosign, SBOM, Dependabot/Renovate pinned |
| T-08 webhook forgery | Raw-body HMAC, delivery dedup, age limit |
| T-09 data at rest | Envelope encryption; KEK file; append-only audit |
| T-10 cost DoS | ADR-0024 budgets in `domain` checked before every model call |
| T-11 fork abuse | Skip by default; maintainer trigger only |

## 8. Phase 1b plan (walking skeleton = MVP), sequenced

Each milestone ends with a demo and its G1 checklist rows. The order is chosen to get to a real
review early, then harden it.

| # | Milestone | Contents | Exit evidence |
| - | --------- | -------- | ------------- |
| M1.0 | Repo and CI | pnpm workspace, layout (§4), Biome, vitest, testcontainers, licence check, `pnpm check`, ADRs accepted | A green CI on an empty skeleton |
| M1.1 | Data and queue | SQL migrations for the MVP tables, Kysely codegen, `JobQueue` (graphile-worker), the pg-boss adapter proof, serialization and debounce tests | Integration tests green |
| M1.2 | Install and setup | Image, Compose, Caddy on-demand TLS, loopback setup, bootstrap token, origin step, GitHub App manifest, OAuth claim | Clean-VM install log |
| M1.3 | Providers | Egress module, envelope encryption, provider add, `/models`, catalog, gateway `complete()` with structured output; the stub provider | A provider test, SSRF tests |
| M1.4 | Webhooks and safety core | HMAC ingest, event mapping, ADR-0024 authz/self/bot/fork, turn budgets, Check Run lifecycle | Fixture-driven contract tests |
| M1.5 | First review | Pipeline `fetch → plan (T0, fitting, coverage) → review (1 juror) → ground → chair (single) → publish`, base-SHA instructions, fingerprints | A real PR review on a test repo |
| M1.6 | Conversation | Replies, message versions, debounce, `suggest` resolution, feedback buttons, thread sync | Reply → second response demo |
| M1.7 | UI and timeline | Setup, providers, sessions list and detail (timeline, coverage), settings | Playwright + axe |
| M1.8 | Hardening for G1 | Eval harness v0 (20 PRs, stub), fault injection, clean-machine timing, docs | G1 checklist complete |

**Spikes inside Phase 1b (time-boxed, each with a written result):**
- S-A: graphile-worker serialization and debounce under concurrency, with the pg-boss swap (1 day).
- S-B: web-tree-sitter in distroless on arm64, with grammar size and parse time (1 day).
- S-C: `ai` SDK structured output across OpenAI-compatible, Anthropic, and Ollama, and the repair rate (1 day).
- S-D: GitHub review-thread GraphQL resolve/unresolve and the reaction listing limits (0.5 day).
- S-E: CLI packaging confirmation, bash wrapper (0.5 day).

## 9. What v1 adds on this foundation (no new infrastructure)

All the v1 capabilities (three jurors, verifier, T0+, appeals, verified-fixed, memory, receipts,
charges, suggestions, presets, risk score, egress preview, scorecard) are **modules over the same
four containers**. That is the main payoff of the choices above: v1 is feature work, not
re-architecture.

v1.1 adds: a git client in the image (branch review), an index worker queue, an optional analyzer
sandbox container (its own ADR), and replay. v1.2 adds: the OIDC library, the Helm chart, an
optional S3 adapter, and the GitLab adapter.

## 10. Risks specific to the stack

| ID | Risk | Mitigation |
| -- | ---- | ---------- |
| TR-1 | graphile-worker pre-1.0 API change | `JobQueue` port; pg-boss adapter proven in S-A |
| TR-2 | `ai` SDK churn | Gateway port; pinned version; contract tests per provider |
| TR-3 | TypeScript 7 toolchain edge cases | Pin; TS 5.x fallback job in CI until v1 |
| TR-4 | WASM grammars bloat the image | Ship 8 grammars; lazy-load; measure in S-B |
| TR-5 | Postgres as queue + artefacts on a small disk | Retention jobs; artefact size cap; `doctor` disk check; documented sizing |
| TR-6 | Single maintainer bus factor | Boring stack, one language, strict layering, ADRs, high test coverage of `domain` |

## 11. Decisions requested from the owner

| ID | Decision | Recommendation |
| -- | -------- | -------------- |
| T-01 | Runtime (ADR-0005) | TypeScript on Node 24 LTS, pnpm, TS 7 |
| T-02 | Datastore (ADR-0004) | Postgres 17 only; Kysely; SQL migrations via node-pg-migrate; no object store in v1 |
| T-03 | Queue (ADR-0006) | graphile-worker behind a `JobQueue` port; pg-boss fallback |
| T-04 | Agent runtime (ADR-0010) | **Change:** thin turn runner + `ai` SDK gateway; no LangGraph in v1 |
| T-05 | HTTP and UI | Fastify 5; React 19 + Vite 8 + TanStack Router SPA served by `app` |
| T-06 | GitHub | Octokit; REST + GraphQL for thread state; write queue; no git clone in v1 |
| T-07 | Parsing | web-tree-sitter WASM; 8 grammars |
| T-08 | Crypto | `node:crypto` envelope encryption + Ed25519; JCS receipts; KEK from a file |
| T-09 | Packaging (ADR-0003, ADR-0020) | One image, 4 containers + one-shot migrate; Caddy; minisign bundle; cosign images |
| T-10 | Observability | pino, Prometheus `/metrics`, OTel opt-in |
| T-11 | Testing | vitest, fast-check, testcontainers, stub model, corpora, Playwright |
| T-12 | Layout | pnpm monorepo per §4 with the enforced dependency rule |

On approval (given 2026-11-16), ADR-0003/0004/0005/0006/0010/0020 flipped to `accepted` (0010
amended to the thin runner), and [ADR-0026](../decisions/ADR-0026-v1-stack.md) records T-05 to T-12
as one "v1 stack" decision.

## 12. Open technical questions (resolved 2026-11-16)

- TQ-1: Distroless vs `node:24-slim` → **default distroless**; S-B may switch it to slim if WASM or arm64 fails. The result is recorded in ADR-0026.
  *Result (S-B, 2026-11-28):* distroless works on both architectures, so ADR-0026's default stands
  unchanged.
- TQ-2: CLI → **bash wrapper over `docker compose` for v1** (no build toolchain needed on the host);
  the offline receipt verifier ships as a small Node script in the bundle. Revisit a Node SEA in v1.1.
- TQ-3: KEK in backups → **no by default**; `backup --include-key` is opt-in; restore asks for the key file.
- TQ-4: Postgres → **17 bundled; 16 tested** for bring-your-own.
- TQ-5: Grammars → **the 8 listed**; add more on demand, each with its licence recorded.

## 13. Evidence (npm registry, 2026-11-16)

| Package | Version | Licence |
| ------- | ------- | ------- |
| typescript | 7.0.2 | Apache-2.0 |
| fastify | 5.12.8 | MIT |
| hono | 4.13.18 | MIT |
| graphile-worker | 0.18.0 | MIT (its tree includes `argparse` 2.0.1, Python-2.0; see the note below) |
| pg-boss | 12.38.2 | MIT (12.40.0 is the latest on 2026-11-28; re-check before any switch) |
| kysely | 0.29.9 | MIT |
| drizzle-orm | 0.45.4 | Apache-2.0 |
| node-pg-migrate | 9.0.0 | MIT |
| dbmate | 2.38.1 | MIT |
| @octokit/app | 16.1.4 | MIT |
| web-tree-sitter | 0.27.2 | MIT |
| @noble/ed25519 | 3.2.0 | MIT |
| react | 19.3.1 | MIT |
| vite | 8.3.8 | MIT |
| @tanstack/react-router | 1.170.46 | MIT |
| zod | 4.6.7 | MIT |
| vitest | 5.1.0 | MIT |
| @opentelemetry/sdk-node | 0.301.2 | Apache-2.0 |
| pino | 10.4.0 | MIT |
| ai | 7.0.173 | Apache-2.0 |
| @openai/agents | 0.22.0 | MIT |
| @mastra/core | 1.83.0 | Apache-2.0 (repo has `ee/` portions) |

**M1.0 tooling, verified live 2026-11-27 and pinned in `package.json`:**

| Package | Version | Licence | Note |
| ------- | ------- | ------- | ---- |
| typescript | 7.0.2 | Apache-2.0 | Workspace typecheck. The 5.x fallback (5.9.3) runs in a separate CI job. |
| @biomejs/biome | 2.6.9 | MIT OR Apache-2.0 | Lint and format, scoped to code and JSON so Markdown is not reformatted. |
| vitest, @vitest/coverage-v8 | 5.1.2 | MIT | Newer patch than the 5.1.0 recorded above. |
| fast-check | 4.11.0 | MIT | |
| testcontainers, @testcontainers/postgresql | 12.2.2 | MIT | Test image `postgres:17.12-alpine`. |
| pg | 8.23.1 | MIT | |
| dependency-cruiser | 18.9.0 | MIT | Gets its own TypeScript 5.9.3 through `packageExtensions`: it needs the compiler JS API, which TypeScript 7.0 lacks (supported: <7.0 or >=7.1). Without it, it cruises 0 modules and passes silently. |

**M1.1, verified live 2026-11-28 and pinned in `packages/store/package.json`:**

| Package | Version | Licence | Note |
| ------- | ------- | ------- | ---- |
| node-pg-migrate | 9.0.0 | MIT | The latest release (2026-07-17). Plain `.sql` files with `-- Up Migration` / `-- Down Migration` markers, one transaction per run, and an advisory lock that fails fast (WP 1-08). Its peer range `pg <9.0.0` covers `pg` 8.23.1. Runtime dependencies `glob`, `jiti`, `yargs` pass the licence check. |
| kysely | 0.29.9 | MIT | The latest release (2026-11-12), as planned above. No runtime dependencies. |
| kysely-codegen | 0.20.0 | MIT | Dev only (WP 1-09). Reaches `argparse` (Python-2.0) through `cosmiconfig` 9 → `js-yaml` 4; covered by the Q-051 exception. Its database drivers are optional peers; only `pg` is installed. |
| graphile-worker | 0.18.0 | MIT | The latest release, as planned above (WP 1-10). Its tree has `argparse` (Python-2.0), covered by the Q-051 exception; nothing else needed a new licence. |

**WP 1-12, verified live 2026-11-28:**

| Item | Version | Licence | Note |
| ---- | ------- | ------- | ---- |
| `node:24-trixie-slim` | index `sha256:4d00acb4…` | — | Build stage only; corepack installs the pinned pnpm. |
| `gcr.io/distroless/nodejs24-debian13:nonroot` | index `sha256:675c5324…` (Node v24.22.3) | — | The runtime base; amd64 and arm64. |
| web-tree-sitter | 0.27.2 | MIT | Spike S-B; not in the image yet (T0+ is v1). |
| tree-sitter grammar packages | typescript 0.23.2, javascript 0.25.0, python 0.25.0, go 0.25.0, java 0.23.5, c-sharp 0.24.0, rust 0.24.0, ruby 0.23.1, php 0.24.2 | MIT (each) | Spike S-B; only their `.wasm` files are to ship. |

**Licence exception for graphile-worker (Q-051, owner decision 2026-11-28):** graphile-worker 0.18.0
pulls in `argparse` 2.0.1 (Python-2.0) through `cosmiconfig` 8.3.6 → `js-yaml` 4.3.2, and only
js-yaml's command-line tool uses it ([spike S-A](../analysis/spikes/2026-11-28-queue-serialization-debounce.md)).
Python-2.0 is permissive and OSI-approved, but it is not on the allowlist. It gets a **named
exception** in `licence-policy.json` for `argparse` with `scope: all` and that reason, not a new
allowlist entry, so any other Python-2.0 package still fails. *Landed early, in WP 1-09:* kysely-codegen
(a dev dependency) reaches the same `argparse` through `cosmiconfig` 9. It was to land with WP 1-10, in
the pull request that adds graphile-worker.

**Changed from the plan:** `license-checker` (BSD-3-Clause, last published 2022) is not used.
The licence check is `pnpm licenses list --json` (built into pnpm) plus a small SPDX-expression
evaluator in `scripts/check-licences.ts`, with the policy in `licence-policy.json`. That adds no
dependency and checks the production set separately: a `dev`-scoped exception (today only
`lightningcss`, MPL-2.0, through Vite) is void if the package becomes reachable from production.

Not yet verified live: Caddy, minisign, cosign, syft, Playwright, Radix, Tailwind. Verify each in the
milestone that first uses it. (kysely-codegen was verified in WP 1-09, and the tree-sitter grammar
packages in WP 1-12.)

---

## 14. Configuration model

- **Three layers, in order of precedence:**
  1. **Environment and files:** bootstrap and infrastructure only.
  2. **Instance settings in Postgres:** set through the UI, versioned and audited.
  3. **Repo config `.jury-forge.yml`** read from the base SHA.
  A higher layer never overrides a security floor set by a lower one: caps, budgets, and fork policy
  can only be tightened per repo.
- **Environment variables (complete v1 list):** `DATABASE_URL` or `DATABASE_URL_FILE` (the file
  form is preferred: the URL carries the database password), `JURY_MASTER_KEY_FILE`, `PUBLIC_URL`
  (optional freeze, ADR-0021), `SETUP_BIND`, `TRUSTED_PROXIES`, `LOG_LEVEL`, `METRICS_BIND`,
  `OTEL_EXPORTER_OTLP_ENDPOINT` (optional), `HTTPS_PROXY` (optional), `ROLE` (`app`/`worker`).
  Everything else lives in the database.
  *Amended 2026-11-27 (MVP spec review):* `TRUSTED_PROXIES` and `DATABASE_URL_FILE` were added. Both
  are infrastructure: the app must know which peer (the bundled Caddy's pinned Compose subnet, or the
  operator's load balancer) may set forwarded headers before any setup state exists, or every
  pre-auth rate limit collapses into the proxy's single IP. The variables older docs name are
  retired: `ENCRYPTION_KEY[_FILE]` is `JURY_MASTER_KEY_FILE`; `SESSION_SECRET` is not needed
  (sessions are random IDs stored hashed, §3.9); `BOOTSTRAP_TOKEN` is always generated (§3.13,
  first-run-setup Stage 1); the provider egress allowlist is derived from configured provider
  origins (§3.11); `OBJECT_STORAGE_*` arrives with the v1.2 S3 adapter.
  *Amended 2026-11-28 (WP 1-13):* `ROLE` is not read. The image's command is the role (`migrate`,
  `app`, `worker`; §3.13), so one variable less can disagree with the command.
- Every config source is parsed by **one zod schema per layer** in `contracts`. Startup fails closed
  on an invalid environment; an invalid repo file produces a Check Run note and falls back to defaults.
- `.jury-forge.yml` v1 keys: `version`, `review.on`, `review.drafts`, `review.preset`,
  `review.paths.include|exclude`, `review.authors.exclude`, `charges[]`, `gate` (`neutral`/`critical`/`charges`),
  `review.max_inline_comments` (optional; can only lower the ADR-0033 safety ceiling), `resolution` (`suggest`/`auto`/`off`). Unknown keys produce a warning, not an
  error, which keeps the file forward compatible.
  *Amended 2026-11-28:* `noise.budget` was replaced by `review.max_inline_comments` (ADR-0033).
- **Per-turn hard caps (Q-031, owner decision 2026-11-28):** output ≤ 4,000 tokens per model call;
  input ≤ min(70 % of the bound model's context window, 100,000 tokens); ≤ 10 min wall-clock per
  turn (under the 20-min stuck-turn sweep, §3.3). They are instance settings that a repo can only
  tighten. A cap that is hit stops the step with a recorded reason; `finish=length` on structured
  output is a failure (ADR-0029). Revisit with benchmark v0.

## 15. API and error conventions

- **REST + JSON** under `/api/v1`, with the OpenAPI spec generated from the zod route schemas and
  published at `/api/v1/openapi.json`.
- **Errors:** RFC 9457 problem details with a stable `code` from a shared taxonomy
  (`auth.*`, `forge.*`, `provider.*`, `budget.*`, `policy.*`, `validation.*`, `internal`). The UI maps the
  `code` to human-readable text; machine codes are never shown to users (PoC lesson).
- **Pagination:** opaque cursors. **IDs:** UUIDv7, which sort by time and need no sequence
  contention. **Time:** UTC ISO-8601.
- **Mutations:** CSRF token plus `Idempotency-Key` on the create endpoints.

## 16. Prompt and reviewer asset management

- Built-in juror prompts, the verifier, the reply-intent classifier, and the summariser are
  **versioned files** in `packages/pipeline/prompts/` (Markdown with front matter: `id`, `version`,
  `role`, `schema`). Each one's hash is recorded in every receipt.
- Operator edits to built-in jurors create a **new reviewer version in the database**; the file is
  the factory default. "Reset to default" is a single action.
- The prompt builder assembles prompts in the fixed order system → instructions → packs → evidence
  → diff (cache-friendly, ADR-0025 §5). Untrusted blocks are wrapped with a per-turn nonce.
- Any change to a prompt file needs a passing stub-model eval and a changelog entry. CI blocks it otherwise.

## 17. MVP schema outline (first migrations)

`orgs`, `users`, `user_sessions`, `instance_settings`, `secrets` (wrapped DEKs and ciphertext),
`installations`, `repositories`, `webhook_deliveries`, `providers`, `provider_models`,
`model_probes`, `reviewers`, `reviewer_versions`, `reviewer_repo_bindings`, `pr_sessions`, `session_threads`, `session_messages`,
`message_versions`, `session_turns`, `turn_steps` (`turn_id`, `step`, `input_hash`, `output`, `tokens`,
`ms`, unique `(turn_id, step)`), `session_findings`, `finding_fingerprints`, `coverage_manifests`,
`resolutions`, `finding_feedback`, `budgets`, `usage_rollups`, `audit_events` (append-only trigger),
`artefacts` (`bytea`, size cap, `expires_at`). graphile-worker owns its own schema.
*Amended 2026-11-28 (architecture audit):* `reviewer_repo_bindings` and `model_probes` were added.
The MVP specs need a binding (`agentic-review-sessions` §6: the binding is the enablement), and
ADR-0029 needs a stored probe before a binding.

The v1 migrations add: `appeals`, `suppressions`, `repo_facts`, `review_receipts`, `jury_charges`,
`charge_results`, and the jury and verifier columns. Field-level detail lives in
[`data-model.md`](data-model.md).

## 18. CI/CD and release pipeline

| Stage | Trigger | Steps |
| ----- | ------- | ----- |
| PR check | Every PR | `pnpm install --frozen-lockfile` → typecheck → Biome → unit/property → integration (testcontainers) → contract → stub-model eval → corpora → licence → image build (no push) → image size gate |
| Main | Merge to `dev` | PR check + multi-arch image push to GHCR `:edge` + soak (30 min, footprint budgets) |
| Nightly | Schedule | E2E against a real GitHub test org + one real provider (opt-in secrets); N-1 upgrade + rollback drill; restore drill with receipt-chain verification |
| Release | Tag `vX.Y.Z` | Build → SBOM (syft) → cosign keyless sign → SLSA provenance → bundle (compose, Caddyfile, CLI, verifier) → minisign → GitHub Release with changelog |

- Branches follow AGENTS.md (`feat/`, `fix/`, `docs/`, `chore/`). Commits use the conventional format. Releases follow
  SemVer, and database migrations are forward-only across minor versions.
- Dependency updates run through Renovate in grouped weekly PRs. Each update must pass the licence check and the full check.

## 19. Developer environment

- Prerequisites: Node 24, pnpm, Docker. `pnpm dev` starts Postgres (Compose), the app with watch, the
  worker with watch, and Vite. A **GitHub webhook replay** command feeds recorded fixtures, so local
  development needs no tunnel or real App.
- `pnpm dev:stub` runs the whole pipeline against the stub provider: no keys and no cost.
- A seed script creates a demo org, three reviewers, and fixture PR sessions for UI work.

## 20. Definition of done per milestone (Phase 1b)

A milestone is done when:

1. Its rows in [`../delivery/quality-gates.md`](../delivery/quality-gates.md) G1 are ticked, with evidence.
2. `pnpm check` is green, and the new code in `domain` has ≥ 90 % branch coverage.
3. The docs affected by the change are updated in the same PR (AGENTS.md rule 10).
4. The security notes for new boundaries (routes, egress, secrets) are written.
5. [`../delivery/status.md`](../delivery/status.md) is updated, with the next action.
