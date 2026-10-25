import type { SessionUser, SetupState } from '@jury-forge/shared';
import { PRODUCT_NAME } from '@jury-forge/shared';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Route } from '../lib/router';
import { handleAppLink } from '../lib/router';
import { applyTheme, readStoredTheme } from '../lib/theme';
import type { BadgeTone } from '../ui';
import { cx, focusRing, tapTarget } from '../ui';
import { CommandPalette } from './CommandPalette';
import type { PaletteAction } from './CommandPalette';
import { Nav } from './Nav';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface StatusState {
  tone: BadgeTone;
  label: string;
  detail: string | null;
}

function statusState(setup: SetupState | null): StatusState {
  if (setup === null) return { tone: 'neutral', label: 'Checking', detail: null };
  if (!setup.claimed) return { tone: 'neutral', label: 'Not set up', detail: null };
  if (setup.installed) {
    return { tone: 'green', label: 'GitHub App installed', detail: setup.appSlug };
  }
  return { tone: 'amber', label: 'Installation pending', detail: setup.appSlug };
}

const DOT_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-text-subtle',
  green: 'bg-status-completed-text',
  red: 'bg-status-failed-text',
  amber: 'bg-status-running-text',
};

/** The instance's install state: a dot that matches its tone, a plain label, and the app slug. */
function StatusPill({ setup, className }: { setup: SetupState | null; className?: string }) {
  const state = statusState(setup);
  return (
    <div
      aria-label={state.detail ? `${state.label}: ${state.detail}` : state.label}
      className={cx(
        'flex min-w-0 items-center gap-2.5 rounded-control border border-border bg-surface-muted px-3 py-2',
        className,
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className={cx('h-2 w-2 shrink-0 rounded-full', DOT_CLASS[state.tone])}
      />
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-text">{state.label}</span>
        {state.detail ? (
          <span className="block truncate font-mono text-[11px] text-text-muted">
            {state.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export interface ShellProps {
  user: SessionUser | null;
  setup: SetupState | null;
  route: Route;
  onLogout: () => void;
  busy?: boolean;
  children: ReactNode;
}

export function Shell({ user, setup, route, onLogout, busy = false, children }: ShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const paletteActions: PaletteAction[] = [
    {
      id: 'theme',
      label: 'Cycle theme (dark, system, light)',
      keywords: ['dark', 'light', 'system', 'appearance'],
      run: () => {
        const current = readStoredTheme() ?? 'dark';
        applyTheme(current === 'dark' ? 'system' : current === 'system' ? 'light' : 'dark');
      },
    },
    {
      id: 'logout',
      label: 'Log out',
      keywords: ['sign out', 'session'],
      run: onLogout,
    },
  ].filter((action) => action.id !== 'logout' || user !== null);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-surface-page text-text">
      {setup?.claimed ? <CommandPalette actions={paletteActions} /> : null}
      {/* Top bar — below lg only. */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface lg:hidden">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-controls="mobile-nav"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className={cx(
                'inline-flex items-center justify-center rounded-control border border-border-strong bg-surface px-3 text-sm text-text-muted transition hover:text-text',
                tapTarget,
                focusRing,
              )}
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
            <a
              className={cx(
                'inline-flex min-w-0 items-center truncate text-sm font-semibold tracking-tight',
                tapTarget,
                focusRing,
              )}
              href="/"
              onClick={handleAppLink}
            >
              {PRODUCT_NAME}
            </a>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <ThemeToggle />
            {user ? (
              <UserMenu
                busy={busy}
                className="flex min-w-0 items-center gap-2"
                onLogout={onLogout}
                user={user}
              />
            ) : null}
          </div>
        </div>
      </header>

      {/* Slide-over — below lg only. Rendered before the sidebar so the visible nav is the
          first `nav` in the DOM while it is open. */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 h-full w-full bg-surface-inverse/50"
            onClick={() => setMenuOpen(false)}
            type="button"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-4 border-r border-border bg-surface p-4 shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <a
                className={cx(
                  'inline-flex items-center text-sm font-semibold tracking-tight',
                  tapTarget,
                  focusRing,
                )}
                href="/"
                onClick={handleAppLink}
              >
                {PRODUCT_NAME}
              </a>
              <StatusPill setup={setup} />
            </div>
            {/* Gated on `setup.claimed`, as the pre-shell App did (D-027: only the markup moved) —
                before the instance is claimed every link lands on the same gate panel. */}
            {setup?.claimed ? (
              <Nav id="mobile-nav" onNavigate={() => setMenuOpen(false)} route={route} />
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Body */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        {/* Sidebar — lg and above only. */}
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border p-6 lg:flex">
          <div className="flex flex-col gap-3">
            <a
              className={cx(
                'inline-flex items-center text-base font-semibold tracking-tight',
                tapTarget,
                focusRing,
              )}
              href="/"
              onClick={handleAppLink}
            >
              {PRODUCT_NAME}
            </a>
            <StatusPill setup={setup} />
          </div>
          {setup?.claimed ? <Nav route={route} /> : null}
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
            <ThemeToggle className="self-start" />
            {user ? (
              <UserMenu
                busy={busy}
                className="flex items-center gap-2"
                onLogout={onLogout}
                user={user}
              />
            ) : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>
          <footer className="min-w-0 px-4 pb-8 text-xs text-text-subtle sm:px-6 lg:px-8">
            Self-hosted on your own Cloudflare account.
          </footer>
        </div>
      </div>
    </div>
  );
}
