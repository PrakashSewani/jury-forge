# ADR-0023: Product direction — the auditable review layer, not a review platform

- Status: accepted (G0, 2026-11-16; v1 scope amended by ADR-0025; the instruction-file set in item 5 and Q-032 amended by ADR-0027; v1 resolution rights by ADR-0028)
- Date: 2026-11-15
- Owners: product + architecture
- Re-scopes: the v1 application of ADR-0016/ADR-0018 (it does not supersede their decisions; it
  narrows what ships first)
- Revisit trigger: the Phase 3 replay benchmark, the first 10 installs, or a security/platform buyer who
  requires a deferred capability before adopting.
- Terminology: **v1.x** means any post-v1 release. *Amended 2026-11-16:* **v1.1 = depth** (branch
  review, graph, analyzers, GHES, CLI, replay) and **v1.2 = platform** (catalog, capability labels,
  roles, packs, OIDC, Helm, GitLab). See `product/capabilities.md` release tiers.

## Context

The capability set has grown into a platform: reviewer catalog, capability registry and labels, SME
roles, knowledge packs, repository graph, branch review, Helm, seven roles, and a full control-plane
UI. Each capability is defensible on its own. Together they do not describe a first release a small
team can ship, support, and prove.

Three facts decide the direction:

1. **The wedge is trust, not configurability.** The buyer is the security or platform lead who will
   not send private code to a hosted reviewer. The user is the staff engineer who is skeptical of AI
   noise. The product wins if it gives them a review they can defend — to security, to the author, and
   to an auditor — not if it offers the most knobs.
2. **The quality proof arrives last.** Strict T0 PR review is the default, while the context that
   would catch cross-file defects is branch review, scheduled for v1.x and benchmark-gated. The
   platform is built before the product has evidence that its review is better than one strong model.
3. **The delivery capacity is one maintainer plus an agent chain.** A platform-shaped v1 cannot be
   shipped, supported, and documented by that capacity. R-001 and R-025 name the risk; the tier table
   still reads as a platform.

## Options

1. **Keep the platform direction.** Honest to the accumulated capability list; high delivery risk;
   the quality thesis stays unproven; a single maintainer cannot support it.
2. **Narrow to the trust loop.** A self-hosted review appliance with a default jury, an
   evidence-backed verdict, a durable conversation, and an auditable receipt. Platform features
   become v1.x. **Chosen.**
3. **Go hosted-first.** Would fund the platform, but contradicts ADR-0001/ADR-0009 and the privacy
   thesis.
4. **Go multi-forge platform.** Breadth instead of depth; loses the wedge and multiplies adapters.
5. **Go quality-lab only.** A benchmark and prompt library with no product surface; interesting, not
   a product.

## Decision

### Positioning

**Jury Forge is the auditable AI review layer for code that cannot leave your perimeter.** It runs on
the operator's infrastructure, uses the operator's model keys, gives a PR a review decision with
evidence and visible dissent, and produces a receipt the security team can audit.

The **unit of value is a review decision**, not a review comment. The jury is the mechanism that makes
the decision trustworthy; the conversation is the audit trail; the receipt is the proof.

### The v1 trust loop

V1 ships only the loop that makes the product defensible:

1. **Install** — Compose on Linux, one command, ≤15 minutes median, signed release bundle.
2. **Connect** — one GitHub App, one org/personal account, all repositories; no per-repo toggle.
3. **Provider** — one key, `/models` discovery, encrypted and origin-bound.
4. **Default jury** — three built-in reviewers: Security, Correctness, Tests. Editable, versioned,
   opinionated. No catalog, no capability registry, no SME approval in v1.
5. **Review** — strict diff + the repository's `AGENTS.md`/`CONTRIBUTING.md` at the base SHA (capped,
   trust-labelled, instructions-only), hard token/tool/wall-clock caps.
6. **Verdict** — one review with composition, per-finding provenance, preserved dissent, and an
   explainable chair rule (ADR and spec: `product/specs/jury-output.md`).
7. **Receipt** — per review: provider, model, tokens, redactions, withheld files, context manifest,
   reviewer versions, policy, resolver. The security buyer's artifact.
