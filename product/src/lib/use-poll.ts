import { useEffect, useRef } from 'react';

export interface PollOptions {
  intervalMs: number;
  active: boolean;
}

/**
 * Calls `fetcher` on an interval while `active` is true, and clears the interval on unmount or
 * when `active` flips false. A tick whose previous call is still in flight is skipped, so the
 * fetcher never overlaps itself.
 */
export function usePoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { intervalMs, active }: PollOptions,
): void {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!active) {
      return;
    }
    let inFlight = false;
    let controller: AbortController | null = null;

    const tick = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      const current = new AbortController();
      controller = current;
      try {
        await fetcherRef.current(current.signal);
      } catch {
        // The polled resource owns its own error state; a failed tick is simply skipped.
      } finally {
        inFlight = false;
      }
    };

    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      clearInterval(id);
      controller?.abort();
    };
  }, [active, intervalMs]);
}
