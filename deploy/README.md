# Jury Forge — Compose bundle

The self-hosted stack: `caddy`, `migrate` (one-shot), `app`, `worker`, and `postgres`
([`docs/architecture/deployment.md`](../docs/architecture/deployment.md) §3).

**Status: WP 1-13 (M1.2).** The stack starts and is healthy, but there is no setup flow yet. The
bootstrap token and setup arrive with WP 1-15 and WP 1-16, and the origin and certificates with
WP 1-14. Until then `:443` issues no certificate, and the setup listener answers `/healthz` only.

## Requirements

- Linux with Docker Engine 24+ and Compose v2 (Ubuntu 24.04 LTS, amd64 or arm64; DEP-05).
- Ports 80 and 443 free. Port 8080 is used on host loopback only.
- Root once, to create the secret files.
- Not supported yet: rootless Docker or user-namespace remapping, which shift the secret files'
  owners.

## Start

From a checkout of the repository:

```sh
cd deploy
cp .env.example .env
sudo ./init-secrets.sh      # database_url and master_key (uid 65532), db_password (uid 70); 0400
docker compose up -d --wait # builds jury-forge:local from the checkout the first time
docker compose ps
curl -s http://127.0.0.1:8080/healthz
```

Back up `secrets/master_key` apart from the database: the stored secrets cannot be opened without
it, and `app` and `worker` refuse to start with another key (`encryption_key_mismatch`).

The images are built from the checkout until the release pipeline publishes signed images
(WP 4-05). `init-secrets.sh` refuses to overwrite and prints fingerprints only; `jury-forge init`
(WP 1-17) replaces it.

## Check it

`scripts/compose-smoke-test.sh` from the repository root runs the whole exit check on a copy of
this directory and removes it afterwards, volumes included. It needs `jury-forge:local`, curl, and
sudo, and ports 80, 443, and 8080 free. CI runs it on every pull request.

## Stop and remove

```sh
docker compose down       # keeps the postgres-data, caddy-data, and caddy-config volumes
docker compose down -v    # also deletes them: every review and every certificate
```
