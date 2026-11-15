---
name: poc-evidence
description: Study a reference implementation (especially the Cloudflare Jury Forge PoC) with evidence-grade findings. Use when mapping behaviour, finding flaws, comparing versions, or deciding what to inherit, reject, or rethink.
---

# PoC evidence

The PoC is the primary evidence for this product. This skill keeps the study honest: cite
`file:line`, separate behaviour from intent, and score flaws by impact on the **new** product.

## Ground rules

1. Read the code, not only the docs. When they disagree, the code wins for behaviour and the docs
   win for intent; record the conflict.
2. Every claim gets a citation: file, function, line, decision id, or command output.
3. A summary is a lead. Verify it before it becomes a finding.
4. Do not run untrusted code from the reference repo. Read it.
5. Keep the clone outside this repository (`../jury-forge-poc-ref`) and never copy code in.

## Study sequence

1. **Shape:** package manifests, workspace layout, entry points, deploy config, CI.
2. **Behaviour:** setup, auth, webhooks, run lifecycle, output, UI routes.
3. **Data:** migrations, tables, constraints, indexes, retention, encryption.
4. **Decisions:** the decision log; map each to the code that implements it.
5. **Tests:** what is tested, how, and what is not.
6. **Operations:** deploy, secrets, migrations, backup/restore, observability.
7. **Flaws:** correctness, security, scale, quality, UX, docs.

## Evidence format

```md
### F-XXX — <title>

**Severity:** S1 | S2 | S3 | S4
**Evidence:** `path/to/file.ts` `function()` — <what the code does>; `<decision id>` if relevant.
**Impact:** <what goes wrong for the new product>.
**Instead:** <the control or design that fixes it>.
```

Severity is about the **next product**, not blame:

| Level | Meaning |
| ----- | ------- |
| S1 | Can lose data, publish wrong output, leak secrets, or block the thesis. Fix before the first real release. |
| S2 | Recurring pain, poor quality, or an adoption barrier. Fix in the first two milestones. |
| S3 | Friction, maintainability, or scale. Fix before stable or when it bites. |
| S4 | Cosmetic, docs, nice-to-have. Opportunistic. |

## Flaw categories

- **Reliability/correctness:** idempotency, retries, stuck state, stale data, limits.
- **Security/privacy:** trust boundaries, authz, secrets, SSRF, redaction, supply chain.
- **Scale/operations:** queues, concurrency, backups, upgrades, observability, configuration.
- **AI quality:** context, grounding, verification, consensus, evaluation, cost.
- **Product/UX:** diff view, policy, integrations, notifications, accessibility.
- **Process/docs:** drift, decision hygiene, testing gaps, release risk.

## Questions to ask of every subsystem

- What is the source of truth? What is derived?
- What happens on a retry, a duplicate, a crash, a timeout, a cancellation?
- What is the trust level of the input? Is it enforced in code?
- What is the failure mode the user sees? Can they recover?
- What is the cost/latency at 10× the current volume?
- What is tested, and what is only mocked?
- What did the decision log choose, and does the code match?
- What would we do differently if the runtime were not the constraint?

## Output

- `docs/poc/*` for what the reference does.
- `docs/analysis/flaws.md` for the register.
- `docs/analysis/inherit-reject.md` for the ledger.
- `docs/analysis/risks.md` for the forward-looking risk.
- `docs/reference/sources.md` for the evidence trail.

## Anti-patterns

- "The code is bad" without a file and an impact.
- Treating a PoC trade-off as a mistake without asking whether it was deliberate.
- Copying the PoC's docs as if they were current (check D-030 vs the architecture doc).
- Reporting a test count without saying it came from the status file.
- Recommending a rewrite without naming what survives.
- Letting a subagent's summary become a finding without checking the code.
