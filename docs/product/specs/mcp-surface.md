# Spec: MCP surface (B-07)

- Status: draft — reviewer-side MCP client **promoted to v1.1** (deep dive 4.6, WP 11-08); the read-only findings server stays backlog. Owner approval of this spec is pending.
- Owner: product + security + architecture
- Date: 2026-11-15
- Principles: 3, 4, 7, 8, 10
- Related ADRs: ADR-0008, ADR-0010 (harness), ADR-0018 (hard caps), ADR-0011
- Gate: not before the security gate (G2) is signed off.
- Source: proposed by the architect; owner asked for it to be recorded and specified (2026-11-15).

## Problem

AI platform teams want review findings available to the coding agents and IDEs that authors already
use, and want reviewers to consult internal systems (docs search, ticket lookup). The Model Context
Protocol is the common way to do both. It also widens the attack surface: outbound tool servers are
untrusted, and findings exposed to other agents carry quoted PR content that can contain injected
instructions.

## Users and jobs

- **P5 AI platform / DX team:** "Let our IDE agent read the review findings for my PR."
- **P3 Staff engineer:** "Let the security reviewer look up our internal threat-model wiki."
- **P2 Security lead:** "Make every tool a reviewer can call explicit, bounded, and audited."

## Behaviour

Two independent sub-capabilities. Either can be adopted alone.

**A. MCP server (outbound to clients) — read-only**

1. The instance can expose an authenticated, read-only MCP endpoint offering: list findings for a PR,
   get a finding with evidence and status, get a thread's state, get the review summary and
   coverage manifest.
2. Authentication uses scoped, revocable tokens bound to a user; authorization follows existing
   session visibility (repo readers only; shadow data excluded for non-maintainers, B-01).
3. There are **no write tools**: clients cannot reply, resolve, trigger, or edit. Replying and
   resolving stay with the review agent and forge users.
4. Every response labels quoted code and comment text as **untrusted content** and the endpoint's
   documentation warns client agents to treat it as data.

**B. MCP client (reviewer tools) — operator-allowlisted**

1. An admin registers a **tool server** by remote HTTP origin only, with a credential stored like a
   provider key (write-only, encrypted, origin-bound). Locally launched/stdio servers are not
   supported (they imply arbitrary code execution).
2. Each tool a server exposes is imported into a **tool catalog** entry; an admin/SME approves which
   tools a given reviewer may use (same approval path as reviewer capabilities, ADR-0016).
3. Calls pass through the same **tool policy** as built-in tools: per-turn call/byte/time caps,
   argument validation, SSRF and egress checks, provider-allowlist implications (B-02), and full
   audit (server, tool, arguments hash, result size).
4. Tool results are **untrusted data**, trust-labelled and delimited, and can never change policy,
   resolve threads, or trigger other tools outside the reviewer's grant.
5. A server that is slow, errors, or returns oversized output is cut off; the turn continues without
   it and the manifest records the gap.

Edge cases:

- Server changes its tool list or schemas: new/changed tools are **unapproved** until reviewed.
- Server returns content that looks like instructions: it is data; flagged in audit if detection
  triggers, never followed.
- Credential rotation/revocation: immediate; reviewers with that tool become `tool_unavailable`.

## Non-goals

- No write or action tools for outside clients.
- No stdio/local-process servers, no running third-party code in the instance.
- No server registry or marketplace.
- No sending secrets or provider keys through any tool.

## Acceptance criteria

- [ ] Given a valid token for repo X, when the client lists findings for a PR in repo Y, then it is
      denied and audited.
- [ ] Given the server endpoint, then no tool can reply, resolve, trigger, or modify any state
      (verified by enumerating the tool list in a test).
- [ ] Given an unapproved tool on a registered server, when a reviewer tries to call it, then the call
      is refused with a visible reason.
- [ ] Given a tool call exceeding caps or returning oversize output, then it is cut off, the turn
      continues, and the manifest records the gap.
- [ ] Given a tool result containing injection text, then no policy, grant, or tool change occurs
      (injection test).
- [ ] Origin-bound credentials are never sent to a different origin; redirects are refused.

## Metrics

Tools in use per reviewer, denied/oversize calls, client tokens active, findings fetched per client,
incidents (target zero).

## Security and privacy

- Every tool server is an untrusted external system; calls follow the SSRF and egress rules in
  `security.md` and the provider-allowlist policy where content leaves the instance.
- The client-facing endpoint widens the attack surface; it ships behind its own feature flag, off by
  default, with rate limits and token scoping.
- Exposing findings to a client agent sends repo-derived text to whatever model that agent uses; the
  operator's tokens and docs must state that this is outside the instance's egress control.
- The MCP protocol version and transport must be verified live from the protocol's published
  specification at spec-approval time (evidence rule); this spec does not fix a version.

## Failure modes

Server outage → tool unavailable, turn continues; token abuse → rate limit and revocation; protocol
change → capability disabled until adapted, no silent fallback.

## Rollout

Backlog; later tier if promoted, after G2. Server and client sub-capabilities are separate flags.
Requires a future bounded tool policy for tool-enabled modes and the approval flow from ADR-0016.

## Open questions

- MCP-01: which MCP spec version and transport do we target? Default: verify the current published
  spec and support remote HTTP transport only; close at spec approval.
- MCP-02: may a reviewer's MCP tool send repo content to the tool server? Default: only
  operator-approved arguments from a declared schema, never raw diff text, in the first cut.
