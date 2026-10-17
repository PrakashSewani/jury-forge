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

interface BrowserWindow {
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

/** Push (or replace) a client route and tell every subscriber to re-read the pathname. */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}): void {
  const win = browserWindow();
  if (replace) {
    win.history.replaceState(null, '', path);
  } else {
    win.history.pushState(null, '', path);
  }
  notifyRoute();
}

/**
 * Subscribe to route changes: a `navigate()` notifies directly, and the browser's back/forward
 * buttons notify through `popstate`. Returns an unsubscribe function.
 */
export function subscribeRoute(listener: () => void): () => void {
  routeListeners.add(listener);
  const win = browserWindow();
  win.addEventListener('popstate', listener);
  return () => {
    routeListeners.delete(listener);
    win.removeEventListener('popstate', listener);
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
