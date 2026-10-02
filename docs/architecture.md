# Architecture

> Empty until the stack is chosen. The `project-bootstrap` skill fills this in as part of
> scaffolding, together with `docs/decisions.md` (D-001) and `docs/development.md`.

## Shape

The product and the promo site, and how they relate: what is shared (and what deliberately is
not), and how the site deploys independently of the product.

## Components

| Piece | Where | Responsibility |
|---|---|---|
| (product) | — | — |
| (site) | — | — |
| (shared) | — | — |

## Data flow

Where data lives, who owns it, and what leaves the user's machine.

## Boundaries and invariants

The rules code must not break: permissions, privacy, what is shared, what may never be shared.

## Branch and release flow

- Configure `dev` as the default branch and use it as the integration target. Agent work stays
	on a feature branch and reaches `dev` through a pull request.
- A release is proposed by a pull request from `dev` to `main`. CI may validate changes on PRs
	and development branches, but release-related workflows trigger only after changes reach
	`main`.
- A release PR carries exactly one `release:patch`, `release:minor`, or `release:major` label.
	On merge, release automation bumps the selected stack's version source, creates the matching
	`v<version>` tag, and publishes a GitHub release. Without a release label, no release is
	published.
- `dev` represents ongoing unreleased work and can match `main` just after a release. Deployment
	of the product or promo site remains a deliberate manual action.
- The default branch and required-PR protections are GitHub repository settings; configure them
	when creating a project from this template.
