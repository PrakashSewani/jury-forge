import { useCallback, useSyncExternalStore } from 'react';
import { navigate, subscribeRoute } from './router';

/**
 * Read and write one query-string value, so a filtered list is a link: a reload, a back button or a
 * pasted URL returns the same view. Writes use `replace` (a filter tweak is not a history step) and
 * go through `navigate`, so the registered navigation blockers still apply.
 *
 * The value is read from `window.location` on every render through `useSyncExternalStore`, which
 * subscribes to the router. An empty or missing value removes the parameter entirely.
 */
export function useQueryState(key: string, fallback = ''): [string, (next: string) => void] {
  const search = useSyncExternalStore(subscribeRoute, () => window.location.search);
  const value = new URLSearchParams(search).get(key) ?? fallback;

  const set = useCallback(
    (next: string) => {
      const params = new URLSearchParams(window.location.search);
      if (next === '' || next === fallback) {
        params.delete(key);
      } else {
        params.set(key, next);
      }
      const query = params.toString();
      navigate(`${window.location.pathname}${query === '' ? '' : `?${query}`}`, { replace: true });
    },
    [key, fallback],
  );

  return [value, set];
}
