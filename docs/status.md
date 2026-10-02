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

**Phase:** 2 in progress — the product core, built as stacked pull requests. The design and
slice 1 (foundations) are merged to `dev` (PRs #4 and #5; CI green on merge commit `ba6fae3`).

**Done this session:** verified both merges and synced `dev`; deleted the merged local branches;
refreshed this tracker; recorded D-014 (outbound mocking with MSW via `@msw/cloudflare`, the
Vitest plugin's supported path).

**Verified:** `dev` fast-forwarded to `ba6fae3`; the merge CI run (`36998197313`) succeeded;
`git status` clean.

**Blocked by:** nothing.

**Next action:** on the owner's go, start slice 2a — GitHub plumbing (app JWT, installation and
OAuth calls, the access gate) with the setup and auth routes plus MSW-backed tests; slice 2b
(the wizard UI) stacks on it.

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
