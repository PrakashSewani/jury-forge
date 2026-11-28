# ADR-0038: On-demand certificate issuance is rate-limited by the app alone

- Status: proposed (2026-11-28; implemented in WP 1-14 before acceptance, see Consequences)
- Date: 2026-11-28
- Owners: architecture + operations + security
- Amends: ADR-0021 (the "TLS is on-demand" bullet: "issuance is rate-limited (Caddy interval/burst
  plus an app-side limit)"); [`../architecture/deployment.md`](../architecture/deployment.md) §2 and
  the reference `Caddyfile` in §3 (`interval 2m burst 5`)
- Supersedes: —
- Revisit trigger: Caddy brings back a rate limit for on-demand issuance; more than one `app`
  replica answers the `ask` endpoint; or a CA's rate limit is hit in practice.

## Context

ADR-0021 decides that on-demand issuance is rate-limited twice: by Caddy's `on_demand_tls`
`interval` and `burst` options, and by a limit in the app's `ask` endpoint. The reference
`Caddyfile` in `deployment.md` sets `interval 2m` and `burst 5`.

Caddy 2.11.9, the version the bundle pins, refuses that configuration. `caddy validate` on a
Caddyfile with `interval 2m` inside `on_demand_tls` fails with "the on_demand_tls 'interval' option
is no longer supported, remove it from your config" (run 2026-11-28, WP 1-14). With the option
in the file, Caddy does not start.

The `ask` endpoint already approves only the configured origin, only in the `caddy` TLS mode
(ADR-0036). The limit guards against a loop that obtains the same certificate again and again,
which could exhaust the CA's per-domain rate limit and lock the instance out of TLS.

## Options

1. **Pin an older Caddy that still has `interval` and `burst`.** Keeps the documented
   configuration, but holds back security fixes in the component that terminates TLS. Rejected.
2. **Drop the rate limit.** The `ask` endpoint still refuses every other name, so the limit only
   matters for repeated issuance of the one name. Rejected: a CA lockout is an outage, and the
   limit costs little.
3. **Keep the limit in the app only, with the numbers ADR-0021 named.** Chosen.

## Decision

Option 3.

- The `ask` endpoint (`GET /api/internal/tls/allow`) counts its approvals in a token bucket: at most
  5 per 2 minutes, refilled continuously. These are the `burst 5` and `interval 2m` of ADR-0021.
- Refusals, for another name, `front` mode, or no origin, do not spend the budget. When the budget
  is spent, the endpoint answers `429` and Caddy obtains nothing.
- The shipped `Caddyfile` sets only `ask` in `on_demand_tls`.

Everything else in ADR-0021 stands.

## Consequences

- The bundle runs on a current Caddy, and Renovate can keep it current.
- The limit lives in the `app` process. With one `app` replica, which is v1's only Compose
  topology, it is exact. Several replicas would each have their own budget; that is the revisit
  trigger above.
- A restart of `app` resets the budget. Caddy keeps an issued certificate in `caddy-data` and does
  not ask again for it, so a restart loop does not turn into an issuance loop.
- **Implemented before acceptance:** WP 1-14 ships this limit (`packages/domain/src/token-bucket.ts`,
  `apps/server/src/origin-service.ts`). If the owner rejects this ADR, the alternative is option 1,
  which changes only the Caddy pin and the `Caddyfile`.

## Security and operations

- The guard is unchanged in intent: Caddy cannot be made into an ACME proxy (only the configured
  origin is approved), and repeated issuance of that origin is capped.
- Each `ask` decision is logged with the name and the decision. `doctor` (WP 1-17) can count the
  refusals.
- No new configuration: the numbers are constants, and the endpoint is internal (Caddy blocks
  `/api/internal/*` on its public listener, and the app refuses proxied requests to it).

## Evidence

- `caddy validate` with `caddy:2.11.9-alpine` on 2026-11-28: the `interval` option is refused
  (status entry for WP 1-14).
- ADR-0021, decision, "TLS is on-demand".
- `apps/server/src/origin-service.int.test.ts`: 5 approvals, then `rate_limited`, then one more
  after 24 s. `packages/domain/src/token-bucket.test.ts`: a property test of the bound.
