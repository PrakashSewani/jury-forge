---
name: ship-release
description: Release and deploy this project. Use when the user asks to release, ship, publish, or deploy. Deploys are manual by policy; this skill is filled in with the project's real commands at bootstrap time.
license: MIT
metadata:
  template: template-app-plus-site
  version: "1"
---

# Ship a release

## Rules (always)

- **Version source of truth:** the manifest of the chosen stack (e.g. `package.json`,
  `Cargo.toml`). A release tag is `v<version>` and must match it exactly.
- **Deploys are manual.** Give the user exact, copy-pasteable commands; never wire an
  auto-deploy pipeline, and never deploy without being asked.
- **CI builds artifacts on tags; publishing and deploying are deliberate human steps.**
- **Record the real procedure here** when the stack is chosen (see "Procedure" below), including
  the failure path — how to yank a bad release.

## Procedure — NOT YET FILLED IN

The stack has not been chosen yet (`docs/decisions.md`, D-001). At bootstrap:

1. Replace this section with the exact steps for the chosen stack: version bump → checks →
   commit + tag → push → watch CI → verify the artifact.
2. Add the deploy steps for each target (the product and the promo site separately), with the
   exact CLI commands.
3. Add the rollback/yank path.
4. Only commands that were actually run belong here.

## Skeleton to adapt

```text
1. Bump the version in <manifest>; add the CHANGELOG entry.
2. Run the project's check command (docs/development.md) and the build.
3. git add -A && git commit -m "Release v<version>"
4. git tag v<version> && git push origin main --tags
5. Watch CI (gh run watch); verify the artifact / release page.
6. Deploy (exact command) — only when the user asks.
```
