import type { SessionUser, SetupState } from '@jury-forge/shared';
import { PRODUCT_NAME } from '@jury-forge/shared';
import { useCallback, useEffect, useState } from 'react';
import { buttonClass, Card } from './components';
import { fetchSession, fetchSetupState, logOut } from './lib/api';
import type { Route } from './lib/router';
import { routeFromPath } from './lib/router';
import HomePage from './pages/HomePage';
import RepositoriesPage from './pages/RepositoriesPage';
import ReviewerEditorPage from './pages/ReviewerEditorPage';
import ReviewersPage from './pages/ReviewersPage';
import RunDetailPage from './pages/RunDetailPage';
import RunsPage from './pages/RunsPage';
import SetupPage from './pages/SetupPage';

interface Shell {
  user: SessionUser | null;
  setup: SetupState;
}

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/reviewers', label: 'Reviewers' },
  { href: '/repositories', label: 'Repositories' },
  { href: '/runs', label: 'Runs' },
];

export default function App() {
  const route = routeFromPath(window.location.pathname);
  const [shell, setShell] = useState<Shell | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [user, setup] = await Promise.all([fetchSession(), fetchSetupState()]);
      setShell({ user, setup });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUnauthorized = () => {
      void load();
    };
    window.addEventListener('jf:unauthorized', onUnauthorized);
    return () => window.removeEventListener('jf:unauthorized', onUnauthorized);
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
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-6">
            <a className="text-sm font-semibold tracking-tight" href="/">
              {PRODUCT_NAME}
            </a>
            {shell?.setup.claimed ? (
              <nav className="flex items-center gap-4 text-sm">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.href}
                    className={
                      isActive(route, item.href)
                        ? 'font-medium text-neutral-900'
                        : 'text-neutral-500 transition hover:text-neutral-900'
                    }
                    href={item.href}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-sm">
            {shell?.user ? (
              <>
                {shell.user.avatarUrl ? (
                  <img alt="" className="h-6 w-6 rounded-full" src={shell.user.avatarUrl} />
                ) : null}
                <span className="text-neutral-500">{shell.user.login}</span>
                <button
                  className="text-xs text-neutral-400 transition hover:text-neutral-700"
                  disabled={busy}
                  onClick={() => void handleLogout()}
                  type="button"
                >
                  Log out
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Content failed={failed} onReload={load} route={route} shell={shell} />
      </main>
      <footer className="mx-auto w-full max-w-3xl px-6 pb-8 text-xs text-neutral-400">
        Self-hosted on your own Cloudflare account.
      </footer>
    </div>
  );
}

function isActive(route: Route, href: string): boolean {
  switch (href) {
    case '/':
      return route.name === 'home';
    case '/reviewers':
      return (
        route.name === 'reviewers' ||
        route.name === 'reviewer-new' ||
        route.name === 'reviewer-edit'
      );
    case '/repositories':
      return route.name === 'repositories';
    case '/runs':
      return route.name === 'runs' || route.name === 'run-detail';
    default:
      return false;
  }
}

function Content({
  route,
  shell,
  failed,
  onReload,
}: {
  route: Route;
  shell: Shell | null;
  failed: boolean;
  onReload: () => Promise<void>;
}) {
  if (route.name === 'setup') {
    return <SetupPage />;
  }
  if (shell === null) {
    return failed ? (
      <Card>
        <p className="text-sm text-neutral-600">The dashboard API did not respond.</p>
        <button className={buttonClass} onClick={() => void onReload()} type="button">
          Try again
        </button>
      </Card>
    ) : (
      <p className="text-sm text-neutral-500">Loading…</p>
    );
  }
  if (!shell.setup.claimed) {
    return (
      <Card title="This instance is not set up yet">
        <p className="text-sm text-neutral-500">
          Register its GitHub App, install it, and claim the instance to start reviewing pull
          requests.
        </p>
        <a className={buttonClass} href="/setup">
          Start setup
        </a>
      </Card>
    );
  }
  if (shell.user === null) {
    return (
      <Card title="Sign in">
        <p className="text-sm text-neutral-500">
          Use a GitHub account that can access this instance&rsquo;s app installation.
        </p>
        <a className={buttonClass} href="/api/auth/github/start">
          Sign in with GitHub
        </a>
      </Card>
    );
  }
  switch (route.name) {
    case 'home':
      return <HomePage user={shell.user} />;
    case 'reviewers':
      return <ReviewersPage />;
    case 'reviewer-new':
      return <ReviewerEditorPage />;
    case 'reviewer-edit':
      return <ReviewerEditorPage id={route.id} />;
    case 'repositories':
      return <RepositoriesPage />;
    case 'runs':
      return <RunsPage />;
    case 'run-detail':
      return <RunDetailPage id={route.id} />;
    default:
      return null;
  }
}
