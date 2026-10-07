export type Route =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'reviewers' }
  | { name: 'reviewer-new' }
  | { name: 'reviewer-edit'; id: string }
  | { name: 'repositories' }
  | { name: 'runs' }
  | { name: 'run-detail'; id: string };

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
    case 'runs':
      if (second === '') {
        return { name: 'runs' };
      }
      return { name: 'run-detail', id: decodeURIComponent(second) };
    default:
      return { name: 'home' };
  }
}
