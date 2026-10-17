import { describe, expect, it } from 'vitest';
import {
  ActivityEntrySchema,
  ActivityPageSchema,
  AppManifestSchema,
  FindingSchema,
  FindingSeveritySchema,
  HealthResponseSchema,
  InstallationInfoSchema,
  InstanceReadinessNextStepSchema,
  InstanceReadinessSchema,
  InstanceReadinessStepKeySchema,
  InstanceReadinessStepSchema,
  InstanceSettingsSchema,
  ProviderFlavorSchema,
  ProviderUsageSchema,
  RepositoryPullRequestSchema,
  RepositoryReviewerSchema,
  RepositoryReviewerUpdateSchema,
  RepositorySchema,
  ReviewerExportSchema,
  ReviewerSchema,
  ReviewersExportDocumentSchema,
  ReviewersImportResultSchema,
  RunDetailSchema,
  RunModeSchema,
  RunReviewerOutcomeSchema,
  RunReviewerStatusSchema,
  RunStatusSchema,
  RunSummarySchema,
  RunsPageSchema,
  SessionUserSchema,
  SettingsResponseSchema,
  SetupCodeResponseSchema,
  SetupStateSchema,
  TryRunRequestSchema,
  TryRunResponseSchema,
} from '@jury-forge/shared';

interface Parseable {
  safeParse: (value: unknown) => { success: boolean };
}

const manifest = {
  name: 'Jury Forge',
  url: 'https://jury.test',
  hook_attributes: { url: 'https://jury.test/api/webhooks/github', active: true },
  redirect_url: 'https://jury.test/api/setup/manifest/callback',
  callback_urls: ['https://jury.test/api/auth/github/callback'],
  public: false,
  default_permissions: { contents: 'read', pull_requests: 'write' },
  default_events: ['pull_request'],
};

const reviewerExport = {
  name: 'Security',
  instructions: 'Hunt for injection bugs.',
  rules: 'Block on leaked secrets.',
  flavor: 'openai',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-5',
  params: { temperature: 0.2 },
  enabled: true,
};

const reviewer = {
  ...reviewerExport,
  id: 'rev-1',
  hasApiKey: true,
  repositories: ['octocat/hello'],
};

const runSummary = {
  id: 'run-1',
  repoId: 1,
  prNumber: 2,
  headSha: 'abc123',
  event: 'opened',
  status: 'completed',
  mode: 'auto',
  error: null,
  reviewUrl: 'https://github.com/octocat/hello/pull/2',
  createdAt: 1,
  finishedAt: 2,
};

const settings = {
  inlineCommentsPerReviewer: 10,
  inlineCommentsPerRun: 25,
  contextTotalBytes: 200_000,
  contextFileBytes: 32_000,
  descriptionLimit: 4_096,
  blockingMode: false,
  blockingErrorThreshold: 1,
  repoInstructions: false,
  repoInstructionsMaxBytes: 8_000,
};

const readinessStep = { key: 'claim', label: 'Instance claimed', href: '/setup', done: false };

const readinessNextStep = {
  key: 'done',
  title: 'Your jury is ready',
  body: 'Send a pull request.',
  href: '/runs',
  label: 'View runs',
};

