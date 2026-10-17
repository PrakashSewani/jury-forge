import type { SessionUser, SetupState } from '@jury-forge/shared';
import type { ReactNode } from 'react';
import { handleAppLink } from '../lib/router';
import { Button, buttonClass, Panel } from '../ui';

function GatePanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Panel className="w-full max-w-md text-center">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-text-muted">{description}</p>
        <div className="flex justify-center">{action}</div>
      </Panel>
    </div>
  );
}

export function RouteGuard({
  user,
  setup,
  failed,
  onReload,
  children,
}: {
  user: SessionUser | null;
  setup: SetupState | null;
  failed: boolean;
  onReload: () => Promise<void>;
  children: ReactNode;
}) {
  if (setup === null) {
    if (failed) {
      return (
        <GatePanel
          action={<Button onClick={() => void onReload()}>Try again</Button>}
          description="The dashboard could not reach its API. Check the Worker and try again."
          title="The dashboard API did not respond"
        />
      );
    }
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-text-muted">Loading…</p>
      </div>
    );
  }
  if (!setup.claimed) {
    return (
      <GatePanel
        action={
          <a className={buttonClass} href="/setup" onClick={handleAppLink}>
            Start setup
          </a>
        }
        description="Register its GitHub App, install it, and claim the instance to start reviewing pull requests."
        title="This instance is not set up yet"
      />
    );
  }
  if (user === null) {
    return (
      <GatePanel
        action={
          <a className={buttonClass} href="/api/auth/github/start" onClick={handleAppLink}>
            Sign in with GitHub
          </a>
        }
        description="Use a GitHub account that can access this instance's app installation."
        title="Sign in"
      />
    );
  }
  return <>{children}</>;
}
