# ADR-0036: TLS terminated in front of the instance — the readiness proof without Caddy issuance

- Status: accepted (owner, 2026-11-28; closes DEP-13)
- Date: 2026-11-28
- Owners: architecture + operations + security
- Amends: ADR-0021 (the "TLS is on-demand" bullet of the decision, and the clarification that TLS
  issuance gates `ready`), for instances whose TLS ends in front of them;
  [`../product/specs/first-run-setup.md`](../product/specs/first-run-setup.md) Stage 1.5 (MVP rows)
- Supersedes: —
- Revisit trigger: GitHub stops verifying webhook certificates by default, an install where the
  owner's browser and GitHub reach the origin by different paths, or a request to offer a wildcard or
  pre-loaded certificate mode (ADR-0021 follow-up).

## Context

ADR-0021 decides that Caddy serves the origin with on-demand TLS, and that **TLS issuance gates
`ready`**. `first-run-setup` Stage 1.5 step 4 implements it: after the origin is saved, the UI shows
`tls_pending` until Caddy issues.

Two supported deployments end TLS before Caddy:

- **Model C**, an operator's load balancer that holds the certificate (`deployment.md` §4 C).
- **The C1 outbound tunnel** (`deployment.md` §4 C1), which the owner's own test install uses: a
  Cloudflare Tunnel on a VPS with no inbound port.

In both, Caddy serves plain HTTP and never issues a certificate, so `ready` would wait forever. The
spec already asks for an explicit "I terminate TLS in front" confirmation when DNS points elsewhere
(Stage 1.5 step 2), but nothing then replaces the issuance check. This was recorded as DEP-13.

`ready` already requires a **webhook self-test**: a GitHub delivery to `POST {ORIGIN}/api/webhooks/github`
whose signature verifies (Stage 2, acceptance criterion 6). GitHub verifies the certificate of a
GitHub App's webhook URL unless the App's `insecure_ssl` setting is `1`; the default is `0`,
"verification is performed" (GitHub REST docs, "Webhooks" for Apps, read 2026-11-28).

## Options

1. **Keep issuance as the only proof.** Model C and the tunnel can never reach `ready`. Rejected.
2. **Trust the confirmation alone.** The operator ticks "I terminate TLS in front" and the TLS gate
   is skipped. A wrong proxy setup would then be found only by a failed review. Rejected.
3. **A self-request from the instance to `https://{ORIGIN}` with a per-setup nonce** (the DEP-13
   default as first recorded). It proves the public path, but it needs the host to reach its own
   public address (NAT hairpinning, which some networks block) and a new egress exception for the
   instance's own origin, which the egress rules otherwise refuse (ADR-0030, technical-approach
   §3.11). Rejected for those two costs.
4. **Use GitHub's verified delivery as the proof.** In front-TLS mode, the TLS gate is met by the
   webhook self-test that `ready` already requires, plus a check that the App's webhook still
   verifies certificates. GitHub then proves that the origin answers over a valid, publicly trusted
   certificate and reaches this instance (the signature proves the latter). **Chosen.** It keeps the
   intent of the recorded default (skip Caddy's issuance; prove that HTTPS reaches this instance)
   without hairpinning or a new egress path.

## Decision

Option 4.

1. **Two TLS modes for the origin**, recorded with it in `instance_settings`:
   - `caddy` (the default, unchanged): on-demand issuance by Caddy gates `ready` (ADR-0021).
   - `front`: TLS ends before the instance, at an operator load balancer or a tunnel edge.
2. **`front` is set only by the owner's explicit confirmation** in setup: the existing
   "I terminate TLS in front" confirmation of Stage 1.5. It is audited as `origin.tls_mode_set`. With
   `PUBLIC_URL` frozen, the origin field stays read-only, but the confirmation is still asked. A
   request header never sets the mode.
3. **In `front` mode:**
   - Caddy's issuance is not waited for, and the best-effort check that ports 80/443 are open on the
     host is skipped (a tunnel host opens none).
   - `/readyz` reports `tls_front_unverified` until the proof below passes, then `tls_front`.
   - **The proof:** the webhook self-test passes (Stage 2), and `GET /app/hook/config`, called with
     the App JWT, returns `insecure_ssl` equal to `0` (string or number) and a `url` on the stored
     origin. Until both hold, `ready` is false with the typed error `tls_front_unverified` and the
     repair list (proxy path, `Host` header, certificate, challenge pages on the webhook path).
4. **`doctor` reports the mode.** In `front` mode it also states that the TLS endpoint, not the
   instance, sees inbound traffic in plain text (the privacy note in `deployment.md` §4 C1), and it
   warns if `insecure_ssl` has been set to `1`.
5. **Changing the origin** re-asks the mode, and `ready` returns only after the proof for the new
   origin passes (as ADR-0021 already requires a new webhook self-test).

Everything else in ADR-0021 stands: the stored origin, `421` for other hosts, loopback-only
bootstrap, and no header ever defining the origin.

## Consequences

- The C1 tunnel and model C can reach `ready` without a certificate in Caddy, and without the
  instance calling its own public address.
- WP 1-14 (Caddy and origin) builds both modes and tests the `front` path with the setup state
  machine: `tls_front_unverified` until a verified delivery and `insecure_ssl` = `0`, then `tls_front`.
- `first-run-setup` Stage 1.5, its failure table, and its acceptance criteria gain the `front` rows
  (an amendment to the approved MVP rows, approved by the owner with this ADR).
- The proof depends on GitHub keeping certificate verification on. Setting `insecure_ssl` to `1`
  breaks the proof, so `ready` refuses it, and `doctor` flags it.
- One more instance setting and one more GitHub call at setup and in `doctor`.

## Security and operations

- **No weaker TLS:** the instance still never accepts plain HTTP from the internet in `front` mode;
  Caddy's plain-HTTP listener has no published host port (C1) or sits behind the operator's load
  balancer (C), and `TRUSTED_PROXIES` names only that peer.
- **Privacy:** in `front` mode a third party, the load balancer or tunnel provider, terminates TLS
  and can read inbound traffic. That is the operator's decision, shown in setup and `doctor`, and
  documented in `deployment.md` §4 C1. Outbound calls to GitHub and model providers do not pass
  through it.
- **No new egress:** the proof uses a GitHub delivery and the GitHub API, which the instance already
  reaches.
- The mode change is audited, owner-only, and part of the capped origin-change flow (3 per hour).

## Evidence

- ADR-0021 (decision: "TLS is on-demand"; clarification: "TLS issuance is post-save and gates
  `ready`").
- `first-run-setup` Stage 1.5 steps 2 and 4, Stage 2 (the webhook self-test), and acceptance
  criteria 6 and 16.
- `deployment.md` §4 C and C1; DEP-13 in `deployment.md` §11.
- GitHub REST docs, "REST API endpoints for webhooks" (Apps): `GET /app/hook/config` requires a JWT;
  `insecure_ssl` "0 (verification is performed)", "The default is 0." (read 2026-11-28).

## Follow-ups

- WP 1-14: both modes, the proof, and the `front` tests.
- WP 1-17: `doctor` reports the mode and the `insecure_ssl` value.
- The first real test is the owner's VPS install behind a Cloudflare Tunnel (M1.2).
