#!/usr/bin/env bash
# The WP 1-13 exit check: `docker compose up` of deploy/ comes up healthy on a clean Linux host, and
# its boundaries hold. CI runs it on fresh GitHub runner VMs (amd64 and arm64); an operator can
# run it on a test host. It needs Docker Engine with Compose v2, curl, sudo, free ports 80, 443,
# and 8080, and the image tagged `jury-forge:local` (`docker build -t jury-forge:local .`).
# It works on a copy of deploy/ in a temporary directory and removes it, volumes included.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
project=jury-forge-smoke
compose() { docker compose --project-name "$project" --file "$work/deploy/compose.yaml" "$@"; }
fail() {
  echo "FAIL: $*" >&2
  exit 1
}
cleanup() {
  compose down --volumes --remove-orphans > /dev/null 2>&1 || true
  sudo rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/deploy"
cp "$repo/deploy/compose.yaml" "$repo/deploy/Caddyfile" "$repo/deploy/init-secrets.sh" "$work/deploy/"
cp "$repo/deploy/.env.example" "$work/deploy/.env"
sudo "$work/deploy/init-secrets.sh"
test "$(sudo stat -c '%u %a' "$work/deploy/secrets/database_url")" = '65532 400' ||
  fail 'database_url is not 65532 0400'
test "$(sudo stat -c '%u %a' "$work/deploy/secrets/db_password")" = '70 400' ||
  fail 'db_password is not 70 0400'
sudo "$work/deploy/init-secrets.sh" 2> /dev/null && fail 'init-secrets overwrote existing secrets'

echo '== up (first start)'
compose up --detach --wait --wait-timeout 180 --no-build
compose ps --all
compose logs --no-color --no-log-prefix migrate | grep -Eq 'migrate: [1-9][0-9]* migration\(s\) applied' ||
  fail 'the first migrate applied nothing'
test "$(docker inspect "${project}-migrate-1" --format '{{.State.ExitCode}}')" = 0 ||
  fail 'migrate did not exit 0'

echo '== hardening'
for service in migrate app worker postgres caddy; do
  container="${project}-${service}-1"
  test "$(docker inspect "$container" --format '{{.HostConfig.ReadonlyRootfs}}')" = true ||
    fail "$service root filesystem is writable"
  test "$(docker inspect "$container" --format '{{json .HostConfig.CapDrop}}')" = '["ALL"]' ||
    fail "$service keeps capabilities"
  docker inspect "$container" --format '{{json .HostConfig.SecurityOpt}}' | grep -q 'no-new-privileges:true' ||
    fail "$service allows new privileges"
done
for service in migrate app worker; do
  test "$(docker inspect "${project}-${service}-1" --format '{{.Config.User}}')" = nonroot ||
    fail "$service does not run as nonroot"
done
test "$(docker inspect "${project}-postgres-1" --format '{{.Config.User}}')" = 70:70 ||
  fail 'postgres does not run as uid 70'

echo '== listeners'
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/healthz)" = 200 ||
  fail 'setup listener does not answer on host loopback'
host_ip=$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
test -n "$host_ip" || fail 'no non-loopback address to probe'
if curl -s -m 5 -o /dev/null "http://${host_ip}:8080/healthz"; then
  fail "setup listener answers on ${host_ip}"
fi
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/)" = 301 || fail ':80 does not redirect'
# No origin is set, so Caddy's ask is refused and no name gets a certificate.
status=0
curl -sk -m 10 -o /dev/null --resolve review.example.test:443:127.0.0.1 https://review.example.test/ ||
  status=$?
test "$status" = 35 || fail ":443 handshake did not fail as expected (curl exit $status)"
# `compose port` prints `:0` for a port that is not published.
published() { compose port "$1" "$2" 2> /dev/null | grep -Eq ':[1-9][0-9]*$'; }
if published postgres 5432; then fail 'postgres is published'; fi
if published app 3000; then fail 'app port 3000 is published'; fi
published app 8080 || fail 'the setup port is not published'

echo '== networks'
pg_image=$(docker inspect "${project}-postgres-1" --format '{{.Config.Image}}')
if docker run --rm --network "${project}_internal" --entrypoint wget "$pg_image" -q -T 5 -O /dev/null \
  https://api.github.com 2> /dev/null; then
  fail 'the internal network has egress'
fi

echo '== worker stop'
compose stop worker
test "$(docker inspect "${project}-worker-1" --format '{{.State.ExitCode}}')" = 0 ||
  fail 'worker did not exit 0 on SIGTERM'
test "$(compose exec -T postgres psql -U jury_forge -d jury_forge -Atc 'select count(*) from worker_heartbeats')" = 0 ||
  fail 'worker left its heartbeat'

echo '== down and up (volume kept)'
compose down
compose up --detach --wait --wait-timeout 180 --no-build
compose logs --no-color --no-log-prefix migrate | grep -q 'migrate: 0 migration(s) applied' ||
  fail 'the second migrate applied migrations again'

echo 'OK: the Compose bundle is healthy and its boundaries hold'
