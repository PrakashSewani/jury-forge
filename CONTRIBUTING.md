# Contributing

Thanks for wanting to help. This project is small on purpose — please keep it that way.

## Setup

The stack is chosen when the project starts; the commands that actually work live in
[docs/development.md](./docs/development.md). If that file is still empty, the project has not
been scaffolded yet — see the `project-bootstrap` skill.

## Before you open a PR

Run the project's check command (documented in `docs/development.md`) and make sure the build
passes. CI runs the same commands. Work on a feature branch and open a PR to `dev`; do not push
directly to `dev` or `main`. The only PRs targeting `main` are release PRs from `dev`.

## What a good PR looks like

- One focused change, described in the PR template.
- Docs updated when behavior changes (`docs/` is the source of truth).
- No new dependencies without a note explaining why.
- For release PRs to `main`, apply exactly one `release:patch`, `release:minor`, or
	`release:major` label. Merges without one of these labels do not publish a release.
- A labeled release merge to `main` creates the version tag and GitHub release. Product and site
	deployment remains manual.

## Reporting bugs

Open an issue with what you did, what you expected, and what happened — versions included.
Screenshots or logs help.
