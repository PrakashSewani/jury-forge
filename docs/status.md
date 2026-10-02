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

**Phase:** 2 in progress — slice 2a (the wizard backend) is in review on
`phase-2/2a-wizard-flows`; the design (#4), slice 1 (#5), and the post-merge tracker refresh
(#7) are merged to `dev`.

**Done this session:** built slice 2a — GitHub plumbing (app JWT via `@octokit/auth-app`,
manifest conversion, installation lookup, OAuth exchange, `/user` + `/user/installations`
calls, the D-012 access gate), including normalizing GitHub's PKCS#1 app keys to PKCS#8 for the
JWT library; setup routes (state, code, manifest callback, installation verification gated by
the short-lived `jf_setup` cookie) and auth routes (OAuth start/callback with claim, session,
logout); same-origin and session middleware; MSW wired into the test setup (`msw` 3.0.1,
`@msw/cloudflare` 0.2.0 — D-014) with setup-flow, auth-flow, and access-gate suites; design
note updated.

**Verified:** `npm run check` exits 0 — typecheck, lint, Prettier, 32/32 tests across 6 files on
migrated D1 (including the MSW-backed flows), both builds.

**Blocked by:** nothing. Slice 2b stacks on this branch once this merges.

**Next action:** build slice 2b — the React wizard (code → create app → install → claim) — then
the reviewers/providers slice.

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
