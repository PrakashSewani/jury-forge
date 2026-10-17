import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Badge, Button, Card, EmptyState, Notice, Panel, Skeleton, Toolbar } from '../src/ui';

describe('Button', () => {
  it('renders a primary button by default', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('bg-accent');
    expect(button.className).toContain('rounded-control');
  });

  it('renders the secondary variant', () => {
    render(<Button variant="secondary">Cancel</Button>);
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button.className).toContain('border-border-strong');
  });

  it('renders the ghost variant', () => {
    render(<Button variant="ghost">Dismiss</Button>);
    const button = screen.getByRole('button', { name: 'Dismiss' });
    expect(button.className).toContain('text-text-muted');
  });

  it('renders the small size', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button', { name: 'Small' }).className).toContain('px-3');
  });

  it('renders the medium size', () => {
    render(<Button size="md">Medium</Button>);
    expect(screen.getByRole('button', { name: 'Medium' }).className).toContain('px-4');
  });

  it('fires onClick when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    await user.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Disabled' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('busy marks the button busy and disabled', () => {
    render(<Button busy>Working</Button>);
    const button = screen.getByRole('button', { name: 'Working' }) as HTMLButtonElement;
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  it('merges a caller className after its own classes', () => {
    render(<Button className="mt-4">Merged</Button>);
    const button = screen.getByRole('button', { name: 'Merged' });
    expect(button.className).toContain('bg-accent');
    expect(button.className).toContain('mt-4');
  });

  it('receives focus', () => {
    render(<Button>Focus me</Button>);
    const button = screen.getByRole('button', { name: 'Focus me' });
    button.focus();
    expect(document.activeElement).toBe(button);
  });
});

describe('Card and Panel', () => {
  it('renders a Card title as a heading', () => {
    render(
      <Card title="Recent runs">
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Recent runs' })).toBeTruthy();
  });

  it('renders a Card without a heading when no title is given', () => {
    render(
      <Card>
        <p>Body</p>
      </Card>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders a Panel title as a heading', () => {
    render(
      <Panel title="Details">
        <p>Body</p>
      </Panel>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toBeTruthy();
  });

  it('renders a Panel without a heading when no title is given', () => {
    render(
      <Panel>
        <p>Body</p>
      </Panel>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('Badge', () => {
  it('renders the neutral tone as a light chip with dark text', () => {
    render(<Badge>neutral</Badge>);
    const badge = screen.getByText('neutral');
    expect(badge.className).toContain('bg-surface-muted');
    expect(badge.className).toContain('text-text-body');
  });

  it('renders the green tone', () => {
    render(<Badge tone="green">green</Badge>);
    expect(screen.getByText('green').className).toContain('bg-status-completed-surface');
  });

  it('renders the red tone', () => {
    render(<Badge tone="red">red</Badge>);
    expect(screen.getByText('red').className).toContain('bg-status-failed-surface');
  });

  it('renders the amber tone', () => {
    render(<Badge tone="amber">amber</Badge>);
    expect(screen.getByText('amber').className).toContain('bg-status-running-surface');
  });
});

describe('Notice', () => {
  it('renders the error tone with the red mapping', () => {
    render(<Notice tone="error">Something broke</Notice>);
    const notice = screen.getByText('Something broke');
    expect(notice.className).toContain('bg-surface-error');
    expect(notice.className).toContain('text-text-error');
    expect(notice.tagName).toBe('P');
  });

  it('renders the info tone with the blue mapping', () => {
    render(<Notice tone="info">All good</Notice>);
    const notice = screen.getByText('All good');
    expect(notice.className).toContain('bg-surface-info');
    expect(notice.className).toContain('text-text-info');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstElementChild as HTMLElement;
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton.className).toContain('animate-pulse');
  });
});

describe('Toolbar', () => {
  it('renders its children in a row', () => {
    render(
      <Toolbar>
        <span>First</span>
        <span>Second</span>
      </Toolbar>,
    );
    const toolbar = screen.getByText('First').parentElement as HTMLElement;
    expect(toolbar.className).toContain('items-center');
    expect(toolbar.className).toContain('gap-2');
    expect(screen.getByText('Second')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders its call to action', () => {
    render(
      <EmptyState
        action={<Button>Create reviewer</Button>}
        description="Nothing here yet."
        title="No reviewers"
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No reviewers' })).toBeTruthy();
    expect(screen.getByText('Nothing here yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create reviewer' })).toBeTruthy();
  });
});
