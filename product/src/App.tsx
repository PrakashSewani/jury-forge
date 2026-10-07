import { PRODUCT_NAME } from '@jury-forge/shared';
import { routeFromPath } from './lib/router';
import HomePage from './pages/HomePage';
import SetupPage from './pages/SetupPage';

export default function App() {
  const route = routeFromPath(window.location.pathname);

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-4">
          <a className="text-sm font-semibold tracking-tight" href="/">
            {PRODUCT_NAME}
          </a>
          <a className="text-xs text-neutral-400 transition hover:text-neutral-700" href="/setup">
            Setup
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {route === '/setup' ? <SetupPage /> : <HomePage />}
      </main>
      <footer className="mx-auto w-full max-w-2xl px-6 pb-8 text-xs text-neutral-400">
        Self-hosted on your own Cloudflare account.
      </footer>
    </div>
  );
}
