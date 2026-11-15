# Security policy

Jury Forge holds source code, model credentials, and the operator's trust. We take security reports
seriously.

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting on this repository:

1. Go to the **Security** tab.
2. Choose **Report a vulnerability**.
3. Include: affected version/commit, a description, reproduction steps, impact, and any suggested
   fix.

If private reporting is unavailable, contact the maintainer through the repository's listed contact
method and ask for a private channel. Do not include exploit details in a public message.

## What to report

- Authentication or authorization bypass.
- Tenant isolation failure.
- Credential or secret exposure (at rest, in logs, or to a provider).
- Prompt injection that changes a published verdict.
- SSRF or egress-policy bypass.
- Remote code execution, dependency compromise, or container escape.
- Idempotency failure that publishes a duplicate or stale review.
- Data retention/deletion failure.
- Any S1 in [`docs/analysis/flaws.md`](docs/analysis/flaws.md) that recurs.

## Our process

1. Acknowledge the report within a reasonable time (best effort; this is a small project).
2. Reproduce and assign a severity.
3. Develop a fix in a private branch.
4. Release a patched version with an advisory.
5. Credit the reporter unless they prefer otherwise.

## Scope

This policy covers the Jury Forge code and its official container images. It does not cover:

- The PoC repository (`PrakashSewani/jury-forge-poc`), which is reference material.
- Third-party providers, forges, or infrastructure the operator runs.
- Misconfiguration of an operator's deployment (we still welcome a report so we can improve the
  docs and defaults).

## Supported versions

No supported release exists yet. Once v1 ships, this section will list the supported minor versions
and the security-fix window.

## Secure development

- Threat model: [`docs/architecture/security.md`](docs/architecture/security.md).
- Quality gates: [`docs/delivery/quality-gates.md`](docs/delivery/quality-gates.md).
- Flaw register: [`docs/analysis/flaws.md`](docs/analysis/flaws.md).

## Safe harbour

We will not pursue legal action against a researcher who:

- acts in good faith,
- avoids privacy violations, data destruction, and service disruption,
- reports privately and gives us a reasonable time to fix,
- does not exploit the issue beyond what is needed to demonstrate it.

Thank you for helping make self-hosted code review safer.
