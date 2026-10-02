CREATE TABLE github_app (
  app_id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  client_id TEXT NOT NULL,
  private_key_enc TEXT NOT NULL,
  webhook_secret_enc TEXT NOT NULL,
  client_secret_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE reviewers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',
  flavor TEXT NOT NULL CHECK (flavor IN ('openai', 'anthropic')),
  base_url TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  model TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE repositories (
  repo_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE reviewer_repositories (
  reviewer_id TEXT NOT NULL REFERENCES reviewers (id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repositories (repo_id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (reviewer_id, repo_id)
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  repo_id INTEGER NOT NULL,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  error TEXT,
  review_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  finished_at INTEGER
);

CREATE INDEX runs_repo_created_idx ON runs (repo_id, created_at DESC);

CREATE TABLE run_reviewers (
  run_id TEXT NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  findings_json TEXT,
  error TEXT,
  PRIMARY KEY (run_id, reviewer_id)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('login', 'claim', 'manifest')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

CREATE TABLE webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);
