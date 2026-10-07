import { useCallback, useEffect, useState } from 'react';

export interface Loadable<T> {
  data: T | null;
  failed: boolean;
  reload: () => Promise<void>;
}

/** Fetches `load` on mount (and when it changes), tracking data/failed state. */
export function useLoadable<T>(load: () => Promise<T>): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setFailed(false);
    try {
      setData(await load());
    } catch {
      setFailed(true);
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, failed, reload };
}
