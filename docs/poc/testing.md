# PoC testing

Studied at `1cc22b7`. The PoC had a genuinely good test posture for a one-month project. This page
records what it tested, what it did not, and what we should do differently.

## Test architecture

Two Vitest projects inside the Workers runtime/ecosystem:

| Project    | Config                          | Environment                | Glob                              | Purpose |
| ---------- | ------------------------------- | -------------------------- | --------------------------------- | ------- |
| Worker     | `product/vitest.config.ts`      | Workers (workerd)          | `product/test/**/*.test.ts`       | Routes, Durable Object, crypto, context, consolidation, providers, webhooks, contracts |
| UI         | `product/vitest.ui.config.ts`   | happy-dom + Testing Library | `product/test-ui/**/*.test.{ts,tsx}` | Primitives, shell, screens, router, polling, forms, theme, zip reader |

Commands: `npm run test` runs `test:worker` then `test:ui`. `npm run check` runs typecheck, lint,
format check, tests, and builds.

Outbound HTTP is mocked with MSW (`msw` + `@msw/cloudflare`) through a shared setup and per-test
handlers. No test performs real network calls.

## Scale at the final commit

- **Worker:** 386 tests in 27 files.
- **UI:** 197 tests in 18 files.
- Typecheck: three `tsc` programs in `product/` plus `tsc` in `shared/` and `astro check` in
  `site/`.
- Builds: Worker + dashboard, and the Astro site.
- Layout/accessibility harness: `scripts/measure-layout.mjs`, 10 routes × 7 widths × 2 themes =
  140 measured cells, asserting zero horizontal overflow, tap-target failures, contrast failures,
  or focus failures, plus a mobile-nav check.

## What was tested well

- **Crypto:** round-trip, key-ring formats, rotation detection, legacy decryption.
- **Sessions and access gate:** middleware, session lifecycle, access checks.
- **Context builder:** budgets, skip rules, truncation notes, priority order.
- **Consolidation:** caps, inline selection, multi-line `startLine`, resolution buckets, scope
  demotion.
- **Settings:** validation, defaults, bounds, blocking-event selection.
- **Repository instructions:** excerpt formatting and budget.
- **Knowledge packs:** frontmatter, root selection, path safety, caps, hashing, manifest rendering,
  budget/drop algorithm.
- **Providers:** both flavors against mocked `fetch`, timeouts, malformed output, usage envelopes.
- **Webhooks:** signature verification and de-duplication.
- **Setup state machine:** mocked GitHub endpoints.
- **Run engine:** phases, retries, run records, manual mode, scope, knowledge provenance, using
  the Workers Vitest plugin with stubbed `fetch`.
- **Contracts:** one valid and one drifted payload per schema; dashboard response parsing.
- **UI:** primitives, forms, shell, routing, polling, theme, zip reader, screens, error taxonomy.
- **Accessibility:** a real-browser layout harness with measured assertions.

The project also practised mutation-checking several fixes: revert the fix, confirm the named test
fails.

## What was not tested

1. **A real GitHub installation, end to end.** The status file says the live instance had no
   reviewer and no first review when written. The setup flow and review post were exercised
   against mocks and a seeded local state, not a real repository.
2. **Real provider APIs.** Both adapters were tested against mocked `fetch`. No conformance run
   against OpenAI, Anthropic, a gateway, or a local model. No test for provider-specific quirks,
   streaming, tool calls, or structured-output modes.
3. **Load, concurrency, and rate limits.** No test for many simultaneous webhooks, provider 429s,
   GitHub secondary rate limits, or queue backpressure.
4. **Failure injection at the infrastructure boundary.** No test for a lost alarm, a D1 timeout
   after a successful post, a Durable Object eviction, a partial `finishRun`, a `start()` that
   persists the payload and then fails before scheduling the alarm, or a partial pack insert.
5. **Security testing.** No prompt-injection suite, no SSRF tests, no authz matrix, no secret
   scanning in prompts, no dependency review, and no fuzzing of the zip/pack parser for
   decompression bombs or request-size abuse.
6. **Upgrade and migration testing.** No test that applies migrations to a populated database and
   verifies the old rows still render.
7. **Restore/backup.** No backup/restore drill.
8. **Cross-browser UI.** happy-dom and one Chromium-based harness; no Firefox/Safari run.
9. **Localisation and RTL.** None.
10. **Cost and latency.** Token usage is captured, but no test asserts a budget, and no benchmark
    measures time-to-first-finding or cost per review.

## Test-design lessons

- **Mocks prove wiring, not behaviour.** The suite is excellent at proving that the pieces talk to
  each other and that the pure functions are correct. It cannot prove that a real GitHub review
  posts, that a real model returns usable JSON, or that a real operator can finish setup.
- **A second runtime is a second test environment to maintain.** The workerd/UI split is sensible
  for the Cloudflare target, but it adds configuration and a Node-version storage bug. A
  container-first product should have one primary test runtime plus a browser suite.
- **The accessibility harness is a differentiator.** Keep the idea: measured, asserted, repeatable
  UI quality, not screenshots.
- **Mutation checks are cheap and valuable.** Keep them for every bug fix.
- **Seed data is part of the test surface.** `npm run dev:seed` made local demos and UI tests
  realistic; keep a deterministic seed and a reset command.

## What our test strategy should add

1. **Contract tests with recorded provider fixtures** plus an optional live conformance suite.
2. **End-to-end tests** against a disposable GitHub test organisation and a local OpenAI-compatible
   stub server.
3. **Fault-injection tests** for the job pipeline: duplicate delivery, worker crash mid-step,
   publish succeeded but recording failed, cancelled run, expired lease, start-before-alarm
   failure, partial pack insert, and a pack upload that exceeds the body cap before parsing.
4. **Prompt-injection and exfiltration tests** as a first-class suite.
5. **Load and soak tests** for webhook bursts, concurrent runs, and provider rate limits.
6. **Migration tests** from the previous release's schema with representative data.
7. **Restore drill** in CI or a scheduled environment.
8. **Browser matrix** (Chromium, Firefox, WebKit) for the critical paths.
9. **Cost/latency budgets** asserted in CI with a deterministic stub model.
10. **A quality benchmark** (golden PRs with known issues) to measure precision/recall, not just
    green tests.
