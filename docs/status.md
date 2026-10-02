# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope | Status |
|---|---|---|
| 0 | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001 | in progress |
| 1 | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | not started |
| 2 | Product: the core workflow, end to end | not started |
| 3 | Promo site: the site that explains it and sends people to it | not started |
| 4 | Launch: first release tagged, site deployed | not started |

## Current handoff

**Phase:** 0 — waiting for the project brief.

**Done this session:** recorded the `dev`-to-`main` branching and labeled release policy in
`docs/decisions.md`, `docs/architecture.md`, and `docs/development.md`; aligned agent, contributor,
PR, and bootstrap instructions; defined the senior-architect workflow, request budget, scope
controls, decision format, and verification gates. The stack-specific release workflow remains
pending bootstrap.

**Verified:** `git diff --check` passed for changed files; no stale manual-release or
default-`main` instructions remain.

**Blocked by:** the GitHub default branch is still `main`; the available token cannot update
repository settings (API 403). The product brief and stack selection are also pending.

**Next action:** describe the product in plain words (see `docs/product.md` for what belongs in
it), then run the `project-bootstrap` skill.

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
