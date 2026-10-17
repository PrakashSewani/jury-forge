import type { SetupState } from '@jury-forge/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../src/lib/theme';
import { isActive, Nav, RouteGuard, Shell, ThemeToggle } from '../src/shell';
import { memoryStorage } from './memory-storage';

const CLAIMED: SetupState = {
  claimed: true,
  appCreated: true,
  installed: true,
  appSlug: 'jury-forge-local',
};

// Never the ambient `window.localStorage`: Node ≥26 defines that global as a disabled accessor, and
// vitest's happy-dom environment then declines to install its own Storage (see memory-storage.ts),
// which failed all 11 tests in this file. The stub gives the component and the assertions one store.
let store: Storage;

beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal('localStorage', store);
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Nav', () => {
  it('marks the active top-level route', () => {
    render(<Nav route={{ name: 'runs' }} />);
    expect(screen.getByRole('link', { name: 'Runs' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
  });

  it('keeps a section active on a sub-route', () => {
    render(<Nav route={{ name: 'reviewer-edit', id: 'rev-security' }} />);
    expect(screen.getByRole('link', { name: 'Reviewers' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('keeps the run detail sub-route under Runs', () => {
    expect(isActive({ name: 'run-detail', id: 'run-1' }, '/runs')).toBe(true);
    expect(isActive({ name: 'activity' }, '/runs')).toBe(false);
  });
});

describe('Shell mobile nav', () => {
  it('opens the slide-over and sets aria-expanded', async () => {
    const user = userEvent.setup();
    render(
      <Shell onLogout={() => {}} route={{ name: 'home' }} setup={CLAIMED} user={null}>
        <p>Content</p>
      </Shell>,
    );
    const toggle = screen.getByRole('button', { name: /open menu/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');
    expect(document.getElementById('mobile-nav')).toBeTruthy();
  });

  it('closes the slide-over when a link is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Shell onLogout={() => {}} route={{ name: 'home' }} setup={CLAIMED} user={null}>
        <p>Content</p>
      </Shell>,
    );
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const panel = document.getElementById('mobile-nav') as HTMLElement;
    await user.click(within(panel).getByRole('link', { name: 'Runs' }));
    expect(document.getElementById('mobile-nav')).toBeNull();
  });
});

describe('ThemeToggle', () => {
  it('cycles system to light and applies the theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /theme: system/i }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(store.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('cycles light to dark', async () => {
    store.setItem(THEME_STORAGE_KEY, 'light');
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: /theme: light/i }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(store.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});

describe('RouteGuard', () => {
  it('renders the sign-in panel when there is no user', () => {
    render(
      <RouteGuard failed={false} onReload={vi.fn()} setup={CLAIMED} user={null}>
        <p>Secret dashboard</p>
      </RouteGuard>,
    );
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    const action = screen.getByRole('link', { name: 'Sign in with GitHub' });
    expect(action.getAttribute('href')).toBe('/api/auth/github/start');
    expect(screen.queryByText('Secret dashboard')).toBeNull();
  });

  it('renders the not-set-up panel before setup is claimed', () => {
    render(
      <RouteGuard
        failed={false}
        onReload={vi.fn()}
        setup={{ ...CLAIMED, claimed: false }}
        user={null}
      >
        <p>Secret dashboard</p>
      </RouteGuard>,
    );
    expect(screen.getByRole('heading', { name: 'This instance is not set up yet' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start setup' }).getAttribute('href')).toBe('/setup');
  });

  it('renders the API-failure retry', () => {
    render(
      <RouteGuard failed onReload={vi.fn()} setup={null} user={null}>
        <p>Secret dashboard</p>
      </RouteGuard>,
    );
    expect(screen.getByRole('heading', { name: 'The dashboard API did not respond' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('renders its children for a signed-in user on a claimed instance', () => {
    render(
      <RouteGuard
        failed={false}
        onReload={vi.fn()}
        setup={CLAIMED}
        user={{ login: 'prakashsewani', avatarUrl: null }}
      >
        <p>Secret dashboard</p>
      </RouteGuard>,
    );
    expect(screen.getByText('Secret dashboard')).toBeTruthy();
  });
});
