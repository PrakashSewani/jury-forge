# Personas and jobs

The product is for teams that review code seriously. These personas are the lens for scope and UX
decisions; they are not a market segmentation exercise.

## P1 — The platform engineer who owns the review bot

**Context:** runs the internal developer platform for a 20–200 person engineering organisation.
Owns CI, GitHub Apps, secrets, and the observability stack. Has been asked to "add AI review" and
refuses to send code to an unknown SaaS.

**Jobs to be done:**

- Install and upgrade the reviewer without a new vendor or a new on-call rotation.
- Connect the org's GitHub and its model gateway without sharing keys with a third party.
- Give each team a sensible default while letting them tune their own reviewers.
- See cost, latency, and failure rates; cap spend.
- Prove to security that code and credentials stay inside the perimeter.

**What wins:** one-command install, clear operations docs, Postgres/queue they already run,
OpenTelemetry, budgets, roles, audit export, no telemetry phone-home.

**What loses:** a Cloudflare-only deploy, a proprietary control plane, a black-box prompt, an
unbounded bill, a bot that spams PRs.

## P2 — The security lead

**Context:** owns AppSec, reviews the review bot before it touches private repos. Cares about
secrets, prompt injection, supply chain, and audit.

**Jobs to be done:**

- Approve a tool that cannot exfiltrate code or keys.
- Enforce a security reviewer and a minimum severity policy on sensitive repos.
- See what was sent to which provider, and redact secrets before they leave.
- Audit who changed the security reviewer's prompt and when.
- Export evidence for a compliance review.

**What wins:** trust-labelled prompts, redaction, egress allowlist, key-to-origin binding, RBAC,
immutable audit, signed releases, a security policy.

**What loses:** write-only keys that can be copied to an arbitrary URL, no prompt-injection
defense, no retention controls, "everyone is the owner".

## P3 — The staff engineer / tech lead

**Context:** reviews dozens of PRs a week, has strong opinions about architecture and tests, is
skeptical of AI noise.

**Jobs to be done:**

- Get a first pass that finds the real issue, not 40 style nits.
- Teach the reviewer the team's conventions (ADRs, patterns, test strategy).
- See the evidence for a finding and disagree with it.
- Suppress a known false positive once, not every time.
- Compare a reviewer's advice with the human reviewer's.

**What wins:** grounded findings with file/line evidence, suggested fixes, low false-positive rate,
suppression rules, reviewer versions, feedback, a diff view.

**What loses:** hallucinated findings, duplicate comments from five reviewers, a bot that blocks a
merge on a nit, prompt changes with no diff or rollback.

## P4 — The solo developer / small team

**Context:** one to five people, a VPS or a homelab, a personal GitHub account, a favorite model
provider or a local model. Wants a second pair of eyes without a subscription.

**Jobs to be done:**

- Install in an evening, not a weekend.
- Use a local model or a cheap API key.
- Get a useful review on a side project without configuring a policy engine.
- Not babysit a queue or a database.

**What wins:** a single container or Compose file, a guided setup, a sensible default jury, a
local model path, a clear "this costs about X" estimate.

**What loses:** a Kubernetes prerequisite, a required cloud account, a complex role model, a
metered SaaS.

## P5 — The AI platform / developer-experience team

**Context:** standardises AI tooling across many teams and repos; wants a vendor-neutral review
layer that can route to different models and gateways.

**Jobs to be done:**

- Point reviewers at different providers/gateways with per-team keys.
- Define org-wide reviewer templates and knowledge packs.
- Measure quality and cost per team.
- Integrate with CI, security dashboards, and internal portals.

**What wins:** provider registry, org-level policy, API tokens, webhooks, SARIF, metrics, export,
multi-installation support (later).

**What loses:** a hard-coded model vendor, one installation per org, no API, no export.

## P6 — The auditor / compliance reviewer

**Context:** needs to answer "what did the bot say, based on what, and who changed the rules?"

**Jobs to be done:**

- Reconstruct a review: prompt version, model, context, pack versions, findings, publish decision.
- Export audit events and retention evidence.
- Prove data residency and deletion.

**What wins:** run snapshots, prompt hashes, pinned packs, immutable audit, export, retention
policy.

**What loses:** mutable reviewers with no history, latest-always packs, a 90-day best-effort log.

## Anti-personas

- **The team that wants a fully autonomous merge bot.** We are not that. Suggestions are proposals;
  human judgment stays in the loop.
- **The buyer who wants the cheapest possible per-PR API.** BYOK and self-hosting are the value;
  we are not optimising for the lowest metered price.
- **The enterprise that requires a vendor-hosted control plane.** That contradicts the product's
  privacy thesis. A supported self-hosted deployment is the answer, not a central service.

## Jobs-to-be-done, prioritised

1. **When a PR changes, I want a trustworthy first review that finds real issues, so I can spend
   my review time on judgment, not triage.**
2. **When I install the product, I want my first review in under an hour, so I can evaluate it
   without a project.**
3. **When a finding looks wrong, I want to see the evidence and correct it, so I can trust the
   system.**
4. **When my team has conventions, I want the reviewer to know them, so the advice fits our code.**
5. **When the bot costs money, I want to see and cap the spend, so there are no surprises.**
6. **When something breaks, I want to diagnose and recover it myself, so I am not dependent on a
   vendor.**
7. **When security asks, I want to prove what left the perimeter and who changed what, so I can
   get approval.**

Everything on the roadmap should trace to one of these jobs.
