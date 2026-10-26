import { z } from 'zod';
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
  InstanceReadinessStepSchema,
  InstanceSettingsSchema,
  PackCreateResultSchema,
  PackDetailSchema,
  PackGrantInputSchema,
  PackGrantSchema,
  PackGrantScopeSchema,
  PackGrantsUpdateSchema,
  PackManifestSchema,
  PackPreviewRequestSchema,
  PackPreviewSchema,
  PackSummarySchema,
  PackVersionDetailSchema,
  PackVersionSummarySchema,
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
  ScopePreviewRequestSchema,
  ScopePreviewResponseSchema,
  RunAppliedPackSchema,
  RunDetailSchema,
  RunKnowledgeSummarySchema,
  RunModeSchema,
  RunNotAppliedPackSchema,
  RunReviewerKnowledgeSchema,
  RunReviewerOutcomeSchema,
  RunReviewerScopeSchema,
  RunReviewerStatusSchema,
  RunSkippedReviewerSchema,
  RunStatusSchema,
  RunSummarySchema,
  RunsPageSchema,
  SessionUserSchema,
  SettingsResponseSchema,
  SetupCodeResponseSchema,
  SetupStateSchema,
  TryRunRequestSchema,
  TryRunResponseSchema,
} from './schemas';

// Every contract type is inferred from its schema so the Worker and the dashboard share one
// source of truth. The inferred types are re-exported here to keep `@jury-forge/shared` imports
// unchanged.

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export type SessionUser = z.infer<typeof SessionUserSchema>;

export type SetupState = z.infer<typeof SetupStateSchema>;

export type AppManifest = z.infer<typeof AppManifestSchema>;

export type SetupCodeResponse = z.infer<typeof SetupCodeResponseSchema>;

export type InstallationInfo = z.infer<typeof InstallationInfoSchema>;

export type ProviderFlavor = z.infer<typeof ProviderFlavorSchema>;

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export type Finding = z.infer<typeof FindingSchema>;

export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;

export type Reviewer = z.infer<typeof ReviewerSchema>;

export type ReviewerExport = z.infer<typeof ReviewerExportSchema>;

export type ReviewersExportDocument = z.infer<typeof ReviewersExportDocumentSchema>;

export type ReviewersImportResult = z.infer<typeof ReviewersImportResultSchema>;

export type Repository = z.infer<typeof RepositorySchema>;

export type RepositoryReviewer = z.infer<typeof RepositoryReviewerSchema>;

export type RepositoryReviewerUpdate = z.infer<typeof RepositoryReviewerUpdateSchema>;

export type ScopePreviewRequest = z.infer<typeof ScopePreviewRequestSchema>;

export type ScopePreviewResponse = z.infer<typeof ScopePreviewResponseSchema>;

export type RunStatus = z.infer<typeof RunStatusSchema>;

export type RunMode = z.infer<typeof RunModeSchema>;

export type RunSummary = z.infer<typeof RunSummarySchema>;

export type RepositoryPullRequest = z.infer<typeof RepositoryPullRequestSchema>;

export type TryRunRequest = z.infer<typeof TryRunRequestSchema>;

export type TryRunResponse = z.infer<typeof TryRunResponseSchema>;

export type RunReviewerStatus = z.infer<typeof RunReviewerStatusSchema>;

export type RunReviewerOutcome = z.infer<typeof RunReviewerOutcomeSchema>;

export type RunReviewerScope = z.infer<typeof RunReviewerScopeSchema>;

export type RunSkippedReviewer = z.infer<typeof RunSkippedReviewerSchema>;

export type RunsPage = z.infer<typeof RunsPageSchema>;

export type RunDetail = z.infer<typeof RunDetailSchema>;

export type InstanceSettings = z.infer<typeof InstanceSettingsSchema>;

export type PackManifest = z.infer<typeof PackManifestSchema>;

export type PackVersionSummary = z.infer<typeof PackVersionSummarySchema>;

export type PackVersionDetail = z.infer<typeof PackVersionDetailSchema>;

export type PackSummary = z.infer<typeof PackSummarySchema>;

export type PackDetail = z.infer<typeof PackDetailSchema>;

export type PackGrant = z.infer<typeof PackGrantSchema>;

export type PackGrantScope = z.infer<typeof PackGrantScopeSchema>;

export type PackGrantInput = z.infer<typeof PackGrantInputSchema>;

export type RunAppliedPack = z.infer<typeof RunAppliedPackSchema>;

export type RunNotAppliedPack = z.infer<typeof RunNotAppliedPackSchema>;

export type PackGrantsUpdate = z.infer<typeof PackGrantsUpdateSchema>;

export type PackPreviewRequest = z.infer<typeof PackPreviewRequestSchema>;

export type PackPreview = z.infer<typeof PackPreviewSchema>;

export type PackCreateResult = z.infer<typeof PackCreateResultSchema>;

export type RunReviewerKnowledge = z.infer<typeof RunReviewerKnowledgeSchema>;

export type RunKnowledgeSummary = z.infer<typeof RunKnowledgeSummarySchema>;

export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

export type ActivityPage = z.infer<typeof ActivityPageSchema>;

export type InstanceReadinessStep = z.infer<typeof InstanceReadinessStepSchema>;

export type InstanceReadinessNextStep = z.infer<typeof InstanceReadinessNextStepSchema>;

export type InstanceReadiness = z.infer<typeof InstanceReadinessSchema>;
