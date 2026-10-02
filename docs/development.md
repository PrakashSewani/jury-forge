# Development

> Empty until the stack is chosen. The `project-bootstrap` skill fills this in with the real
> commands — and only commands that were actually run belong here.

## Prerequisites

(What a new contributor installs first.)

## Setup

(Clone, install, configure env — the exact commands.)

## Commands

| Command | What it does |
|---|---|
| (check) | typecheck + lint + tests — the one command that must pass before anything is "done" |
| (test) | — |
| (build) | — |
| (run / dev) | — |

## Environment

(Env vars, where they come from, what happens when they are missing.)

## Releases and deploys

Create release PRs from `dev` to `main` and apply exactly one release label:
`release:patch`, `release:minor`, or `release:major`. After merge, release automation runs only
from `main`, updates the stack's version source, creates a matching `v<version>` tag, and
publishes a GitHub release. Merges without a release label do not publish a release. Product and
site deployments remain manual; see
[`.commandcode/skills/ship-release/SKILL.md`](../.commandcode/skills/ship-release/SKILL.md) for
the project-specific procedure.

This template has no stack or release workflow yet. Wire and verify the version bump, tag, and
GitHub release automation during bootstrap after choosing the stack and its version source.

## Troubleshooting

| Symptom | Fix |
|---|---|
| — | — |
