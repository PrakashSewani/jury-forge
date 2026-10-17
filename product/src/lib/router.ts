import type { MouseEvent as ReactMouseEvent } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'reviewers' }
  | { name: 'reviewer-new' }
  | { name: 'reviewer-edit'; id: string }
  | { name: 'repositories' }
  | { name: 'runs' }
  | { name: 'run-detail'; id: string }
  | { name: 'settings' }
  | { name: 'activity' };

export function routeFromPath(pathname: string): Route {
  const [first = '', second = ''] = pathname.split('/').filter((part) => part !== '');
  switch (first) {
    case 'setup':
      return { name: 'setup' };
    case 'reviewers':
      if (second === '') {
        return { name: 'reviewers' };
      }
      if (second === 'new') {
        return { name: 'reviewer-new' };
      }
      return { name: 'reviewer-edit', id: decodeURIComponent(second) };
    case 'repositories':
      return { name: 'repositories' };
    case 'settings':
      return { name: 'settings' };
    case 'activity':
      return { name: 'activity' };
    case 'runs':
      if (second === '') {
        return { name: 'runs' };
      }
      return { name: 'run-detail', id: decodeURIComponent(second) };
    default:
      return { name: 'home' };
  }
}

const routeListeners = new Set<() => void>();

/**
 * A navigation blocker: return `false` to veto a route change and keep the screen the user is on.
 * The reviewer editor registers one while the form is dirty, so an in-app click cannot silently
 * discard edits (`beforeunload` only covers a real document unload).
 */
export type NavigationBlocker = (next: string) => boolean;

const navigationBlockers = new Set<NavigationBlocker>();

/** The path the current screen was reached with; what a vetoed popstate restores. */
let acceptedPath: string | null = null;

interface BrowserWindow {
  location: { pathname: string };
  history: {
    pushState(data: unknown, unused: string, url?: string | null): void;
    replaceState(data: unknown, unused: string, url?: string | null): void;
  };
  addEventListener(type: 'popstate', listener: () => void): void;
  removeEventListener(type: 'popstate', listener: () => void): void;
}

/** The worker type program has no DOM lib, so reach the browser window structurally. */
function browserWindow(): BrowserWindow {
  return (globalThis as unknown as { window: BrowserWindow }).window;
}

function notifyRoute(): void {
  for (const listener of routeListeners) {
    listener();
  }
}

/**
 * Ask every registered blocker before a route change. Any `false` vetoes it, so a screen that owns
 * unsaved work can refuse to be replaced.
 */
function mayNavigate(next: string): boolean {
  for (const blocker of navigationBlockers) {
    if (!blocker(next)) {
      return false;
    }
  }
  return true;
}

/**
 * Register a blocker and get back the function that removes it. The editor registers one while its
 * form is dirty, so `navigate()` can ask before it moves the user off the page.
 */
export function registerNavigationBlocker(blocker: NavigationBlocker): () => void {
  navigationBlockers.add(blocker);
  return () => {
    navigationBlockers.delete(blocker);
  };
}

/**
 * Push (or replace) a client route and tell every subscriber to re-read the pathname. Returns
 * `false` — and changes nothing — when a blocker vetoes the move.
 */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}): boolean {
  if (!mayNavigate(path)) {
    return false;
  }
  const win = browserWindow();
  if (replace) {
    win.history.replaceState(null, '', path);
  } else {
    win.history.pushState(null, '', path);
  }
  acceptedPath = path;
  notifyRoute();
  return true;
}

/**
 * The browser's back/forward button. The URL has already moved by the time `popstate` fires, so a
 * veto puts the entry back and tells nobody: the screen the user was on stays, with its state.
 */
function handlePopState(): void {
  const win = browserWindow();
  const next = win.location.pathname;
  if (!mayNavigate(next)) {
    win.history.pushState(null, '', acceptedPath ?? next);
    return;
  }
  acceptedPath = next;
  notifyRoute();
}

let popStateAttached = false;

/**
 * Subscribe to route changes: a `navigate()` notifies directly, and the browser's back/forward
 * buttons notify through `popstate` (which is filtered through the blockers first). Returns an
 * unsubscribe function.
 */
export function subscribeRoute(listener: () => void): () => void {
  routeListeners.add(listener);
  const win = browserWindow();
  if (acceptedPath === null) {
    acceptedPath = win.location.pathname;
  }
  if (!popStateAttached) {
    win.addEventListener('popstate', handlePopState);
    popStateAttached = true;
  }
  return () => {
    routeListeners.delete(listener);
    if (popStateAttached && routeListeners.size === 0) {
      win.removeEventListener('popstate', handlePopState);
      popStateAttached = false;
    }
  };
}

/**
 * Handle a click on an internal anchor through the router. A plain left click on a same-tab link
 * is intercepted; a modified click (meta/ctrl/shift/alt or a non-left button) and any target
 * other than self fall through to the browser, as does a server route under `/api/`.
 */
export function handleAppLink(event: ReactMouseEvent<HTMLAnchorElement>): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const target = event.currentTarget.getAttribute('target');
  if (target !== null && target !== '' && target !== '_self') {
    return;
  }
  const href = event.currentTarget.getAttribute('href');
  if (href === null || !href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) {
    return;
  }
  event.preventDefault();
  navigate(href);
}
