import type { SessionUser, SetupState } from '@jury-forge/shared';
import { PRODUCT_TAGLINE } from '@jury-forge/shared';
import { useCallback, useEffect, useState } from 'react';
import { buttonClass, Card, secondaryButtonClass } from '../components';
import { fetchSession, fetchSetupState, logOut } from '../lib/api';

interface HomeData {
  user: SessionUser | null;
  setup: SetupState;
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [user, setup] = await Promise.all([fetchSession(), fetchSetupState()]);
      setData({ user, setup });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLogout() {
    setBusy(true);
    try {
      await logOut();
    } catch {
      // Reload the state either way — if the session is already gone, the reload shows that.
    }
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{PRODUCT_TAGLINE}</h1>
      </header>
      {data === null ? (
        failed ? (
          <Card>
            <p className="text-sm text-neutral-600">The dashboard API did not respond.</p>
            <button className={secondaryButtonClass} onClick={() => void load()} type="button">
              Try again
            </button>
          </Card>
        ) : (
          <p className="text-sm text-neutral-500">Loading…</p>
        )
      ) : !data.setup.claimed ? (
        <Card title="This instance is not set up yet">
          <p className="text-sm text-neutral-500">
            Register its GitHub App, install it, and claim the instance to start reviewing pull
            requests.
          </p>
          <a className={buttonClass} href="/setup">
            Start setup
          </a>
        </Card>
      ) : data.user === null ? (
        <Card title="Sign in">
          <p className="text-sm text-neutral-500">
            Use a GitHub account that can access this instance&rsquo;s app installation.
          </p>
          <a className={buttonClass} href="/api/auth/github/start">
            Sign in with GitHub
          </a>
        </Card>
      ) : (
        <Card title={`Signed in as ${data.user.login}`}>
          <div className="flex items-center gap-3">
            {data.user.avatarUrl ? (
              <img alt="" className="h-8 w-8 rounded-full" src={data.user.avatarUrl} />
            ) : null}
            <p className="text-sm text-neutral-500">
              Reviewers, repositories, and runs arrive in the next slices of phase 2.
            </p>
          </div>
          <button
            className={secondaryButtonClass}
            disabled={busy}
            onClick={() => void handleLogout()}
            type="button"
          >
            Log out
          </button>
        </Card>
      )}
    </div>
  );
}
