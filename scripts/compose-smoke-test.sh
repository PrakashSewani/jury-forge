#!/usr/bin/env bash
# The exit checks of WP 1-13 and WP 1-14 on a clean Linux host. CI runs it on fresh GitHub runner
# VMs (amd64 and arm64); an operator can run it on a test host.
# 1. `docker compose up` of deploy/ is healthy and its boundaries hold. No origin is set, so every
#    certificate is refused. The master key is in no log, and another key stops `app` with
#    `encryption_key_mismatch` (WP 1-15a).
# 2. With PUBLIC_URL set and Caddy pointed at Pebble (Let's Encrypt's test ACME server; test-only,
#    never shipped), the configured name gets a valid certificate, every other name is refused,
#    another Host gets 421, and /readyz reports tls_issued.
# It needs Docker Engine with Compose v2, curl, sudo, free ports 80, 443, 8080, and 15000, and the
# image tagged `jury-forge:local` (`docker build -t jury-forge:local .`). It works on a copy of
# deploy/ in a temporary directory and removes it, volumes included.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
project=jury-forge-smoke
# Pebble by tag and multi-arch digest. Renovate's docker-compose manager does not read this file.
pebble_image=ghcr.io/letsencrypt/pebble:2.10.3@sha256:0c81f05db371f436c97fb894bd6d2ab8fc9c8e2ce40f8bef8a8e15941bcd75ef
origin_host=review.jury-forge.test
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
test "$(sudo stat -c '%u %a' "$work/deploy/secrets/master_key")" = '65532 400' ||
  fail 'master_key is not 65532 0400'
master_key=$(sudo cat "$work/deploy/secrets/master_key")
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
compose logs --no-color --no-log-prefix app | grep '"decision":"not_configured"' | grep -q review.example.test ||
  fail 'the app did not refuse the ask before an origin exists'
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
readyz() {
  docker run --rm --network "${project}_internal" --entrypoint wget "$pg_image" -q -O - \
    http://app:3000/readyz
}
readyz | grep -q '"state":"origin_unset"' || fail "/readyz does not report origin_unset: $(readyz)"
readyz | grep -q '"master_key":"ok"' || fail "/readyz does not report the master key: $(readyz)"

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

echo '== master key (WP 1-15a)'
if compose logs --no-color | grep -qF "$master_key"; then fail 'the master key is in a log'; fi
compose stop app worker
sudo cp "$work/deploy/secrets/master_key" "$work/deploy/master_key.kept"
sudo chmod 0600 "$work/deploy/secrets/master_key"
head -c 32 /dev/urandom | base64 | sudo tee "$work/deploy/secrets/master_key" > /dev/null
sudo chmod 0400 "$work/deploy/secrets/master_key"
status=0
output=$(compose run --rm --no-deps -T app 2>&1) || status=$?
test "$status" = 1 || fail "app started with another master key (exit $status)"
echo "$output" | grep -q '"code":"encryption_key_mismatch"' ||
  fail "app did not report encryption_key_mismatch: $output"
sudo cp "$work/deploy/master_key.kept" "$work/deploy/secrets/master_key"
sudo chown 65532:65532 "$work/deploy/secrets/master_key"
sudo chmod 0400 "$work/deploy/secrets/master_key"
sudo rm -f "$work/deploy/master_key.kept"
compose up --detach --wait --wait-timeout 180 --no-build
readyz | grep -q '"master_key":"ok"' || fail "the restored key is not ready: $(readyz)"

