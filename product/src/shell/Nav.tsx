import type { Route } from '../lib/router';
import { handleAppLink } from '../lib/router';
import { cx, focusRing } from '../ui';

export const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/reviewers', label: 'Reviewers' },
  { href: '/repositories', label: 'Repositories' },
  { href: '/runs', label: 'Runs' },
  { href: '/settings', label: 'Settings' },
  { href: '/activity', label: 'Activity' },
];

// The section mapping is unchanged from the pre-shell App: a sub-route keeps its section active.
export function isActive(route: Route, href: string): boolean {
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
    case '/settings':
      return route.name === 'settings';
    case '/activity':
      return route.name === 'activity';
    default:
      return false;
  }
}

export function Nav({
  route,
  id,
  onNavigate,
}: {
  route: Route;
  id?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1" id={id}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(route, item.href);
        return (
          <a
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex min-h-11 items-center rounded-control px-3 text-sm transition',
              focusRing,
              active
                ? 'bg-surface-muted font-medium text-text'
                : 'text-text-muted hover:bg-surface-muted hover:text-text',
            )}
            href={item.href}
            key={item.href}
            onClick={(event) => {
              handleAppLink(event);
              onNavigate?.();
            }}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
