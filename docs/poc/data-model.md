# PoC data model

Studied at `1cc22b7`. SQLite/D1, unix-second timestamps, prepared statements only, migrations
`0001`–`0009`.

## Tables

### Setup and identity

| Table          | Columns                                                                                       | Notes |
| -------------- | --------------------------------------------------------------------------------------------- | ----- |
| `instance_meta` | `key` PK, `value`                                                                             | Singleton key/value: `claimed_at`, `owner_login`, `owner_id`, `owner_type`, `installation_id`, `app_slug`, install account, setup session hash/expiry. |
| `github_app`   | `app_id` PK, `slug`, `client_id`, `private_key_enc`, `webhook_secret_enc`, `client_secret_enc`, `created_at` | One row per instance. Secrets encrypted with the key ring. |
| `sessions`     | `token_hash` PK, `login`, `avatar_url`, `created_at`, `expires_at`                            | 32-byte token, SHA-256 stored; 7-day TTL; expired rows pruned on create. |
| `oauth_states` | `state` PK, `kind` (`login`/`claim`/`manifest`), `created_at`, `expires_at`                    | Single-use; consumed on callback. |

### Review configuration

| Table                   | Columns                                                                                                      | Notes |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| `reviewers`             | `id` PK, `name`, `instructions`, `rules`, `flavor` (`openai`/`anthropic`), `base_url`, `api_key_enc`, `model`, `params_json`, `enabled`, `created_at`, `updated_at` | No unique name constraint. Key is write-only to the API. |
| `repositories`          | `repo_id` PK, `full_name`, `private`, `enabled`, `added_at`                                                   | Synced from the installation; new rows arrive disabled. No unique `full_name`. |
| `reviewer_repositories` | `reviewer_id` + `repo_id` PK, `enabled`, `paths_include`, `paths_exclude`, `context_paths` (JSON arrays)       | Opt-out selection and scope. FK cascade. |
| `instance_settings`     | `key` PK, `value`, `updated_at`                                                                              | Typed, bounded, validated on read; invalid rows fall back to defaults. |
| `packs`                 | `id` PK, `slug` UNIQUE, `name`, `created_at`, `updated_at`                                                    | Stable slug. |
| `pack_versions`         | `id` PK, `pack_id`, `hash`, `manifest_path`, `manifest_json`, `body`, `raw_manifest`, `manifest_bytes`, `docs_bytes`, `total_bytes`, `file_count`, `created_at`, `created_by`, UNIQUE(`pack_id`,`hash`) | Immutable; no update/delete API. |
| `pack_files`            | `version_id` + `path` PK, `bytes`, `text`, `never_quote`                                                       | Only manifest and `docs/` are stored. |
| `pack_grants`           | `id` PK, `pack_id`, `scope` (`global`/`repository`/`reviewer`), `target_id`, `precedence` 0–1000, `enabled`, timestamps, UNIQUE(`pack_id`,`scope`,`target_id`) | Instance configuration; no FK on `target_id`; reviewer delete cleans grants. |

### History and audit

| Table                 | Columns                                                                                                                       | Notes |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----- |
| `runs`                | `id` PK, `delivery_id`, `repo_id`, `pr_number`, `head_sha`, `event`, `mode` (`auto`/`manual`), `status`, `error`, `review_url`, `files_json`, `scope_skip_json`, `knowledge_json`, `created_at`, `finished_at` | Index `runs(repo_id, created_at DESC)`. |
| `run_reviewers`       | `run_id` + `reviewer_id` PK, `status`, `findings_json`, `summary`, `usage_json`, `scope_json`, `knowledge_json`, `error`          | One row per reviewer per run. No FK on `reviewer_id`, so history survives reviewer deletion. |
| `activity_log`        | `id` INTEGER PK AUTOINCREMENT, `at`, `actor`, `action`, `target`, `detail`                                                     | Index `(at DESC, id DESC)`; 90-day pruning on read. |
| `webhook_deliveries`  | `delivery_id` PK, `received_at`                                                                                                | De-duplication; 7-day pruning on webhook. |

## Relationships

```
instance_meta (singleton)     github_app (singleton)
        │
        └── installation_id ── repositories ──< reviewer_repositories >── reviewers
                                                                          │
packs ──< pack_versions ──< pack_files                                    │
  │                                                                       │
  └──< pack_grants (global | repository | reviewer)                       │
                                                                          │
runs ──< run_reviewers >──────────────────────────────────────────────────┘
  │
  └── activity_log (loose, by actor/action/target strings)
```

## Encryption

- `product/worker/lib/crypto.ts` wraps WebCrypto AES-256-GCM.
- Ciphertext format: `v2.<keyVersion>.<iv>.<ciphertext>` (base64url). Legacy
  `v1.<iv>.<ciphertext>` is still readable.
- Key ring: current key + optional previous key, each with a version label. `encryptSecret` always
  writes the current key; `decryptSecret` selects by version; legacy values are tried with current
  then previous.
- Encrypted at rest: GitHub App private key, webhook secret, client secret; reviewer API keys.
- Decryption happens in memory immediately before use. API keys are never returned; responses
  expose only `hasApiKey`.
- Rotation is manual: update the four secrets, deploy, lazily re-wrap reviewer keys on their next
  update. GitHub App credentials have no partial-update path, so they require re-registering the
  app before dropping the previous key.
- `apiKeyFromReviewerId` copies another reviewer's ciphertext verbatim; the plaintext is never
  decrypted. The UI offers this as "reuse the key stored on …".

## Data volumes and retention

- Runs are kept forever. The PoC's position: D1 rows are small; revisit only if it matters.
- Activity is pruned at 90 days.
- Webhook deliveries are pruned at 7 days.
- Sessions and OAuth states are pruned on access.
- Pack versions are immutable and never deleted by the API.
- DO storage is transient per run and mostly deleted on finish, except `payload` and `finished`.

## Data-model flaws worth carrying into the redesign

1. No uniqueness on reviewer names or repository full names.
2. No FK from `pack_grants.target_id` to the target; orphan grants are possible outside the
   reviewer-delete path.
3. No FK from `run_reviewers.reviewer_id` to `reviewers`; history is intentionally durable, but
   there is no snapshot of the reviewer's name/instructions used for that run.
4. `runs` has no `started_at`, `heartbeat_at`, `attempt`, `lease`, or `canceled_at`; a stuck run
   is indistinguishable from a slow one.
5. No idempotency key for the posted review, so a retry after a successful post can duplicate it.
6. Byte counts are stored, not token counts; there is no model-aware budget record.
7. No per-run cost record beyond provider token usage; no price table or budget guard.
8. No soft delete, no export of full instance data, no retention policy for code-bearing rows.
9. `activity_log` is best-effort and mutable by omission; it is not a compliance audit log.
10. D1/SQLite choices rule out full-text search, JSONB queries, vector indexes, and strong
    transactional workflows across services.
