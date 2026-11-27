# ADR-0030: Egress rule for local model servers

- Status: accepted (owner, 2026-11-27 — default #5 of the MVP spec review, accepted as "fix with
  defaults"; the safeguards below were drafted in that pass and are open to owner amendment)
- Date: 2026-11-27
- Owners: security + platform
- Amends: ADR-0011 (§ Security and operations: "model endpoint calls enforce HTTPS, block
  private/loopback/link-local/metadata ranges"), `architecture/technical-approach.md` §3.11 (egress
  module), and `architecture/security.md` (egress allowlist)
- Supersedes: —
- Revisit trigger: an SSRF finding against the egress module, a provider-side TLS option for local
  servers that makes plain HTTP unnecessary, or a request to reach a private host for anything other
  than a model call.

## Context

Non-negotiable 7 (`AGENTS.md`) requires local model servers behind the same provider boundary as
hosted APIs. `provider-model-discovery.md` and `first-run-setup.md` Stage 4 both offer a `local`
provider kind (Ollama, vLLM, LM Studio) for sensitive repositories.

ADR-0011 and technical-approach §3.11 apply one egress rule to every model call: HTTPS only, and
block private, loopback, link-local, and metadata ranges after DNS resolution. A local model server is
almost always plain HTTP on loopback, the Docker host gateway, or a LAN address. Applied literally,
the accepted rule makes the `local` kind impossible, so the accepted documents contradict a
non-negotiable. The MVP spec review (2026-11-27) found the contradiction; the owner accepted the
default resolution.

The SSRF threat these rules address is an **attacker-controlled URL** reaching internal services.
A provider base URL is not attacker-controlled: only the owner can add a provider (v1 roles,
ADR-0028), it requires re-authentication, and it is audited. The residual risks are a compromised
owner session pointing the instance at an internal service, DNS rebinding, and code sent in clear text
across a LAN.

## Options

1. **Keep the rule; no local servers.** Breaks non-negotiable 7 and the sensitive-repo story.
2. **Allow plain HTTP and private addresses for any provider.** Removes the SSRF guard for hosted
   providers too. Rejected.
3. **A narrow exception for the `local` kind only, pinned to the exact host the owner entered.**
   Chosen.

## Decision

The egress module keeps the ADR-0011 rule for every provider kind **except `local`**. For a `local`
provider:

1. **Who:** only the owner can add or change it, with re-authentication; the action is audited with
   the URL and the resolved addresses.
2. **Where:** the destination may be a loopback, private (RFC 1918 / RFC 4193), or Docker-host-gateway
   address. **Link-local and cloud metadata ranges stay blocked** (`169.254.0.0/16`, `fe80::/10`,
   `fd00:ec2::254`, and the other metadata addresses in `security.md`), with no override.
3. **Exactly that host:** the allowlist entry is the scheme, host, and port the owner entered. The
   host is resolved when the provider is saved; the addresses are pinned, and a later resolution to
   a different address is refused (DNS-rebinding guard). Redirects are never followed.
4. **Not the instance itself:** the instance's own listeners (`SETUP_BIND`, `METRICS_BIND`, the app
   port) and the database host are refused as provider destinations.
5. **Plain HTTP only on non-public addresses:** `http://` is accepted only when every pinned address
   is loopback or private. A public address still requires HTTPS. The UI warns that plain HTTP sends
   code and prompts unencrypted across the network, and recommends TLS or a loopback-only server.
6. **Same boundary otherwise:** size and time caps, error mapping, key-to-origin binding (if the
   local server takes a key), redaction, the capability probe (ADR-0029), and audit all apply
   unchanged.

## Consequences

- The `local` kind works in Compose (through the Docker host gateway or a LAN address) and in a native
  install (loopback), which non-negotiable 7 requires.
- The SSRF guard for hosted providers, knowledge links, and every other fetch is unchanged.
- The egress module gains a per-provider exception path that needs its own tests.
- An owner can deliberately point the instance at a private host. That is the intended capability;
  the audit trail and the "not the instance itself" rule bound it.

## Security and operations

- Tests: a `local` provider on loopback and on a private address passes; link-local, metadata, the
  instance's own ports, the database host, a redirect, a DNS answer that changes after pinning, and
  plain HTTP to a public address are all refused; a non-`local` provider to a private address is
  refused as before.
- `security.md` and technical-approach §3.11 point here for the exception.
- `jury-forge doctor` reports each `local` provider, its pinned addresses, and whether it uses plain
  HTTP.

## Evidence

- `AGENTS.md` non-negotiable 7.
- ADR-0011, § Security and operations; technical-approach §3.11.
- `product/specs/provider-model-discovery.md` (the `local` kind) and `first-run-setup.md` Stage 4.
- MVP spec review, 2026-11-27 (`delivery/status.md`).

## Follow-ups

- WP 1-18 (egress module, M1.3) implements and tests the exception.
