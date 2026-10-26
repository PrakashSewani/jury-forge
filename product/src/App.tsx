import type { SessionUser, SetupState } from '@jury-forge/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Toaster } from 'sonner';
import { fetchSession, fetchSetupState, logOut } from './lib/api';
import type { Route } from './lib/router';
import { routeFromPath, subscribeRoute } from './lib/router';
import ActivityPage from './pages/ActivityPage';
import HomePage from './pages/HomePage';
import PackDetailPage from './pages/PackDetailPage';
import PacksPage from './pages/PacksPage';
import RepositoriesPage from './pages/RepositoriesPage';
import ReviewerEditorPage from './pages/ReviewerEditorPage';
import ReviewersPage from './pages/ReviewersPage';
import RunDetailPage from './pages/RunDetailPage';
import RunsPage from './pages/RunsPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import { RouteGuard, Shell } from './shell';

interface ShellState {
  user: SessionUser | null;
  setup: SetupState;
}

export default function App() {
  const pathname = useSyncExternalStore(subscribeRoute, () => window.location.pathname);
  const route = routeFromPath(pathname);
  const [shell, setShell] = useState<ShellState | null>(null);
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
    <>
      <Shell
        busy={busy}
        onLogout={() => void handleLogout()}
        route={route}
        setup={shell?.setup ?? null}
        user={shell?.user ?? null}
      >
        <Content failed={failed} onReload={load} route={route} shell={shell} />
      </Shell>
      <Toaster closeButton position="bottom-right" richColors theme="dark" />
    </>
  );
}

function Content({
  route,
  shell,
  failed,
  onReload,
}: {
  route: Route;
  shell: ShellState | null;
  failed: boolean;
  onReload: () => Promise<void>;
}) {
  if (route.name === 'setup') {
    return <SetupPage />;
  }
  return (
    <RouteGuard
      failed={failed}
      onReload={onReload}
      setup={shell?.setup ?? null}
      user={shell?.user ?? null}
    >
      <Screens route={route} user={shell?.user ?? null} />
    </RouteGuard>
  );
}

function Screens({ route, user }: { route: Route; user: SessionUser | null }) {
  switch (route.name) {
    case 'home':
      return user ? <HomePage user={user} /> : null;
    case 'reviewers':
      return <ReviewersPage />;
    case 'reviewer-new':
      return <ReviewerEditorPage />;
    case 'reviewer-edit':
      return <ReviewerEditorPage id={route.id} />;
    case 'packs':
      return <PacksPage />;
    case 'pack-detail':
      return <PackDetailPage id={route.id} />;
    case 'repositories':
      return <RepositoriesPage />;
    case 'runs':
      return <RunsPage />;
    case 'run-detail':
      return <RunDetailPage id={route.id} />;
    case 'settings':
      return <SettingsPage />;
    case 'activity':
      return <ActivityPage />;
    default:
      return null;
  }
}
