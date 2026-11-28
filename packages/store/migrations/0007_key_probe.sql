-- Up Migration
--
-- The master-key probe (first-run-setup Stage 0; WP 1-15a): one `secrets` row per org, sealed
-- under the master key with a known plaintext. `app` and `worker` open it at start and refuse to
-- run if it does not open, with `encryption_key_mismatch`, so a wrong or rotated-away key file is
-- caught before any real secret is read. Expand-only: the kind check is widened, never narrowed.

alter table secrets drop constraint secrets_kind_check;
alter table secrets add constraint secrets_kind_check check (
  kind in (
    'github_app_private_key',
    'github_client_secret',
    'github_webhook_secret',
    'provider_api_key',
    'receipt_signing_key',
    'key_probe'
  )
);

-- At most one probe per org, so `app` and `worker` starting together cannot write two.
create unique index secrets_one_key_probe_per_org on secrets (org_id) where kind = 'key_probe';

-- Down Migration

drop index secrets_one_key_probe_per_org;
delete from secrets where kind = 'key_probe';
alter table secrets drop constraint secrets_kind_check;
alter table secrets add constraint secrets_kind_check check (
  kind in (
    'github_app_private_key',
    'github_client_secret',
    'github_webhook_secret',
    'provider_api_key',
    'receipt_signing_key'
  )
);
