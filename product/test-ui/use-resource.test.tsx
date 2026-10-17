import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useResource } from '../src/lib/use-resource';

const ValueSchema = z.object({ value: z.number() });

type Value = z.infer<typeof ValueSchema>;

function Harness({ fetcher }: { fetcher: (signal: AbortSignal) => Promise<Value> }) {
  const { data, failed } = useResource(ValueSchema, fetcher);
  const state = failed ? 'failed' : data === null ? 'loading' : String(data.value);
  return <span data-testid="state">{state}</span>;
}

describe('useResource', () => {
  it('loads once and revalidates on a window focus event', async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<Value>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ value: 2 });
    render(<Harness fetcher={fetcher} />);

    expect(await screen.findByText('1')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('2')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('revalidates once when focus and visibilitychange arrive together', async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<Value>>()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValue({ value: 2 });
    render(<Harness fetcher={fetcher} />);

    expect(await screen.findByText('1')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Returning to the tab fires both; the second must not abort the first and fetch again.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByText('2')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight request when it unmounts', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn((signal: AbortSignal): Promise<Value> => {
      signals.push(signal);
      return new Promise<Value>(() => {});
    });
    const { unmount } = render(<Harness fetcher={fetcher} />);

    await waitFor(() => expect(signals).toHaveLength(1));
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  it('does not show a failure for an AbortError', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetcher = vi.fn<(signal: AbortSignal) => Promise<Value>>().mockRejectedValue(abortError);
    render(<Harness fetcher={fetcher} />);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('state').textContent).toBe('loading');
    expect(screen.queryByText('failed')).toBeNull();
  });

  it('fails when the value does not match the schema', async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<Value>>()
      .mockResolvedValue({ value: 'not a number' } as unknown as Value);
    render(<Harness fetcher={fetcher} />);

    expect(await screen.findByText('failed')).toBeTruthy();
  });
});
