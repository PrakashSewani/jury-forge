---
name: ship-release
description: Explain the automated release path and perform manual product/site deployments when asked. The release workflow is filled in at bootstrap time.
license: MIT
metadata:
  template: template-app-plus-site
  version: "1"
---

# Release and deploy

## Rules (always)

- **Release trigger:** only a pull request merged into `main` can start release-related workflows.
  Work on `dev` never publishes a release.
- **Release selection:** a release PR has exactly one `release:patch`, `release:minor`, or
  `release:major` label. A merge without one of these labels does not publish a release.
- **Version source of truth:** the chosen stack's manifest. The workflow applies the labeled bump,
  creates a `v<version>` tag matching the manifest, and publishes a GitHub release.
- **Deployments are manual.** Give the user exact, copy-pasteable commands; never deploy without
  being asked.
- **Record the real procedure here** when the stack is chosen (see "Procedure" below), including
  the automated release workflow, artifact handling, and failure path — how to yank a bad release.

## Procedure — NOT YET FILLED IN

The stack has not been chosen yet (`docs/decisions.md`, D-001). At bootstrap:

1. Replace this section with the exact main-only release workflow for the chosen stack: label
  validation → version/changelog update → checks/build → tag → GitHub release → artifact
  verification.
2. Add manual deploy steps for each target (the product and the promo site separately), with the
  exact CLI commands.
3. Add the rollback/yank path.
4. Only commands that were actually run belong here.

Do not add a generic release workflow before the stack and its version manifest are selected.
The bootstrap skill requires the concrete workflow to run only after merges to `main`.
