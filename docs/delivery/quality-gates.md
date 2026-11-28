# Quality gates

A gate is a hard stop. It is passed only when the evidence is written down and the owner (or the
named reviewer) signs off. "Looks good" is not evidence.

## Gate map

| Gate | When | Question | Owner |
| ---- | ---- | -------- | ----- |
| **G0** | End of Phase 0 | Do we agree on the product, scope, architecture, and risks? | Owner |
| **G1** | End of Phase 1 | Does the self-hosted runtime do a conversational review with visible progress? | Architect |
| **G2** | End of Phase 2 | Is the review decision defensible: evidence, dissent, receipt, audit? | Security lead |
| **G3** | End of Phase 3 | Is the jury measurably better? | AI pipeline + owner |
| **G4** | End of Phase 4 | Can an operator run, upgrade, and recover it? | Ops + owner |
| **G5** | Release | Is it a product, not a project? | Owner |

## G0 — Documentation and product definition — **passed 2026-11-16**

Evidence: the owner accepted ADR-0007, 0008, 0011–0018, 0021–0025 and the default answers to Q-028
and Q-032–Q-048; a link check (0 broken) and a consistency pass across the docs were run. Checks:

- [x] `docs/product/vision.md`, `personas.md`, `principles.md`, `scope.md` are written and
      internally consistent.
- [x] `docs/product/capabilities.md` reflects the owner's input, with TBDs explicit.
- [x] `docs/analysis/flaws.md` has an S1/S2 register with evidence.
- [x] `docs/architecture/overview.md`, `components.md`, `data-model.md`, `job-pipeline.md`,
      `security.md`, `ai-pipeline.md`, `operations.md` are written.
- [x] ADR-0001 (self-hosted/MIT/vendor-neutral) and ADR-0002 (PoC is reference) are accepted.
- [x] The proposed ADRs (deployment, storage, runtime, queue, security) are reviewed, with the
      blocking questions answered or explicitly deferred. The remaining stack ADRs were accepted in
      Phase 1a.
- [x] `docs/delivery/roadmap.md`, `status.md`, `ways-of-working.md`, `quality-gates.md` exist.
- [x] `README.md`, `AGENTS.md`, `LICENSE` exist; MIT is correct.
- [x] The agent chain and skills are documented and usable.
- [x] No product code has been written (the quality spike was removed; the tree is docs only).
- [x] The owner has signed off.

**Evidence:** a review note from the owner, a link check, and a consistency check across docs.

## G1 — Walking skeleton

- [x] Stack ADRs accepted (runtime, deployment, storage, queue, auth, harness). Evidence
      (2026-11-16, Phase 1a): ADR-0005 (runtime), ADR-0003 (deployment), ADR-0004 (storage),
      ADR-0006 (queue), ADR-0010 as amended (harness), and ADR-0026 with technical-approach §3.9
      (auth) are accepted; see the [ADR index](../decisions/README.md).