// One row per schema: `[name, schema, valid payload, drifted payload]`. Every drifted payload is
// missing, renamed or mistyped relative to the valid one, so the schema must reject it.
const cases: Array<[string, Parseable, unknown, unknown]> = [
  ['ProviderFlavorSchema', ProviderFlavorSchema, 'openai', 'gemini'],
  ['FindingSeveritySchema', FindingSeveritySchema, 'warning', 'loud'],
  [
    'FindingSchema',
    FindingSchema,
    {
      file: 'a.ts',
      line: 3,
      startLine: 2,
      severity: 'warning',
      title: 't',
      body: 'b',
    },
    { file: 'a.ts', severity: 'warning', title: 't' },
  ],
  [
    'ProviderUsageSchema',
    ProviderUsageSchema,
    { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    { promptTokens: 1, completionTokens: 2 },
  ],
  ['RunStatusSchema', RunStatusSchema, 'running', 'paused'],
  ['RunModeSchema', RunModeSchema, 'manual', 'scheduled'],
  [
    'HealthResponseSchema',
    HealthResponseSchema,
    { ok: true, name: 'Jury Forge' },
    { ok: 'yes', name: 'Jury Forge' },
  ],
  [
    'SessionUserSchema',
    SessionUserSchema,
    { login: 'octocat', avatarUrl: null },
    { login: 'octocat' },
  ],
  [
    'AppManifestSchema',
    AppManifestSchema,
    manifest,
    {
      name: manifest.name,
      url: manifest.url,
      hook_attributes: manifest.hook_attributes,
      redirect_url: manifest.redirect_url,
      callback_urls: manifest.callback_urls,
      public: manifest.public,
      default_permissions: manifest.default_permissions,
    },
  ],
  [
    'SetupStateSchema',
    SetupStateSchema,
    { claimed: false, appCreated: false, installed: false, appSlug: null },
    { claimed: false, appCreated: false, installed: false, slug: null },
  ],
  [
    'SetupCodeResponseSchema',
    SetupCodeResponseSchema,
    { actionsUrl: 'https://github.com/settings/apps/new?state=s', state: 's', manifest },
    { actionsUrl: 'https://github.com/settings/apps/new?state=s', state: 's' },
  ],
  [
    'InstallationInfoSchema',
    InstallationInfoSchema,
    { installed: true, account: { login: 'octocat', type: 'org' } },
    { installed: true, account: { login: 'octocat', type: 'team' } },
  ],
  [
    'ReviewerSchema',
    ReviewerSchema,
    reviewer,
    {
      id: reviewer.id,
      name: reviewer.name,
      instructions: reviewer.instructions,
      rules: reviewer.rules,
      flavor: reviewer.flavor,
      baseUrl: reviewer.baseUrl,
      model: reviewer.model,
      params: reviewer.params,
      enabled: reviewer.enabled,
      repositories: reviewer.repositories,
    },
  ],
  [
    'ReviewerExportSchema',
    ReviewerExportSchema,
    reviewerExport,
    {
      name: reviewerExport.name,
      instructions: reviewerExport.instructions,
      rules: reviewerExport.rules,
      flavor: reviewerExport.flavor,
      baseUrl: reviewerExport.baseUrl,
      model: reviewerExport.model,
      params: reviewerExport.params,
    },
  ],
  [
    'ReviewersExportDocumentSchema',
    ReviewersExportDocumentSchema,
    { version: 1, exportedAt: 1, reviewers: [reviewerExport] },
    { version: 1, reviewers: [reviewerExport] },
  ],
  [
    'ReviewersImportResultSchema',
    ReviewersImportResultSchema,
    { created: 0, updated: 0, unchanged: 1, skipped: 0 },
    { created: 0, updated: 0, unchanged: 1 },
  ],
  [
    'RepositorySchema',
    RepositorySchema,
    { repoId: 1, fullName: 'octocat/hello', private: false, enabled: true },
    { repoId: 1, fullName: 'octocat/hello', private: 0, enabled: true },
  ],
  [
    'RepositoryReviewerSchema',
    RepositoryReviewerSchema,
    { reviewerId: 'rev-1', name: 'Security', enabled: true },
    { reviewerId: 'rev-1', enabled: true },
  ],
  [
    'RepositoryReviewerUpdateSchema',
    RepositoryReviewerUpdateSchema,
    { reviewerId: 'rev-1', enabled: false },
    { reviewerId: 'rev-1', enabled: 'yes' },
  ],
  [
    'RepositoryPullRequestSchema',
    RepositoryPullRequestSchema,
    { number: 2, title: 't', headSha: 'abc', authorLogin: null, draft: false },
    { number: 2, title: 't', headSha: 'abc', authorLogin: null },
  ],
  [
    'RunSummarySchema',
    RunSummarySchema,
    runSummary,
    {
      id: runSummary.id,
      repoId: runSummary.repoId,
      prNumber: runSummary.prNumber,
      headSha: runSummary.headSha,
      event: runSummary.event,
      status: runSummary.status,
      error: runSummary.error,
      reviewUrl: runSummary.reviewUrl,
      createdAt: runSummary.createdAt,
      finishedAt: runSummary.finishedAt,
    },
  ],
  [
    'RunsPageSchema',
    RunsPageSchema,
    { runs: [runSummary], nextCursor: null },
    { runs: [runSummary] },
  ],
  ['RunReviewerStatusSchema', RunReviewerStatusSchema, 'pending', 'running'],
  [
    'RunReviewerOutcomeSchema',
    RunReviewerOutcomeSchema,
    {
      reviewerId: 'rev-1',
      status: 'completed',
      findings: null,
      summary: null,
      usage: null,
      error: null,
    },
    {
      reviewerId: 'rev-1',
      status: 'running',
      findings: null,
      summary: null,
      usage: null,
      error: null,
    },
  ],
  ['RunDetailSchema', RunDetailSchema, { run: runSummary, reviewers: [] }, { reviewers: [] }],
  [
    'TryRunRequestSchema',
    TryRunRequestSchema,
    { repoId: 1, prNumber: 2, reviewerIds: ['rev-1'] },
    { repoId: 1, prNumber: 2 },
  ],
  ['TryRunResponseSchema', TryRunResponseSchema, { runId: 'run-1' }, { run_id: 'run-1' }],
  [
    'InstanceSettingsSchema',
    InstanceSettingsSchema,
    settings,
    {
      inlineCommentsPerReviewer: settings.inlineCommentsPerReviewer,
      inlineCommentsPerRun: settings.inlineCommentsPerRun,
      contextTotalBytes: settings.contextTotalBytes,
      contextFileBytes: settings.contextFileBytes,
      descriptionLimit: settings.descriptionLimit,
      blockingErrorThreshold: settings.blockingErrorThreshold,
      repoInstructions: settings.repoInstructions,
      repoInstructionsMaxBytes: settings.repoInstructionsMaxBytes,
    },
  ],
  [
    'SettingsResponseSchema',
    SettingsResponseSchema,
    { settings, defaults: settings },
    { settings },
  ],
  [
    'ActivityEntrySchema',
    ActivityEntrySchema,
    { id: 1, at: 2, actor: 'octocat', action: 'sign_in', target: null, detail: null },
    { id: 1, at: 2, actor: 'octocat', action: 'sign_in', detail: null },
  ],
  ['ActivityPageSchema', ActivityPageSchema, { activity: [], nextCursor: null }, { activity: [] }],
  ['InstanceReadinessStepKeySchema', InstanceReadinessStepKeySchema, 'claim', 'deploy'],
  [
    'InstanceReadinessStepSchema',
    InstanceReadinessStepSchema,
    readinessStep,
    { key: 'claim', label: 'Instance claimed', href: '/setup', done: 'no' },
  ],
  [
    'InstanceReadinessNextStepSchema',
    InstanceReadinessNextStepSchema,
    readinessNextStep,
    { ...readinessNextStep, key: 'deploy' },
  ],
  [
    'InstanceReadinessSchema',
    InstanceReadinessSchema,
    {
      claimed: true,
      appInstalled: true,
      reposEnabled: 1,
      reviewersWithKey: 1,
      repoReviewerPairs: 1,
      firstRunAt: null,
      completed: 4,
      total: 5,
      steps: [readinessStep],
      nextStep: readinessNextStep,
    },
    {
      claimed: true,
      appInstalled: true,
      reposEnabled: 1,
      reviewersWithKey: 1,
      repoReviewerPairs: 1,
      firstRunAt: null,
      completed: 4,
      steps: [readinessStep],
      nextStep: readinessNextStep,
    },
  ],
];

describe('shared contract schemas', () => {
  it.each(cases)('%s parses a valid payload', (_name, schema, valid) => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it.each(cases)('%s rejects a drifted payload', (_name, schema, _valid, drifted) => {
    expect(schema.safeParse(drifted).success).toBe(false);
  });
});
