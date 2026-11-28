#!/bin/sh
# Creates the Compose secret files in ./secrets (WP 1-13, WP 1-15a; deployment.md §7). Run it as
# root (sudo) from this directory: each file is owned by the container user that reads it, mode
# 0400, because Compose bind-mounts a file secret with its host owner and mode.
#   secrets/db_password   uid 70     the `postgres` user of the Alpine postgres image
#   secrets/database_url  uid 65532  the image's distroless `nonroot` user
#   secrets/master_key    uid 65532  32 random bytes in base64, one line (the KEK)
# It refuses to overwrite and prints fingerprints and the master key's id, never values. Back
# secrets/master_key up apart from the database. `jury-forge init` (WP 1-17) replaces this script.
set -eu

umask 077
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "init-secrets: run as root (sudo ./init-secrets.sh) so the files get the right owners" >&2
  exit 1
fi
for name in db_password database_url master_key; do
  if [ -e "secrets/$name" ]; then
    echo "init-secrets: secrets/$name exists; refusing to overwrite" >&2
    exit 1
  fi
done

mkdir -p secrets
chmod 0700 secrets

# 32 random bytes as hex: URL-safe, so it goes into the connection string unescaped.
password=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
if [ "${#password}" -ne 64 ]; then
  echo "init-secrets: could not read 32 random bytes" >&2
  exit 1
fi

printf '%s' "$password" > secrets/db_password
printf 'postgres://jury_forge:%s@postgres:5432/jury_forge' "$password" > secrets/database_url
unset password

# The master key: 32 random bytes, base64 on one line (44 characters).
head -c 32 /dev/urandom | base64 > secrets/master_key
if [ "$(tr -d '\n' < secrets/master_key | wc -c)" -ne 44 ]; then
  rm -f secrets/master_key
  echo "init-secrets: could not write the master key" >&2
  exit 1
fi

chown 70:70 secrets/db_password
chown 65532:65532 secrets/database_url secrets/master_key
chmod 0400 secrets/db_password secrets/database_url secrets/master_key

for name in db_password database_url master_key; do
  fingerprint=$(sha256sum "secrets/$name" | cut -c1-16)
  echo "init-secrets: wrote secrets/$name (sha256 $fingerprint…)"
done
# The same id the app logs and records with every wrapped key (crypto/master-key.ts).
key_id=$({ printf 'jury-forge/kek-id/v1\000'; base64 -d secrets/master_key; } | sha256sum | cut -c1-16)
echo "init-secrets: master key id k1-$key_id; back secrets/master_key up apart from the database"