- [ ] A clean Ubuntu 24.04 host with Docker 24+/Compose v2 installed reaches a first review in ≤15 min median / ≤60 min p90 from a verified bundle; Docker install, DNS, provider account, and org admin work are measured separately.
- [ ] The setup listener is reachable on host loopback only; it is not reachable on the host's public interface.
- [ ] The one-shot `migrate` container exits `0`; then `caddy`, `app` (API + UI), `worker` (cron included; no separate scheduler), and `postgres` start; `/healthz` and `/readyz` pass.
- [ ] Migrations run before the app starts; the schema version is reported.
- [ ] The GitHub App is created, installed, and verified before the owner claim; no per-repo enable toggle is required.
- [ ] A provider key is validated by an authenticated call (not `/models` alone); `/models` is fetched; a capability probe passes; an agent binds to a catalog model (no free text) (ADR-0029).
- [ ] A webhook is verified, persisted, and enqueued.
- [ ] Manual `jury:pr-review` label or Check Run action starts a session; one built-in reviewer publishes one review (T0 diff + base-SHA instruction files; no file tools).
- [ ] ADR-0024 safety core: a non-collaborator comment, a bot comment, and Jury Forge's own comment start no turn; a fork PR is skipped; thread/session turn budgets stop with a hand-off message; fingerprints are stable across two runs.
- [ ] A large PR produces a coverage manifest and a first-line partial-coverage note; nothing is silently dropped.
- [x] The licence check rejects a BSL/SSPL/EE dependency. Evidence (2026-11-27):
      `scripts/check-licences.test.ts` asserts that BUSL-1.1, SSPL-1.0, Elastic-2.0, unknown, and
      `SEE LICENSE IN` licences fail, and that the CLI exits 1 naming a BUSL-1.1 and an SSPL-1.0
      package. It passed as a required step of `pnpm check` in CI
      [run 46020023291](https://github.com/PrakashSewani/jury-forge/actions/runs/46020023291)
      (PR #5).
- [ ] The reviewer is bound to a repo with `required`/`default`; no binding means unavailable.
- [ ] The Check Run moves `queued → in_progress → completed`; the review is the completion; no duplicate comment.
- [ ] One-click finding feedback is recorded.
- [ ] A human reply resumes the session and produces a second agent response with prior context.
- [ ] `suggest` resolution works: the agent proposes, the human resolves natively/UI; a new reply reopens. (`auto` and `off` are v1 and gated at G2.)
- [ ] No-reviewers/no-match fallback comment is posted with setup/retrigger instructions; no review posted.
- [ ] Session, turn, step, finding, and publish records are visible in the timeline, with the router's reason for each reviewer that ran or was skipped. (Tool-call records are v1.1: PR review runs no model tool loop.)
- [ ] A duplicate delivery does not create a duplicate turn; a failed turn is retryable/idempotent.
- [ ] A turn stuck `running` past the threshold is failed by the stuck-turn sweep and its Check Run is completed with the reason (technical-approach §3.3).
- [ ] `pnpm check` passes; tests cover the happy path, duplicate, and resume.
- [ ] The PoC can be turned off; a real PR gets a conversational review from the new stack.

**Evidence:** a recorded install log, a run trace, a PR link, and the check output.

## G2 — Trust and security

- [ ] Roles and scopes are enforced server-side; an authorization test exists per mutating route.
- [ ] Owner/maintainer/reader permissions are enforced server-side; the wider role model (SME/admin/viewer/auditor) is v1.x.
- [ ] The three-reviewer default jury produces a verdict with composition, per-finding provenance, and preserved dissent.
- [ ] A review receipt records provider, model, tokens, redactions, withheld sources, context, policy, verdict, and resolver.
- [ ] A stale session is flagged `needs human` after 7 days and leaves the default inbox after 30; it is archived only when its PR is merged or closed, and never auto-resolved or silently dropped.
- [ ] A required reviewer that is unavailable blocks the review with a fallback; no partial/clean review.
- [ ] Tenant-scoped queries; cross-tenant tests pass.
- [ ] Credential-to-origin binding; a key cannot be sent to an arbitrary URL.
- [ ] Egress policy blocks private/loopback/link-local/metadata ranges; SSRF tests pass.
- [ ] Secret/PII redaction is tested against a corpus; a pre-send manifest exists.
- [ ] Prompt-injection corpus does not change the published verdict or trigger a resolution; trust
      labels and nonce delimiters are in place for diffs, comments, and replies.
- [ ] Findings are grounded: file/line/evidence checks reject fabricated claims.
- [ ] The `auto` resolution guard rejects: bot-unauthored thread, no human response, no evidence, low
      confidence; a positive path resolves and reopens correctly.
- [ ] Provider keys are encrypted, write-only, origin-bound, rotatable; no copy-to-arbitrary-URL.
- [ ] Model catalog calls are SSRF-safe; invalid keys store nothing.
- [ ] Session turns are serialized; a reply during a turn coalesces; no parallel turns.
- [ ] Rate limits and bot-loop protection (ignore self, mention/reply, debounce) are tested.
- [ ] Re-anchoring corpus (rebase, rename, reformat, force-push) passes; doubtful anchors become `outdated`.
- [ ] Verifier drops fabricated findings in the stub corpus; the chair output is identical for identical inputs.
- [ ] Appeal, verified-fixed, suppression (never `critical`), and repo-fact confirmation paths work end to end.
- [ ] Receipts verify offline; tampering or a deleted receipt breaks the chain.
- [ ] Egress preview matches the payload actually sent (redacted).
- [ ] Budgets at session/repo/installation/requester scope fail closed with a Check Run reason.
- [ ] Audit events are written for every trigger, turn, tool call, model call, reply, and resolve.
- [ ] Retention/deletion works and is tested.
- [ ] Sessions can be revoked; sensitive actions require re-auth.
- [ ] Security headers/CSP are present.
- [ ] A red-team exercise finds no open S1; S2s have an owner and a date.
- [ ] `SECURITY.md` and a disclosure process exist.

**Evidence:** the test suites, the threat model review, the red-team report, and the security
checklist.

## G3 — Review quality

- [ ] The evaluation harness v0 runs in CI with a stub model; the replay benchmark (Phase 3) uses dogfood and pilot repos.
- [ ] Baseline measured by replay: a single strong model at equal token budget.
- [ ] Precision ≥ target, recall ≥ target, false-positive rate ≤ target, grounding = 100% for
      inline findings.
- [ ] Deduplication rate ≤ target; disagreement is surfaced; role overlap is measured.
- [ ] Confidence is calibrated (precision per bucket).
- [ ] Suggested fixes apply cleanly; no auto-apply.
- [ ] Hard token/tool/wall-clock caps are enforced; currency estimates are within X% when pricing is known.
- [ ] Agent versioning, activation gates, rollback, run-time snapshots, and prompt hashes work.
- [ ] The router honours `required`/`default`/`capability` selection and path/language/label scope;
      capability reviewers never run without a request; skipped agents are explained.
- [ ] Reviewer catalog approval and required/default/capability bindings are enforced; an unbound
      reviewer never runs; capability labels never grant an unbound reviewer.
- [ ] PR review is the default and diff-only (strict T0 in the MVP; T0+ from v1 expands within the diffed files only, never outside the diff); branch review (v1.x) is T2 and explicit.
- [ ] Capability labels are `jury:cap:<id>` (groups, immutable IDs, every-repo sync, disabled fallback).
- [ ] Benchmark compares strict diff-only against a single strong-model baseline; the graph is built
      only if the result justifies it (ADR-0018).
- [ ] *(v1.x gate)* the `jury:branch-review` label or Branch review action compares the PR branch to the default branch, uses the graph, shows an estimate/cancel; the graph updates incrementally and a second run reuses unchanged summaries.
- [ ] *(v1.x gate)* repo docs at SHA are read for T2; allowlisted live doc links are fetched with per-run snapshots; stale snapshots are marked.
- [ ] Knowledge packs are versioned, scoped, cited, and retrieved under a token budget.
- [ ] `never_quote` content is never sent; no grant = no injection.
- [ ] Feedback capture works; agent/session scorecards exist.
- [ ] The dogfood repository runs on itself and the team uses the sessions.
- [ ] A prompt/model/agent change without a benchmark is blocked by process.

**Evidence:** the benchmark scorecard, the dogfood report, and the cost report.

## G4 — Operations and release

- [ ] Clean-machine install and upgrade pass on the support matrix (amd64, arm64).
- [ ] *(v1.2 gate)* The Helm chart installs, upgrades, and rolls back on `kind` and one managed cluster; ingress keeps
      webhook/OAuth paths out of SSO; `helm test` passes; `values.schema.json` rejects bad values (ADR-0022).
- [ ] Backup and restore drill passes within the target time, including the signing and encryption keys; the restored receipt chain verifies.
- [ ] Upgrade from N-1 with seeded data, then rollback, passes in CI.
- [ ] The sizing floor (2 vCPU / 4 GB / 20 GB, ≤20 devs) is met under the load test.
- [ ] Migration expand/contract and rollback are tested; a pre-upgrade backup is automatic.
- [ ] `jury-forge doctor` diagnoses the documented failure modes.
- [ ] Metrics, traces, logs, dashboards, alerts, and SLOs are documented and tested.
- [ ] The support bundle is redacted and useful.
- [ ] Images are signed; SBOM and provenance are published.
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates exist.
- [ ] Install, upgrade, security, and troubleshooting docs are complete.
- [ ] Load/soak tests meet the target; resource sizing is documented.
- [ ] No open S1/S2 security issues.

**Evidence:** the drill logs, the metrics screenshots, the signed image digests, and the docs
review.

## G5 — v1 release

- [ ] v1.0.0 tag, changelog, release notes, migration notes.
- [ ] Public docs site and a read-only demo.
- [ ] Public benchmark scorecard.
- [ ] Security disclosure process and a security contact.
- [ ] At least one external dogfood team (with permission) and a case study.
- [ ] Support policy and a v1.x roadmap.
- [ ] The owner signs off.
- [ ] Rollback plan for the release itself.

**Evidence:** the release checklist, the signed artefacts, the scorecard, and the owner's sign-off.

## Gate failure

A failed gate is not a crisis; it is information.

1. Record the failing item and its evidence.
2. Decide: fix, de-scope with the owner, or accept the risk explicitly (with a date and an owner).
3. Update the roadmap/status.
4. Do not start the next phase until the gate is passed or the exception is recorded.

## Exceptions

An exception must be:

- explicit,
- time-boxed,
- owned by a named role,
- recorded in the ADR or status,
- reviewed at the next gate.

"Temporary" exceptions that are not recorded are how security and quality debt becomes permanent.
