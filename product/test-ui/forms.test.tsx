import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Field, Input, Select, Switch, Textarea } from '../src/ui';

describe('Field', () => {
  it('associates its label with the wrapped control', () => {
    render(
      <Field label="Name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('renders a hint', () => {
    render(
      <Field hint="Lowercase only" label="Slug">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Lowercase only')).toBeTruthy();
  });

  it('renders an error with role alert', () => {
    render(
      <Field error="This field is required" label="Name">
        <Input />
      </Field>,
    );
    expect(screen.getByRole('alert').textContent).toBe('This field is required');
  });

  it('points the control at its hint and its error', () => {
    render(
      <Field error="This field is required" hint="Lowercase only" label="Slug">
        <Input />
      </Field>,
    );
    const control = screen.getByRole('textbox');
    const describedBy = control.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(
      (describedBy as string).split(' ').map((id) => document.getElementById(id)?.textContent),
    ).toEqual(['Lowercase only', 'This field is required']);
    expect(control.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Input', () => {
  it('accepts typed input', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Email" />);
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    await user.type(input, 'dev@example.com');
    expect(input.value).toBe('dev@example.com');
  });

  it('receives focus through keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Email" />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
  });
});

describe('Textarea', () => {
  it('accepts typed input', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" />);
    const textarea = screen.getByLabelText('Notes') as HTMLTextAreaElement;
    await user.type(textarea, 'hello');
    expect(textarea.value).toBe('hello');
  });
});

describe('Select', () => {
  it('updates its value on selection', async () => {
    const user = userEvent.setup();
    render(
      <Select aria-label="Flavor" defaultValue="openai">
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
      </Select>,
    );
    const select = screen.getByLabelText('Flavor') as HTMLSelectElement;
    await user.selectOptions(select, 'anthropic');
    expect(select.value).toBe('anthropic');
  });
});

function SwitchHarness() {
  const [checked, setChecked] = useState(false);
  return <Switch checked={checked} label="Notifications" onCheckedChange={setChecked} />;
}

describe('Switch', () => {
  it('reflects the checked state', () => {
    render(<Switch checked label="Notifications" onCheckedChange={() => {}} />);
    const control = screen.getByRole('switch', { name: 'Notifications' });
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('flips on click', async () => {
    const user = userEvent.setup();
    render(<SwitchHarness />);
    const control = screen.getByRole('switch', { name: 'Notifications' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    await user.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('flips on keyboard activation', async () => {
    const user = userEvent.setup();
    render(<SwitchHarness />);
    const control = screen.getByRole('switch', { name: 'Notifications' });
    control.focus();
    await user.keyboard('{Enter}');
    expect(control.getAttribute('aria-checked')).toBe('true');
  });
});
