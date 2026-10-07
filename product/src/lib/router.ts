export type Route = '/' | '/setup';

export function routeFromPath(pathname: string): Route {
  return pathname === '/setup' || pathname.startsWith('/setup/') ? '/setup' : '/';
}
