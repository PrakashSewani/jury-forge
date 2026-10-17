import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, Row, Table, Tabs } from '../src/ui';

describe('Table and Row', () => {
  it('exposes rows to the accessibility tree', () => {
    render(
      <Table>
        <tbody>
          <Row>
            <td>Alpha</td>
            <td>One</td>
          </Row>
          <Row>
            <td>Beta</td>
            <td>Two</td>
          </Row>
        </tbody>
      </Table>,
    );
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('exposes cells to the accessibility tree', () => {
    render(
      <Table>
        <tbody>
          <Row>
            <td>Alpha</td>
            <td>One</td>
          </Row>
        </tbody>
      </Table>,
    );
    expect(screen.getAllByRole('cell')).toHaveLength(2);
  });

  it('wraps the table in a scroll container', () => {
    const { container } = render(
      <Table>
        <tbody>
          <Row>
            <td>Alpha</td>
          </Row>
        </tbody>
      </Table>,
    );
    expect(container.querySelector('div.overflow-x-auto')).toBeTruthy();
  });
});

describe('Tabs', () => {
  const items = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
  ];

  it('marks the selected tab', () => {
    render(<Tabs items={items} onChange={() => {}} value="overview" />);
    expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('moves the selection when a tab is clicked', async () => {
    const user = userEvent.setup();
    render(<Tabs items={items} onChange={() => {}} value="overview" />);
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(
      screen.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected'),
    ).toBeTruthy();
  });

  it('calls onChange with the tab id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Tabs items={items} onChange={onChange} value="overview" />);
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(onChange).toHaveBeenCalledWith('activity');
  });
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open dialog
      </button>
      <Dialog onClose={() => setOpen(false)} open={open} title="Confirm">
        <button onClick={() => setOpen(false)} type="button">
          Close dialog
        </button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens as a modal dialog', async () => {
    const user = userEvent.setup();
    const { container } = render(<DialogHarness />);
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await waitFor(() => expect(dialog.open).toBe(true));
    expect(screen.getByRole('heading', { level: 2, name: 'Confirm' })).toBeTruthy();
  });

  it('closes when the open prop becomes false', async () => {
    const user = userEvent.setup();
    const { container } = render(<DialogHarness />);
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await waitFor(() => expect(dialog.open).toBe(true));
    await user.click(screen.getByText('Close dialog'));
    await waitFor(() => expect(dialog.open).toBe(false));
  });
});
