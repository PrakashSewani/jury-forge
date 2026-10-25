import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueryState } from '../src/lib/use-query-state';
import { CommandPalette } from '../src/shell';
import type { PaletteAction } from '../src/shell';

beforeEach(() => {
  window.history.replaceState(null, '', '/runs');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('CommandPalette', () => {
  it('stays closed until Cmd/Ctrl+K, and a bare letter does nothing', async () => {
    const user = userEvent.setup();
    render(<CommandPalette actions={[]} />);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();

    await user.keyboard('k');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();

    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('runs a chosen action and closes', async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const actions: PaletteAction[] = [{ id: 'x', label: 'Do the thing', run }];
    render(<CommandPalette actions={actions} />);

    await user.keyboard('{Control>}k{/Control}');
    await user.click(screen.getByRole('option', { name: 'Do the thing' }));

    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull(),
    );
  });

  it('lists every screen under Go to', async () => {
    const user = userEvent.setup();
    render(<CommandPalette actions={[]} />);
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('option', { name: 'Runs' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Repositories' })).toBeTruthy();
  });
});

function FilterHarness() {
  const [status, setStatus] = useQueryState('status', 'all');
  return (
    <div>
      <p>value:{status}</p>
      <button onClick={() => setStatus('failed')} type="button">
        Failed
      </button>
      <button onClick={() => setStatus('all')} type="button">
        All
      </button>
    </div>
  );
}

describe('useQueryState', () => {
  it('writes the filter into the URL so the view is a link', async () => {
    const user = userEvent.setup();
    render(<FilterHarness />);
    expect(screen.getByText('value:all')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Failed' }));
    expect(screen.getByText('value:failed')).toBeTruthy();
    expect(window.location.search).toBe('?status=failed');
  });

  it('removes the parameter when the filter returns to its fallback', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/runs?status=failed');
    render(<FilterHarness />);
    expect(screen.getByText('value:failed')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(window.location.search).toBe('');
  });
});
