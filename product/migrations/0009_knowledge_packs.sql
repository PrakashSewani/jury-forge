CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE pack_versions (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES packs (id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  body TEXT NOT NULL,
  raw_manifest TEXT NOT NULL,
  manifest_bytes INTEGER NOT NULL,
  docs_bytes INTEGER NOT NULL,
  total_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT,
  UNIQUE (pack_id, hash)
);

CREATE INDEX pack_versions_latest_idx ON pack_versions (pack_id, created_at DESC, id DESC);

CREATE TABLE pack_files (
  version_id TEXT NOT NULL REFERENCES pack_versions (id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  text TEXT NOT NULL,
  never_quote INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, path)
);

CREATE TABLE pack_grants (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL REFERENCES packs (id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'repository', 'reviewer')),
  target_id TEXT NOT NULL DEFAULT '',
  precedence INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (pack_id, scope, target_id),
  CHECK ((scope = 'global' AND target_id = '') OR (scope != 'global' AND target_id != ''))
);

CREATE INDEX pack_grants_target_idx ON pack_grants (scope, target_id);

ALTER TABLE runs ADD COLUMN knowledge_json TEXT NOT NULL DEFAULT '{"packs":[],"totalBytes":0}';
ALTER TABLE run_reviewers ADD COLUMN knowledge_json TEXT;
