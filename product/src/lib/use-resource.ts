import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZodType } from 'zod';

export interface Resource<T> {
  data: T | null;
  failed: boolean;
  error: unknown;
  reload: () => Promise<void>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Holds a value that a `fetcher` loads. The fetcher is aborted on unmount and whenever its
 * identity changes; a revalidated value is validated with `schema` before it becomes `data`.
 * It revalidates on a window refocus and when the document becomes visible again.
 */
export function useResource<T>(
  schema: ZodType<T>,
  fetcher: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mountedRef = useRef(true);
  const schemaRef = useRef(schema);
  const controllerRef = useRef<AbortController | null>(null);
  schemaRef.current = schema;

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setFailed(false);
    setError(null);
    try {
      const value = await fetcher(controller.signal);
      if (controller.signal.aborted || !mountedRef.current) {
        return;
      }
      const parsed = schemaRef.current.safeParse(value);
      if (!parsed.success) {
        setFailed(true);
        setError(new Error('invalid_response'));
        return;
      }
      setData(parsed.data);
    } catch (caught) {
      if (controller.signal.aborted || !mountedRef.current || isAbortError(caught)) {
        return;
      }
      setFailed(true);
      setError(caught);
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    const onFocus = () => {
      void load();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      controllerRef.current?.abort();
    };
  }, [load]);

  return { data, failed, error, reload: load };
}
