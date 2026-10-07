import type { SetupCodeResponse, SetupState } from '@jury-forge/shared';

export type WizardStep = 'code' | 'install' | 'claim' | 'done';

export type WizardStepKey = 'code' | 'create' | 'install' | 'claim';

export type WizardStepStatus = 'done' | 'current' | 'pending';

export interface WizardStepView {
  key: WizardStepKey;
  label: string;
  status: WizardStepStatus;
}

const STEP_LABELS: Record<WizardStepKey, string> = {
  code: 'Setup code',
  create: 'Create the app',
  install: 'Install',
  claim: 'Claim',
};

const STEP_KEYS: WizardStepKey[] = ['code', 'create', 'install', 'claim'];

const CURRENT_INDEX: Record<WizardStep, number> = { code: 0, install: 2, claim: 3, done: 4 };

export function wizardStep(state: SetupState): WizardStep {
  if (state.claimed) {
    return 'done';
  }
  if (!state.appCreated) {
    return 'code';
  }
  if (!state.installed) {
    return 'install';
  }
  return 'claim';
}

export function wizardSteps(state: SetupState): WizardStepView[] {
  const current = CURRENT_INDEX[wizardStep(state)];
  return STEP_KEYS.map((key, index): WizardStepView => ({
    key,
    label: STEP_LABELS[key],
    status: index < current ? 'done' : index === current ? 'current' : 'pending',
  }));
}

export interface ManifestForm {
  action: string;
  fields: Record<string, string>;
}

export function manifestForm(response: SetupCodeResponse): ManifestForm {
  return {
    action: response.actionsUrl,
    fields: { manifest: JSON.stringify(response.manifest) },
  };
}

export function installUrl(appSlug: string): string {
  return `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`;
}

const SETUP_ERROR_MESSAGES: Record<string, string> = {
  invalid_code:
    'That code does not match the SETUP_CODE secret on this instance. Check the value with "npx wrangler secret put SETUP_CODE".',
  already_claimed: 'This instance is already claimed. Sign in to open the dashboard.',
  setup_code_unset:
    'This instance has no SETUP_CODE secret yet. Set it with "npx wrangler secret put SETUP_CODE" and reload.',
  encryption_key_unset:
    'This instance has no ENCRYPTION_KEY secret yet. Set it with "npx wrangler secret put ENCRYPTION_KEY" and reload.',
  setup_session_required:
    'The setup session expired or was lost. Re-enter the setup code to continue.',
  app_missing: 'No GitHub App is registered on this instance yet. Start from the setup code step.',
  installation_required:
    'Sign-in finished, but no installation exists yet. Install the app on your account, then try the claim again.',
  access_denied:
    "Your GitHub account cannot access this instance's installation. Sign in as the owner, or as a member of the organization the app is installed on.",
  invalid_state: 'That link expired or was already used. Start again from the setup code step.',
  invalid_request: 'The request was rejected. Try again.',
  request_failed: 'Something went wrong. Try again.',
};

export function setupErrorMessage(code: string): string {
  return SETUP_ERROR_MESSAGES[code] ?? SETUP_ERROR_MESSAGES.request_failed;
}
