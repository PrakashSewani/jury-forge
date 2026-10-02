# Jury Forge

Your own AI code-review team for GitHub — self-hosted, on your own Cloudflare account.

Jury Forge is a GitHub App you deploy yourself. Create specialized reviewers — Security,
Architecture, Backend, Frontend, Performance, Testing, Documentation, or fully custom — give
each one its own instructions and its own model (OpenAI-compatible or Anthropic-compatible APIs,
any base URL, your own keys), and every pull request gets one consolidated review with inline
comments.

Nothing runs on someone else's server: the app, its database, and your credentials all live in
your Cloudflare account.

## How it works

- **One deployable.** A Cloudflare Worker serves the dashboard, receives GitHub webhooks, and
  runs reviews; D1 stores configuration and history; a Durable Object coordinates each review
  run (free-tier friendly).
- **Your own GitHub App.** The setup wizard registers a private GitHub App from a manifest —
  GitHub prefills permissions, events, and the webhook URL; you click "Create" and install it.
- **Bring your own keys.** Reviewer model bindings are encrypted at rest (AES-256-GCM) with a
  master key held as a Worker secret. Requests go straight from your instance to your provider.

## Repository layout

- `product/` — the Cloudflare Worker and the React dashboard it serves.
- `site/` — the static promo site (deploys independently).
- `shared/` — brand constants and API contract types.
- `docs/` — product brief, architecture, decisions, development guide, status.

## Development

Requirements: Node 24 (see `.nvmrc`) and npm. Then:

```bash
npm install
npm run check   # typecheck + lint + format check + tests + build — the definition of done
npm run dev     # product dev server (Worker + dashboard in one Vite process)
```

Deployment, releases, and repository setup are documented in
[docs/development.md](./docs/development.md); release procedure details live in the
`ship-release` skill. Releases flow through labeled pull requests from `dev` to `main` (see
[docs/architecture.md](./docs/architecture.md)).

## License

[MIT](./LICENSE)
