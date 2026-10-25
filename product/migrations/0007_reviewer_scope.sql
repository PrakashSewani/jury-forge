ALTER TABLE reviewer_repositories ADD COLUMN paths_include TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reviewer_repositories ADD COLUMN paths_exclude TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reviewer_repositories ADD COLUMN context_paths TEXT NOT NULL DEFAULT '[]';
