# Stack notes — guidance, not gospel

Qualitative shapes for common product types. **No versions here on purpose** — resolve versions
live (see the skill's step 3), and verify current practice with a search when the choice matters.

## Product runs in the browser (extension / addon)

- Manifest V3 is the platform; pick a build tool that keeps the manifest honest and supports HMR
  for content scripts, or plain Vite if you prefer fewer layers.
- Store review is a design constraint from day one: minimal permissions, a privacy story, and
  bundling that survives review. Decide how you'll justify every permission before you add it.
- The UI usually needs to survive hostile page CSS — shadow DOM / scoped UI rather than global
  styles.

## Web app with accounts and data

- Decide where data lives before choosing the framework; migrations and backups are a
  commitment, not a detail.
- A full-stack framework (one language, server + client) is the default when a solo/small team
  ships fast; split API/web only when there's a reason (existing .NET/Java estate, separate
  teams, native clients).
- Serverless fits request/response workloads; it stops fitting when you need long-running work,
  websockets, or heavy scheduled jobs — decide deliberately.
- Authentication: use a maintained library, not a hand-rolled session system.

## Promo / marketing site

- Static by default. A small edge function is enough for waitlist forms and redirects.
- It should deploy independently of the product and never import product runtime code.
- Share only brand constants and copy types with the product.

## CLI tool

- Distribution decides the language: single static binary (Go/Rust/Zig) when users shouldn't need
  a runtime; TypeScript/Node when the audience already has Node and npm.
- One binary or one package; subcommands over multiple tools.
- Output is a contract: stable stdout for humans, `--json` for machines, meaningful exit codes.

## Library / package

- The API surface is the product: keep it small, version it honestly (semver), document it.
- Ship types/signatures with the package; prefer zero runtime dependencies.
- Automate the publish path with provenance where the registry supports it.

## Desktop / mobile

- Prefer the platform's mainstream framework over clever cross-compilation unless the product
  demands it.
- Signing, notarization, and store accounts are long-lead items — surface them in phase 0, before
  they block launch.

## Always

- One `check` command; CI runs exactly it.
- Resolve versions live. Never copy a version out of this file, `docs/`, or a blog post.
- Two similar tools beat one premature abstraction; three is when you extract.
- The promo site is not the product — do not couple their builds.
