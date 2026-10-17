import type { SetupState } from '@jury-forge/shared';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchSetupState, submitSetupCode, verifyInstallation } from '../lib/api';
import { submitManifestForm } from '../lib/manifest';
import { handleAppLink } from '../lib/router';
import type { WizardStepView } from '../lib/wizard';
import { installUrl, setupErrorMessage, wizardStep, wizardSteps } from '../lib/wizard';
import { Button, buttonClass, Card, Field, Input, Notice, secondaryButtonClass } from '../ui';
import { PageLoading } from './screen-state';

export default function SetupPage() {
  const [state, setState] = useState<SetupState | null>(null);
  const [failed, setFailed] = useState(false);
  const errorParam = new URLSearchParams(window.location.search).get('error');

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setState(await fetchSetupState());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Set up this instance</h1>
        <p className="text-sm text-text-muted">
          Register this instance&rsquo;s own private GitHub App, install it, and claim the instance
          — the app, its credentials, and your model keys all stay in your Cloudflare account.
        </p>
      </header>
      {state === null ? (
        <LoadingCard failed={failed} onRetry={load} />
      ) : (
        <WizardBody state={state} errorParam={errorParam} onRefresh={load} />
      )}
    </div>
  );
}

function WizardBody({
  state,
  errorParam,
  onRefresh,
}: {
  state: SetupState;
  errorParam: string | null;
  onRefresh: () => Promise<void>;
}) {
  const step = wizardStep(state);
  return (
    <>
      <StepIndicator steps={wizardSteps(state)} />
      {errorParam ? <Notice tone="error">{setupErrorMessage(errorParam)}</Notice> : null}
      {step === 'code' ? <CodeStep /> : null}
      {step === 'install' ? <InstallStep state={state} onRefresh={onRefresh} /> : null}
      {step === 'claim' ? <ClaimStep /> : null}
      {step === 'done' ? <DoneStep /> : null}
    </>
  );
}

function CodeStep() {
  const [code, setCode] = useState('');
  const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const orgValue = org.trim();
    try {
      const response = await submitSetupCode(code.trim(), orgValue === '' ? null : orgValue);
      setRedirecting(true);
      submitManifestForm(response);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? setupErrorMessage(reason.code)
          : setupErrorMessage('request_failed'),
      );
      setBusy(false);
    }
  }

  return (
    <Card title="Enter the setup code">
      <p className="text-sm text-text-muted">
        The code is the{' '}
        <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">SETUP_CODE</code> secret set
        when this instance was deployed. Next, GitHub opens with the app details prefilled — you
        review and create the app there.
      </p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field label="Setup code">
          <Input
            autoComplete="off"
            onChange={(event) => setCode(event.target.value)}
            placeholder="The SETUP_CODE secret"
            required
            type="password"
            value={code}
          />
        </Field>
        <Field
          hint="Create the app under an organization you administer instead of your personal account."
          label="Organization (optional)"
        >
          <Input
            autoComplete="off"
            onChange={(event) => setOrg(event.target.value)}
            placeholder="acme-inc"
            value={org}
          />
        </Field>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button busy={busy || redirecting} type="submit">
          {redirecting ? 'Redirecting to GitHub…' : busy ? 'Checking…' : 'Continue to GitHub'}
        </Button>
      </form>
    </Card>
  );
}

function InstallStep({ state, onRefresh }: { state: SetupState; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setBusy(true);
    setMissing(false);
    setError(null);
    try {
      const info = await verifyInstallation();
      if (info.installed) {
        await onRefresh();
      } else {
        setMissing(true);
      }
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? setupErrorMessage(reason.code)
          : setupErrorMessage('request_failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Install the app">
      <p className="text-sm text-text-muted">
        The GitHub App is registered. Install it on the account that should run reviews — a private
        app can only be installed by its owner (or members of the owning organization).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {state.appSlug ? (
          // An absolute GitHub URL: the router's `handleAppLink` only takes same-origin `/` paths, so
          // there is nothing to intercept here and the browser owns the click.
          <a className={buttonClass} href={installUrl(state.appSlug)}>
            Install {state.appSlug} on GitHub
          </a>
        ) : (
          <Notice tone="error">The app slug is missing. Restart setup from the code step.</Notice>
        )}
        <Button busy={busy} onClick={() => void handleVerify()} variant="secondary">
          {busy ? 'Checking…' : 'I have installed it — verify'}
        </Button>
      </div>
      {missing ? (
        <Notice tone="info">
          No installation found yet. Install the app first, then verify again.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Card>
  );
}

function ClaimStep() {
  return (
    <Card title="Claim the instance">
      <p className="text-sm text-text-muted">
        Sign in with GitHub to claim this instance. The first account that can access the
        app&rsquo;s installation becomes the owner; anyone GitHub grants installation access can
        sign in later.
      </p>
      <a className={buttonClass} href="/api/auth/github/start" onClick={handleAppLink}>
        Sign in with GitHub
      </a>
    </Card>
  );
}

function DoneStep() {
  return (
    <Card title="Setup complete">
      <p className="text-sm text-text-muted">
        This instance is claimed. Sign in with GitHub to open the dashboard.
      </p>
      <a className={buttonClass} href="/" onClick={handleAppLink}>
        Go to the dashboard
      </a>
    </Card>
  );
}

function StepIndicator({ steps }: { steps: WizardStepView[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step, index) => (
        <li className="flex items-center gap-2" key={step.key}>
          <span
            className={
              step.status === 'done'
                ? 'flex h-6 w-6 items-center justify-center rounded-full bg-accent text-text-inverse'
                : step.status === 'current'
                  ? 'flex h-6 w-6 items-center justify-center rounded-full border border-accent font-medium'
                  : 'flex h-6 w-6 items-center justify-center rounded-full border border-border-strong text-text-subtle'
            }
          >
            {step.status === 'done' ? '✓' : index + 1}
          </span>
          <span className={step.status === 'pending' ? 'text-text-subtle' : 'text-text-body'}>
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className="mx-1 h-px w-4 bg-border" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function LoadingCard({ failed, onRetry }: { failed: boolean; onRetry: () => Promise<void> }) {
  if (!failed) {
    return <PageLoading label="Checking setup state…" />;
  }
  return (
    <Card>
      <p className="text-sm text-text-body">The setup API did not respond.</p>
      <button className={secondaryButtonClass} onClick={() => void onRetry()} type="button">
        Try again
      </button>
    </Card>
  );
}
