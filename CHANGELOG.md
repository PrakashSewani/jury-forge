# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Monorepo scaffold: `product/` (Cloudflare Worker + React dashboard), `site/` (Astro promo
  site), `shared/` (brand constants and API contract types).
- One `npm run check` command (typecheck, lint, format check, tests, build) and GitHub Actions
  CI for pull requests to `dev`/`main` and pushes to `dev`.
- Label-driven release automation: `release:patch` / `release:minor` / `release:major` on a
  `dev` → `main` pull request bumps the version, updates the changelog, tags, and publishes a
  GitHub release on merge.
- Cloudflare Worker with a health API, a D1 binding with an initial migration, and
  Workers-runtime tests via the Cloudflare Vitest plugin.
