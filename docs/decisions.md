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
