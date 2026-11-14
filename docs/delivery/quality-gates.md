# Quality gates

A gate is a hard stop. It is passed only when the evidence is written down and the owner (or the
named reviewer) signs off. "Looks good" is not evidence.

## Gate map

| Gate | When | Question | Owner |
| ---- | ---- | -------- | ----- |
| **G0** | End of Phase 0 | Do we agree on the product, scope, architecture, and risks? | Owner |
| **G1** | End of Phase 1 | Can the new runtime replace the PoC end to end? | Architect |
| **G2** | End of Phase 2 | Is it safe for a real team? | Security lead |
| **G3** | End of Phase 3 | Is the jury measurably better? | AI pipeline + owner |
| **G4** | End of Phase 4 | Can an operator run, upgrade, and recover it? | Ops + owner |
| **G5** | Release | Is it a product, not a project? | Owner |

## G0 — Documentation and product definition

- [ ] `docs/product/vision.md`, `personas.md`, `principles.md`, `scope.md` are written and
      internally consistent.
- [ ] `docs/product/capabilities.md` reflects the owner's input, with TBDs explicit.
- [ ] `docs/analysis/flaws.md` has an S1/S2 register with evidence.
- [ ] `docs/architecture/overview.md`, `components.md`, `data-model.md`, `job-pipeline.md`,
      `security.md`, `ai-pipeline.md`, `operations.md` are written.
- [ ] ADR-0001 (self-hosted/MIT/vendor-neutral) and ADR-0002 (PoC is reference) are accepted.
- [ ] The proposed ADRs (deployment, storage, runtime, queue, security) are reviewed, with the
      blocking questions answered or explicitly deferred.
- [ ] `docs/delivery/roadmap.md`, `status.md`, `ways-of-working.md`, `quality-gates.md` exist.
- [ ] `README.md`, `AGENTS.md`, `LICENSE` exist; MIT is correct.
- [ ] The agent chain and skills are documented and usable.
- [ ] No product code has been written.
- [ ] The owner has signed off.

**Evidence:** a review note from the owner, a link check, and a consistency check across docs.

## G1 — Walking skeleton

- [ ] Stack ADRs accepted (runtime, deployment, storage, queue, auth).
- [ ] A clean Linux host can install from the README in ≤ 60 minutes.
- [ ] The app, worker, and scheduler start; `/healthz` and `/readyz` pass.
- [ ] Migrations run; the schema version is reported.
- [ ] A GitHub App can be created, installed, and verified; a repository can be enabled.
- [ ] A webhook is verified, persisted, and enqueued.
- [ ] One reviewer calls one provider, parses a finding, and publishes one review.
- [ ] The run, steps, findings, and publish are recorded and visible in the dashboard.
- [ ] A duplicate delivery does not create a duplicate run.
- [ ] A failed publish is retryable and idempotent.
- [ ] `npm run check` (or the equivalent) passes; tests cover the happy path and the duplicate.
- [ ] The PoC can be turned off; a real PR gets a review from the new stack.

**Evidence:** a recorded install log, a run trace, a PR link, and the check output.

## G2 — Trust and security

- [ ] Roles and scopes are enforced server-side; an authorization test exists per mutating route.
- [ ] Tenant-scoped queries; cross-tenant tests pass.
- [ ] Credential-to-origin binding; a key cannot be sent to an arbitrary URL.
- [ ] Egress policy blocks private/loopback/link-local/metadata ranges; SSRF tests pass.
- [ ] Secret/PII redaction is tested against a corpus; a pre-send manifest exists.
- [ ] Prompt-injection corpus does not change the published verdict; trust labels and nonce
      delimiters are in place.
- [ ] Findings are grounded: file/line/evidence checks reject fabricated claims.
- [ ] Audit events are written for every mutation and exportable.
- [ ] Retention/deletion works and is tested.
- [ ] Sessions can be revoked; sensitive actions require re-auth.
- [ ] Security headers/CSP are present.
- [ ] A red-team exercise finds no open S1; S2s have an owner and a date.
- [ ] `SECURITY.md` and a disclosure process exist.

**Evidence:** the test suites, the threat model review, the red-team report, and the security
checklist.

## G3 — Review quality

- [ ] The evaluation benchmark exists: labelled PRs, seeded issues, clean PRs, adversarial PRs.
- [ ] Baseline measured (single strong model, and the PoC if feasible).
- [ ] Precision ≥ target, recall ≥ target, false-positive rate ≤ target, grounding = 100% for
      inline findings.
- [ ] Deduplication rate ≤ target; disagreement is surfaced.
- [ ] Confidence is calibrated (precision per bucket).
- [ ] Suggested fixes apply cleanly; no auto-apply.
- [ ] Token and cost estimates are within X% of actual; budgets enforce.
- [ ] Prompt/reviewer versioning, activation gates, rollback, and prompt hashes work.
- [ ] Feedback capture works; reviewer scorecards exist.
- [ ] The dogfood repository runs on itself and the team uses the reviews.
- [ ] A prompt/model change without a benchmark is blocked by process.

**Evidence:** the benchmark scorecard, the dogfood report, and the cost report.

## G4 — Operations and release

- [ ] Clean-machine install and upgrade pass on the support matrix (amd64, arm64).
- [ ] Backup and restore drill passes within the target time.
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
