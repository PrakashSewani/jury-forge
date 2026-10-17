import type { SetupCodeResponse, SetupState } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';
import { routeFromPath } from '../src/lib/router';
import {
  installUrl,
  manifestForm,
  setupErrorMessage,
  wizardStep,
  wizardSteps,
} from '../src/lib/wizard';

function setupState(overrides: Partial<SetupState> = {}): SetupState {
  return {
    claimed: false,
    appCreated: false,
    installed: false,
    appSlug: null,
    ...overrides,
  };
}

describe('wizard step derivation', () => {
  it('starts at the code step on a fresh instance', () => {
    expect(wizardStep(setupState())).toBe('code');
  });

  it('moves to install once the app exists', () => {
    expect(wizardStep(setupState({ appCreated: true, appSlug: 'jury-forge-test' }))).toBe(
      'install',
    );
  });

  it('moves to claim once the installation is verified', () => {
    expect(
      wizardStep(setupState({ appCreated: true, appSlug: 'jury-forge-test', installed: true })),
    ).toBe('claim');
  });

  it('is done once claimed', () => {
    expect(
      wizardStep(
        setupState({
          appCreated: true,
          appSlug: 'jury-forge-test',
          installed: true,
          claimed: true,
        }),
      ),
    ).toBe('done');
  });
});

describe('wizard step views', () => {
  it('marks completed steps and the current step', () => {
    const steps = wizardSteps(setupState({ appCreated: true, appSlug: 'jury-forge-test' }));
    expect(steps.map((step) => step.key)).toEqual(['code', 'create', 'install', 'claim']);
    expect(steps.map((step) => step.status)).toEqual(['done', 'done', 'current', 'pending']);
  });

  it('marks every step done once claimed', () => {
    const steps = wizardSteps(
      setupState({ appCreated: true, appSlug: 'jury-forge-test', installed: true, claimed: true }),
    );
    expect(steps.every((step) => step.status === 'done')).toBe(true);
  });
});

describe('manifest form', () => {
  it('posts the manifest JSON to the actions URL', () => {
    const manifest: SetupCodeResponse['manifest'] = {
      name: 'Jury Forge',
      url: 'https://jury-forge.test',
      hook_attributes: { url: 'https://jury-forge.test/api/webhooks/github', active: true },
      redirect_url: 'https://jury-forge.test/api/setup/manifest/callback',
      callback_urls: ['https://jury-forge.test/api/auth/github/callback'],
      public: false,
      default_permissions: { contents: 'read', pull_requests: 'write' },
      default_events: ['pull_request'],
    };
    const response: SetupCodeResponse = {
      actionsUrl: 'https://github.com/settings/apps/new?state=state-token',
      state: 'state-token',
      manifest,
    };

    const form = manifestForm(response);

    expect(form.action).toBe(response.actionsUrl);
    expect(Object.keys(form.fields)).toEqual(['manifest']);
    expect(JSON.parse(form.fields.manifest)).toEqual(manifest);
  });
});

describe('install URL', () => {
  it('targets the app slug', () => {
    expect(installUrl('jury-forge-test')).toBe(
      'https://github.com/apps/jury-forge-test/installations/new',
    );
  });
});

describe('setup error messages', () => {
  it('maps known error codes', () => {
    expect(setupErrorMessage('invalid_code')).toContain('SETUP_CODE');
    expect(setupErrorMessage('setup_session_required')).toContain('expired');
    expect(setupErrorMessage('access_denied')).toContain('access');
  });

  it('falls back to a generic message', () => {
    expect(setupErrorMessage('something_unexpected')).toBe('Something went wrong. Try again.');
  });
});

describe('route resolution', () => {
  it('resolves the setup route', () => {
    expect(routeFromPath('/setup')).toBe('/setup');
    expect(routeFromPath('/setup/anything')).toBe('/setup');
  });

  it('falls back to home', () => {
    expect(routeFromPath('/')).toBe('/');
    expect(routeFromPath('/reviewers')).toBe('/');
  });
});