echo '== origin and TLS (WP 1-14, Pebble)'
compose down
{
  echo 'services:'
  echo '  pebble:'
  echo "    image: $pebble_image"
  echo '    command: ["-config", "/test/config/pebble-config.json"]'
  echo '    environment:'
  echo '      PEBBLE_VA_ALWAYS_VALID: "1" # no DNS for the test name; validation is not under test'
  echo '      PEBBLE_WFE_NONCEREJECT: "0" # no random bad-nonce rejections'
  echo '    networks: [edge, internal]'
  echo '    ports: ["127.0.0.1:15000:15000"]'
  echo '  caddy:'
  echo '    volumes:'
  echo '      - ./Caddyfile.pebble:/etc/caddy/Caddyfile:ro'
  echo '      - ./pebble.minica.pem:/pebble/minica.pem:ro'
  echo '  app:'
  echo '    environment:'
  echo '      NODE_EXTRA_CA_CERTS: /pebble/root.pem # the TLS probe trusts this run'"'"'s Pebble root'
  echo '    volumes:'
  echo '      - ./pebble-root.pem:/pebble/root.pem:ro'
} > "$work/deploy/compose.pebble.yaml"
with_pebble() { compose --file "$work/deploy/compose.pebble.yaml" "$@"; }
with_pebble up --detach pebble
for _ in $(seq 1 30); do
  curl -sfk https://127.0.0.1:15000/roots/0 -o "$work/deploy/pebble-root.pem" && break
  sleep 1
done
grep -q 'BEGIN CERTIFICATE' "$work/deploy/pebble-root.pem" || fail 'no Pebble root'
docker cp "${project}-pebble-1:/test/certs/pebble.minica.pem" "$work/deploy/pebble.minica.pem"
chmod 0644 "$work/deploy/pebble-root.pem" "$work/deploy/pebble.minica.pem"
# The shipped Caddyfile with Pebble as the CA, added to its global block.
awk '{ print } $0 == "{" && !done { print "\tacme_ca https://pebble:14000/dir"; print "\tacme_ca_root /pebble/minica.pem"; done = 1 }' \
  "$work/deploy/Caddyfile" > "$work/deploy/Caddyfile.pebble"
grep -q 'acme_ca https://pebble' "$work/deploy/Caddyfile.pebble" || fail 'Caddyfile.pebble not built'
printf 'PUBLIC_URL=https://%s\n' "$origin_host" >> "$work/deploy/.env"
with_pebble up --detach --wait --wait-timeout 180 --no-build
compose logs --no-color --no-log-prefix app | grep -q '"msg":"PUBLIC_URL freezes the origin"' ||
  fail 'the app did not read PUBLIC_URL'

# tls <name> [curl args...]: an HTTPS request for <name> to this host's :443, trusting only Pebble.
tls() {
  local name=$1
  shift
  curl -s -m 30 --cacert "$work/deploy/pebble-root.pem" --resolve "$name:443:127.0.0.1" "$@" \
    "https://$name/"
}
issued=false
for _ in $(seq 1 30); do
  if tls "$origin_host" -o /dev/null; then
    issued=true
    break
  fi
  sleep 2
done
$issued || fail "no valid certificate for $origin_host"
if command -v openssl > /dev/null; then
  openssl s_client -connect 127.0.0.1:443 -servername "$origin_host" < /dev/null 2> /dev/null |
    openssl x509 -noout -subject -issuer -ext subjectAltName
fi
# Pinned: the origin's Host reaches the app, which serves nothing public yet (404).
test "$(tls "$origin_host" -o /dev/null -w '%{http_code}')" = 404 || fail 'the origin Host is not served'
test "$(tls "$origin_host" -o /dev/null -w '%{http_code}' -H 'Host: evil.jury-forge.test')" = 421 ||
  fail 'another Host is not 421'
for path in readyz healthz metrics "api/internal/tls/allow?domain=$origin_host"; do
  code=$(curl -s -m 10 --cacert "$work/deploy/pebble-root.pem" --resolve "$origin_host:443:127.0.0.1" \
    -o /dev/null -w '%{http_code}' "https://$origin_host/$path")
  test "$code" = 404 || fail "/$path is reachable from outside ($code)"
done
status=0
tls other.jury-forge.test -o /dev/null || status=$?
test "$status" = 35 || fail "a certificate was served for another name (curl exit $status)"
compose logs --no-color --no-log-prefix app | grep '"decision":"other_name"' | grep -q other.jury-forge.test ||
  fail 'the app did not refuse the ask for another name'
reported=false
for _ in $(seq 1 30); do
  if readyz | grep -q '"state":"tls_issued"'; then
    reported=true
    break
  fi
  sleep 2
done
$reported || fail "/readyz does not report tls_issued: $(readyz)"
readyz
echo

echo 'OK: the bundle is healthy, its boundaries hold, and only the origin gets a certificate'
