export interface SessionUser {
  login: string;
  avatarUrl: string | null;
}

export interface SetupState {
  claimed: boolean;
  appCreated: boolean;
  installed: boolean;
  appSlug: string | null;
}

export interface AppManifest {
  name: string;
  url: string;
  hook_attributes: { url: string; active: boolean };
  redirect_url: string;
  callback_urls: string[];
  public: boolean;
  default_permissions: Record<string, string>;
  default_events: string[];
}

export interface SetupCodeResponse {
  actionsUrl: string;
  state: string;
  manifest: AppManifest;
}

export interface InstallationInfo {
  installed: boolean;
  account: { login: string; type: 'user' | 'org' } | null;
}

export type ProviderFlavor = 'openai' | 'anthropic';

export type FindingSeverity = 'info' | 'warning' | 'error';

export interface Finding {
  file: string;
  line?: number;
  severity: FindingSeverity;
  title: string;
  body: string;
}

export interface Reviewer {
  id: string;
  name: string;
  instructions: string;
  rules: string;
  flavor: ProviderFlavor;
  baseUrl: string;
  model: string;
  params: Record<string, unknown>;
  enabled: boolean;
  hasApiKey: boolean;
}

export interface Repository {
  repoId: number;
  fullName: string;
  private: boolean;
  enabled: boolean;
}

export interface RepositoryReviewer {
  reviewerId: string;
  name: string;
  enabled: boolean;
}

export interface RepositoryReviewerUpdate {
  reviewerId: string;
  enabled: boolean;
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'skipped';

export interface RunSummary {
  id: string;
  repoId: number;
  prNumber: number;
  headSha: string;
  event: string;
  status: RunStatus;
  error: string | null;
  reviewUrl: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export type RunReviewerStatus = 'pending' | 'completed' | 'failed';

export interface RunReviewerOutcome {
  reviewerId: string;
  status: RunReviewerStatus;
  findings: Finding[] | null;
  error: string | null;
}

export interface RunsPage {
  runs: RunSummary[];
  nextCursor: string | null;
}

export interface RunDetail {
  run: RunSummary;
  reviewers: RunReviewerOutcome[];
}
