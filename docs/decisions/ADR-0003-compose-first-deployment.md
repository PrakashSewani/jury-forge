# ADR-0003: Docker Compose is the reference deployment

- Status: proposed
- Date: 2026-11-14
- Owners: architecture + operations
- Supersedes: —
- Revisit trigger: the first 10 installs, or a strong demand for Kubernetes/air-gapped installs.

## Context

The product must be self-hostable by a small team without a platform team. The PoC's one-command
Cloudflare deploy was excellent ergonomics but the wrong runtime. We need an install that is
reproducible on a VPS, homelab, or on-prem VM, with a path to external Postgres and object storage.

## Options

1. **Docker Compose on a single host.** App, worker, scheduler, Postgres, optional Redis/MinIO,
   Caddy. One command, one host.
2. **Single all-in-one container.** Easiest demo; limited for teams.
3. **Kubernetes/Helm.** Scalable; heavy for the target user; delays the first release.
4. **Bare-metal packages.** OS-specific; high maintenance.
5. **Cloudflare/other PaaS.** Rejected by ADR-0001.

## Decision

Option 1 is the reference. Option 2 is supported as a clearly labelled evaluation/personal mode
after it is proven. Option 3 is deferred to post-v1.

## Consequences

**Easier:** install, TLS, backup, local development, on-prem, no cloud account.

**Harder:** horizontal scaling is manual (add worker replicas on the host); HA requires external
Postgres and a second host; the operator owns OS patching.

**Constraints:** no sticky sessions; app/worker/scheduler are stateless; migrations run as a
one-shot command; all state is in Postgres/object storage.

## Security and operations

- Only the reverse proxy publishes ports; Postgres/Redis/MinIO are internal.
- Containers run as non-root; read-only root FS where possible.
- Secrets via env/files/Docker secrets; no secrets in the image.
- A `jury-forge doctor` command and a support bundle are part of the deployment.
- Backups and restore drills are required before v1.

## Evidence

- `docs/architecture/deployment.md`.
- `docs/analysis/flaws.md` F-039, F-041, F-042.
- PoC deployment constraints in `docs/poc/deployment.md`.

## Follow-ups

- Spike: Compose install on a clean Ubuntu VM, time to first review.
- Decide the bundled vs external Postgres default.
- Decide the all-in-one image scope and label it clearly.
