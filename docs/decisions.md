# Decisions

Append-only log of settled decisions. New entries get the next number, a date, and a sentence of
context. If a decision is reversed, add a new entry that supersedes the old one — never edit
history. The agent records decisions here **before** implementing them (see `AGENTS.md`, rule 2).

## D-001: Stack selection — pending

**Date:** —

**Decision:** Not made yet, on purpose. The stack is chosen when the project's requirements are
known — see the `project-bootstrap` skill.

Replace this entry before scaffolding, and include:

- Language / framework / runtime — with the exact versions resolved **live** at that moment (not
  from memory, not copied from anywhere).
- Package manager, test runner, lint/format, build tool.
- Deployment target(s) and how CI verifies the repo.
- What was considered and rejected, and why (one line each).

The chosen stack is then described in `docs/architecture.md`, and its commands in
`docs/development.md`.

## D-002: Branching and automated releases

**Date:** 2026-09-26

**Decision:** `dev` is the default integration branch. Agent changes use feature branches and
pull requests targeting `dev`; releases flow from `dev` to `main`. Release-related workflows run
only after changes merge to `main`. A release PR must carry exactly one of
`release:patch`, `release:minor`, or `release:major`; the release automation applies that bump to
the chosen stack's version source, creates a matching `v<version>` tag, and publishes a GitHub
release. A merge without a release label does not publish a release. `dev` carries unreleased
work between releases and may match `main` immediately after one. Product/site deployment remains
manual. The concrete automation is wired during bootstrap after the stack and version source are
chosen.

## D-003: Agent operating model

**Date:** 2026-09-26

**Decision:** The primary agent acts as senior architect and owns requirements analysis,
architecture, documentation, code generation, integration, testing, and final verification.
Subagents are optional and restricted to one sequential, read-only discovery or evidence-gathering
request; they do not implement, make decisions, edit documentation, or verify changes.
