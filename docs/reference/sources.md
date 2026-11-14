# Sources and evidence

This knowledge base is built from direct inspection of the PoC repository, not from memory or a
summary. This page records what was read and how to reproduce the study.

## Primary source

| Item | Value |
| ---- | ----- |
| Repository | [`PrakashSewani/jury-forge-poc`](https://github.com/PrakashSewani/jury-forge-poc) |
| Commit studied | `1cc22b728d853f11349d795ba2a2494d58ec1229` |
| Commit message | `Merge pull request #27 from PrakashSewani/feat/knowledge-packs-20261026` |
| Date | 2026-10-26 22:26:19 +0530 |
| Local clone during study | `D:\Projects\jury-forge-poc-ref` (outside this repository) |
| Study date | 2026-11-14 |

## Documents read

- `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
- `docs/product.md`, `docs/architecture.md`, `docs/design.md`, `docs/decisions.md`,
  `docs/development.md`, `docs/roadmap.md`, `docs/status.md`
- `docs/rework/README.md`, `baseline.md`, `shell.md`, `final.md`, `knowledge.md`
- `.commandcode/skills/project-bootstrap/SKILL.md`, `ship-release/SKILL.md`
- `.github/workflows/ci.yml`, `deploy.yml`
- `product/`, `shared/`, `site/` package manifests and configuration

## Code read (representative, not exhaustive)

- `product/worker/index.ts`, `middleware.ts`, `run-engine.ts`
- `product/worker/lib/{access,activity,consolidate,context,crypto,github,github-app,instance,
  pack-format,packs,private-key,providers,readiness,repositories,resolution,respond,reviewers,
  scope,sessions,settings}.ts`
- `product/worker/routes/{auth,setup,webhooks,runs,reviewers,repositories,settings,packs}.ts`
- `product/migrations/0001`–`0009`
- `shared/src/{contracts,errors,index,templates}.ts`, `shared/src/schemas/*`
- `product/src/App.tsx`, `product/src/lib/*`, `product/src/pages/*`, `product/src/shell/*`,
  `product/src/ui/*` (spot-checked)
- `product/test/*`, `product/test-ui/*` (spot-checked for coverage claims)
- `scripts/{deploy-guided,seed-dev,release,measure-layout}.mjs`
- `product/wrangler.jsonc`, `.dev.vars.example`
- `site/src/pages/index.astro`, `site/wrangler.jsonc`

## Commands used

```bash
git clone https://github.com/PrakashSewani/jury-forge-poc.git jury-forge-poc-ref
cd jury-forge-poc-ref
git log --oneline --all --decorate
find . -not -path './.git/*' -not -path './node_modules/*' -type f | sort
wc -l docs/*.md product/worker/run-engine.ts product/worker/lib/*.ts
grep -rn "from 'octokit'" product shared scripts   # no matches
ls .github/workflows                                # ci.yml, deploy.yml only
```

The PoC's own test counts (386 worker / 197 UI) and its accessibility harness results are taken
from `docs/status.md` and the rework sheets, not re-run during this study. Re-run `npm run check`
and the harness on the PoC if a claim is load-bearing for a decision.

## Evidence rules for this repository

1. A claim about the PoC cites a file and, where useful, a line or function.
2. A claim about the target product is labelled **proposed**, **TBD**, or **accepted**.
3. A benchmark or measurement is reproducible; record the command and the environment.
4. A subagent's summary is a lead, not evidence. Check the source.
5. When the PoC's docs and code disagree, the code wins for behaviour; the docs win for intent.
   Record the conflict.
6. When a PoC doc is stale (for example, the retired `main` release flow), say so and cite the
   superseding decision.

## Known limitations of this study

- The PoC was not executed end to end against a real GitHub installation or a real provider during
  the study. Findings about runtime behaviour are from code reading and the PoC's own status.
- Test counts and harness results are from the PoC's status file, not re-run.
- The PoC's live instance at `jury.prakashsewani.com` was not accessed; the status file is the
  source.
- Some UI files were spot-checked rather than read line by line; the flaws listed are
  architectural or security-relevant, not cosmetic line-level issues.
- Cloudflare plan limits, pricing, and product behaviour can change; verify them before relying on
  a constraint in a new ADR.
