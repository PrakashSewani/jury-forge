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

**Phase:** 2 in progress — slice 2b (the wizard UI) is in review on `phase-2/2b-wizard-ui`
(#9); slice 2a (#8) is merged to `dev`.

**Done this session:** built slice 2b — the React setup wizard and shell: `/setup` derives its
step from setup state (setup code with the auto-submitted manifest form, install link and
verification, claim via GitHub sign-in, done) with a step indicator and error banners for
claim-callback redirects; the shell and home show instance state and the signed-in user (sign
in / log out); `GET /api/setup/state` now includes `appSlug` (public metadata — D-015). Added
pure-module tests for step derivation, manifest form shaping, the install URL, error copy, and
route resolution; fixed a pre-existing flaky crypto test (the tampered-input case could be a
no-op in about 25% of runs).

**Verified:** `npm run check` exits 0 — typecheck, lint, Prettier, 44/44 tests across 7 files,
both builds. Manually exercised the wizard against the dev server in a browser: all four states
render from live state, and submitting the setup code auto-posts the manifest form and lands on
GitHub's manifest page.

**Blocked by:** nothing. Slice 3 stacks on `phase-2/2b-wizard-ui` once this merges.

**Next action:** build slice 3 — reviewers and providers (reviewers CRUD API, provider
adapters, context builder and consolidation as tested pure modules).

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