8. **Conversation** — per-PR session, replies, `suggest` resolution, stalled-session policy.
9. **Feedback** — one-click valid / wrong / fixed / duplicate on each finding.
10. **Control and recovery** — setup, sessions, three reviewers, providers, audit; backup/restore,
    upgrade, health/readiness, logs.

### Scope decisions that follow

- **Roles:** owner, maintainer, reader. SME, admin, viewer, and auditor are v1.x org features; the
  data model keeps the boundary so they can follow.
- **Deployment:** Docker Compose is the only supported v1 install. Helm is v1.x (ADR-0022 moves).
- **Knowledge:** repository instruction files plus one org conventions pack in v1. Packs, doc links,
  retrieval UI, and graph-backed knowledge are v1.x.
- **Context:** diff-only is the default. Branch review + graph are v1.x and benchmark-gated; a
  one-click “deep review” is the path, not an automatic upgrade.
- **Reviewer configuration:** three built-in reviewers in v1; the catalog, capability registry,
  `jury:cap:*` labels, reviewer studio, and SME workflow are v1.x.
- **Forges:** GitHub.com only in v1; GHES and GitLab are v1.x+.
- **Not in v1:** marketplace, auto-fix/auto-merge, IDE, mobile, MCP, multi-installation, air-gapped,
  SSO, analytics suite.

### ICP

Primary: **20–200 person engineering organisations with a platform or security function and private
GitHub repositories.** Secondary: security-sensitive teams in larger organisations that need a
self-hosted first pass. Solo/homelab is served by the labelled evaluation mode, not by a supported v1
install.

### Quality gate

*Amended 2026-11-16 (owner): the pre-v1 quality spike is dropped.* Quality is measured once v1 is
built, by replaying real reviews (diff-only jury, T0/T0+, vs a strong single-model baseline at equal token
budget) with ground truth from per-finding feedback and appeals. Publish the method and the
scorecard. If diff-only leaves too much recall on the table, branch review moves into v1 and something else
is cut — likely the reviewer studio breadth, not the receipt or the jury output.

## Consequences

**Easier**

- A first release a small team can install, explain, support, and sell.
- A coherent story: trust → evidence → conversation → receipt, instead of a capability catalogue.
- A smaller attack surface: no graph parser, no pack ingestion, no label sync, no seven-role matrix.
- The security buyer gets a proof artifact (the receipt), not just a promise.

**Harder**

- Less breadth than platform competitors; teams with unusual reviewer needs wait for v1.x.
- The opinionated default jury may not fit every codebase; it is editable, but it is not a catalog.
- Diff-only still misses callers/tests; the Phase 3 replay may force branch review earlier than
  planned.
- Solo/homelab users are explicitly not the v1 ICP; the evaluation mode is a taste, not a promise.
- Dropping Helm from v1 narrows enterprise appeal; it returns in v1.x.

**Security and operations**

- Fewer moving parts: no graph store, no pack pipeline, no capability-label sync.
- The receipt makes egress auditable by default; redaction and origin-bound keys are v1, not phase 2.
- Compose-only reduces the support matrix; Helm returns with its own gate.

## Evidence

- The product assessment (2026-11-15): scope vs wedge, the missing jury output, first value as a
  fallback comment, and deferred quality proof.
- R-001 (scope explosion), R-003 (installability), R-004 (quality), R-009 (authorization), R-025
  (over-engineering), R-027 (resolution trust).
- The PoC live case study: useful findings, but a critical key leak and SQL injection outside the
  diff — the gap branch review is meant to close.
- ADR-0018's own diagnosis: the tier table is a platform, not a release.

## Follow-ups

1. ~~Owner approves or amends this ADR at G0.~~ **Accepted at G0, 2026-11-16.**
2. ~~Align `vision.md`, `scope.md`, `capabilities.md`, `roadmap.md`, `personas.md`, and
   `first-run-setup.md` to the trust-loop v1.~~ **Done in the 2026-11-16 consolidation pass.**
3. ~~Decide Q-032–Q-036 (T0 instruction exception, provider allowlist tier, ICP, suggested-fixes tier,
   starter/default jury).~~ **Answered at G0**; see the closed table in
   [`../analysis/open-questions.md`](../analysis/open-questions.md).
4. Write the replay benchmark spec (Phase 3); no pre-v1 spike.
5. Re-tier the deferred capabilities explicitly as v1.x, not as “v1 with a note.”
