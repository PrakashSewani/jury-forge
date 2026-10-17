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
  startLine?: number;
  severity: FindingSeverity;
  title: string;
  body: string;
}

export interface ProviderUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
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
  // full names of the enabled repositories this reviewer will actually run on
  repositories: string[];
}

export interface ReviewerExport {
  name: string;
  instructions: string;
  rules: string;
  flavor: ProviderFlavor;
  baseUrl: string;
  model: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface ReviewersExportDocument {
  version: number; // 1
  exportedAt: number;
  reviewers: ReviewerExport[];
}

export interface ReviewersImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
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

export type RunMode = 'auto' | 'manual';

export interface RunSummary {
  id: string;
  repoId: number;
  prNumber: number;
  headSha: string;
  event: string;
  status: RunStatus;
  mode: RunMode;
  error: string | null;
  reviewUrl: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface RepositoryPullRequest {
  number: number;
  title: string;
  headSha: string;
  authorLogin: string | null;
  draft: boolean;
}

export interface TryRunRequest {
  repoId: number;
  prNumber: number;
  reviewerIds: string[];
}

export interface TryRunResponse {
  runId: string;
}

export type RunReviewerStatus = 'pending' | 'completed' | 'failed';

export interface RunReviewerOutcome {
  reviewerId: string;
  status: RunReviewerStatus;
  findings: Finding[] | null;
  summary: string | null;
  usage: ProviderUsage | null;
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

export interface InstanceSettings {
  inlineCommentsPerReviewer: number;
  inlineCommentsPerRun: number;
  contextTotalBytes: number;
  contextFileBytes: number;
  descriptionLimit: number;
  blockingMode: boolean;
  blockingErrorThreshold: number;
  repoInstructions: boolean;
  repoInstructionsMaxBytes: number;
}

export interface SettingsResponse {
  settings: InstanceSettings;
  defaults: InstanceSettings;
}

export interface ActivityEntry {
  id: number;
  at: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
}

export interface ActivityPage {
  activity: ActivityEntry[];
  nextCursor: string | null;
}

export interface InstanceReadinessStep {
  key: 'claim' | 'install-app' | 'enable-repo' | 'add-reviewer' | 'first-run';
  label: string;
  href: string;
  done: boolean;
}

export interface InstanceReadinessNextStep {
  key: InstanceReadinessStep['key'] | 'done';
  title: string;
  body: string;
  href: string;
  label: string;
}

export interface InstanceReadiness {
  claimed: boolean;
  appInstalled: boolean;
  reposEnabled: number;
  reviewersWithKey: number;
  repoReviewerPairs: number;
  firstRunAt: number | null;
  completed: number;
  total: number;
  steps: InstanceReadinessStep[];
  nextStep: InstanceReadinessNextStep;
}
