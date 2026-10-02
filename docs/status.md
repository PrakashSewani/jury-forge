# Status

Persistent project tracker and handoff. The agent updates this as work lands — see `AGENTS.md`,
rule 4. Keep exactly one phase `in progress`.

## Phase tracker

| Phase | Scope                                                                                                 | Status      |
| ----- | ----------------------------------------------------------------------------------------------------- | ----------- |
| 0     | Requirements + stack selection: fill `docs/product.md`, choose the stack, record D-001                | completed   |
| 1     | Scaffold: structure, checks, CI, release path — recorded in `docs/architecture.md` / `development.md` | completed   |
| 2     | Product: the core workflow, end to end                                                                | in progress |
| 3     | Promo site: the site that explains it and sends people to it                                          | not started |
| 4     | Launch: first release tagged, site deployed                                                           | not started |

## Current handoff

**Phase:** 2 in progress — the product core, built as stacked pull requests. The design (PR #4)
is in review; slice 1 (foundations) stacks on it in this PR (merge order: #4 → this PR → later
slices).

**Done this session:** started the phase-2 stack; recorded D-011 (checks on every pull request
for stacked slices), D-012 (the installation-access gate) and D-013 (one `COMMENT` review per
run); migration `0002` with the full phase-2 schema; `worker/lib/crypto.ts` (AES-256-GCM via
`ENCRYPTION_KEY`, versioned format) and `worker/lib/sessions.ts` (D1-backed sessions, cookie
helpers); shared API contracts (`shared/src/contracts.ts`); test D1 migrations wired through
the Vitest plugin with crypto and sessions suites; CI now checks every pull request.

**Verified:** `npm run check` exits 0 — typecheck (3 programs + `astro check` + shared), lint,
Prettier check, every Vitest suite (health, crypto, sessions) on migrated D1, and both builds.

**Blocked by:** nothing. Later slices stack on this branch; merge the stack bottom-up.

**Next action:** review and merge #4, then this PR; slice 2 follows — the setup wizard (manifest
flow, installation check, access gate, claim) with GitHub API mocking for tests.

## Backlog (owner-owned, deferred)

- **Before the first release (phase 4):** create a repo-admin token with `contents: write` and
  add it as the `RELEASE_TOKEN` repository secret — the release workflow fails, with
  instructions, until it exists (D-007; steps in `docs/development.md`). Deferred by the owner.
- **Before the first instance deploy (manual):** generate an `ENCRYPTION_KEY`
  (`openssl rand -base64 32`) and a one-time `SETUP_CODE` (`openssl rand -base64 24`), and set
  both as Worker secrets alongside the D1 create step — see the `ship-release` skill (D-008).

---

### Handoff note format (replace the section above when you stop mid-phase)

- **Phase:** <number and name>
- **Done this session:** <what actually landed>
- **Verified:** <what was run, what was observed — not "it works">
- **Blocked by:** <nothing, or the exact question waiting on the human>
- **Next action:** <the single first thing to do next>
