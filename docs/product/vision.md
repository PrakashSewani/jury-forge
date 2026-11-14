# Product vision

## The short version

Jury Forge is a **self-hosted, agentic AI code-review jury** for teams that will not send their
code to someone else's review SaaS. You run it on your infrastructure, connect your own model keys,
define the reviewers you want, and get a grounded, auditable review on every pull request — with a
conversation that stays alive as the author replies, fixes, and asks questions.

## The problem

AI now writes and changes code faster than human review can keep up. The market's answer is
usually one of two things:

1. **A hosted AI reviewer** with a provider-owned model, a provider-owned prompt, and a platform
   markup. Your code leaves your perimeter, you cannot inspect or change the review logic, and the
   vendor decides which model and which rules are good for you.
2. **A prompt script** wired to one provider. Cheap and transparent, but brittle: no context
   management, no grounding, no policy, no audit, no operations.

Neither gives a team what it actually needs: **several reviewers with different responsibilities,
running under the team's own standards, on the team's own infrastructure, with evidence that the
review is trustworthy.**

## The thesis

A code review is not a single model call. It is a pipeline:

```
understand the change → gather the right context → run specialist reviewers
→ ground every claim in code → resolve disagreement → publish a verdict
→ measure whether it was right → improve
```

The PoC proved the interface — a jury of configurable reviewers, one consolidated review, BYOK,
self-hosted. It did not build the pipeline, and it treated the review as a one-shot prompt.

Jury Forge makes the review **conversational and agentic**: a durable session per PR, specialist
agents with tools, a repository knowledge graph, and a resolution protocol that only closes a
thread when the author's response actually satisfies the finding.

```
manual ask / reply / push
  → PR session
  → router selects agents
  → agents use tools + repo graph
  → ground + verify + chair
  → reply in the thread
  → human responds
  → verify + resolve (or ask again)
```

## The wedge

**Excellent, self-hosted pull-request review for GitHub teams.**

Not a platform, not an IDE, not an agent that writes code. One job: when a pull request changes,
produce a review that a strong senior engineer would respect, with the evidence to back it, inside
the operator's perimeter.

Everything else — multi-forge, policy engines, analytics, marketplaces — is a later layer that
must not weaken the wedge.

## What "surpass the PoC" means

| Axis | PoC | Jury Forge |
| ---- | --- | ---------- |
| **Quality** | Prompt + diff + JSON parse | Retrieval, grounding, verification, consensus, confidence, suggested fixes, evaluation |
| **Trust** | Signature checks, encrypted keys | Trust-labelled untrusted input, secret redaction, egress policy, roles, audit, preview/approve |
| **Operability** | Cloudflare-specific, no backup/restore | Compose install, Postgres, queue, backups, upgrades, diagnostics, metrics, traces |
| **Extensibility** | Two provider flavors, GitHub only | Provider registry, forge adapters, policy, reviewer versions, pack registry |
| **Cost** | Byte budgets, no cost guard | Token/cost budgets, estimates, local models, per-repo policy |
| **Team** | Single owner | Roles, membership, scopes, audit export |
| **Reproducibility** | Latest-always, mutable prompts | Versioned reviewers, pinned packs, prompt hashes, run snapshots |
| **Licence** | MIT | MIT, no open-core trap |

## Who it is for

The primary user is a **team that already reviews code carefully** and wants AI to raise the floor,
not replace the reviewer:

- platform and infrastructure teams with security-sensitive code;
- security teams that need a consistent first pass and an audit trail;
- staff engineers who want a reviewer that knows the team's conventions;
- small product teams that cannot justify a per-seat review SaaS;
- AI platform teams that want a vendor-neutral review layer they can point at any model.

See [`personas.md`](personas.md).

## What it is not (for now)

- **Not a code-generation or auto-fix product.** Suggestions are proposals; nothing auto-merges.
- **Not a model host or reseller.** You bring keys; requests go to your provider.
- **Not a central service.** The project ships software; it does not hold customer code.
- **Not a reviewer marketplace** in v1. Built-in templates and local knowledge packs, yes;
  cross-instance commerce, no.
- **Not a replacement for human review.** The output is a better first pass, evidence, and
  consistency — not a rubber stamp.
- **Not multi-forge in v1.** GitHub first; the adapter boundary is designed for more.

## The bet

Teams will pay in setup effort for **control, quality, and auditability**. The winning product is
not the one with the most integrations; it is the one whose review a senior engineer trusts enough
to keep enabled.

## The sentence we want operators to say

> "Our review jury runs on our infrastructure, knows our standards, shows its evidence, and catches
> the things we used to catch late. We would not go back."
