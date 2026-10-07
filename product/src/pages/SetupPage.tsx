import type { SetupState } from '@jury-forge/shared';
import type { FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buttonClass, Card, inputClass, Notice, secondaryButtonClass } from '../components';
import { ApiError, fetchSetupState, submitSetupCode, verifyInstallation } from '../lib/api';
import { submitManifestForm } from '../lib/manifest';
import type { WizardStepView } from '../lib/wizard';
import { installUrl, setupErrorMessage, wizardStep, wizardSteps } from '../lib/wizard';

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
        <p className="text-sm text-neutral-500">
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
      <p className="text-sm text-neutral-500">
        The code is the{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">SETUP_CODE</code> secret set
        when this instance was deployed. Next, GitHub opens with the app details prefilled — you
        review and create the app there.
      </p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <Field label="Setup code">
          <input
            autoComplete="off"
            className={inputClass}
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
          <input
            autoComplete="off"
            className={inputClass}
            onChange={(event) => setOrg(event.target.value)}
            placeholder="acme-inc"
            value={org}
          />
        </Field>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <button className={buttonClass} disabled={busy || redirecting} type="submit">
          {redirecting ? 'Redirecting to GitHub…' : busy ? 'Checking…' : 'Continue to GitHub'}
        </button>
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
      <p className="text-sm text-neutral-500">
        The GitHub App is registered. Install it on the account that should run reviews — a private
        app can only be installed by its owner (or members of the owning organization).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {state.appSlug ? (
          <a className={buttonClass} href={installUrl(state.appSlug)}>
            Install {state.appSlug} on GitHub
          </a>
        ) : (
          <Notice tone="error">The app slug is missing. Restart setup from the code step.</Notice>
        )}
        <button
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => void handleVerify()}
          type="button"
        >
          {busy ? 'Checking…' : 'I have installed it — verify'}
        </button>
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
      <p className="text-sm text-neutral-500">
        Sign in with GitHub to claim this instance. The first account that can access the
        app&rsquo;s installation becomes the owner; anyone GitHub grants installation access can
        sign in later.
      </p>
      <a className={buttonClass} href="/api/auth/github/start">
        Sign in with GitHub
      </a>
    </Card>
  );
}

function DoneStep() {
  return (
    <Card title="Setup complete">
      <p className="text-sm text-neutral-500">
        This instance is claimed. Sign in with GitHub to open the dashboard.
      </p>
      <a className={buttonClass} href="/">
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
                ? 'flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white'
                : step.status === 'current'
                  ? 'flex h-6 w-6 items-center justify-center rounded-full border border-neutral-900 font-medium'
                  : 'flex h-6 w-6 items-center justify-center rounded-full border border-neutral-300 text-neutral-400'
            }
          >
            {step.status === 'done' ? '✓' : index + 1}
          </span>
          <span className={step.status === 'pending' ? 'text-neutral-400' : 'text-neutral-700'}>
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className="mx-1 h-px w-4 bg-neutral-200" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

function LoadingCard({ failed, onRetry }: { failed: boolean; onRetry: () => Promise<void> }) {
  if (!failed) {
    return <p className="text-sm text-neutral-500">Checking setup state…</p>;
  }
  return (
    <Card>
      <p className="text-sm text-neutral-600">The setup API did not respond.</p>
      <button className={secondaryButtonClass} onClick={() => void onRetry()} type="button">
        Try again
      </button>
    </Card>
  );
}
