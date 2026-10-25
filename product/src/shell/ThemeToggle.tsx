import { useState } from 'react';
import { applyTheme, readStoredTheme } from '../lib/theme';
import type { ThemePreference } from '../lib/theme';
import { cx, focusRing, tapTarget } from '../ui';

const LABELS: Record<ThemePreference, string> = {
  light: 'Theme: light',
  dark: 'Theme: dark',
  system: 'Theme: system',
};

const SHORT_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function nextPreference(current: ThemePreference): ThemePreference {
  if (current === 'light') return 'dark';
  if (current === 'dark') return 'system';
  return 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredTheme() ?? 'dark');

  function cycle() {
    const next = nextPreference(preference);
    setPreference(next);
    applyTheme(next);
  }

  return (
    <button
      aria-label={LABELS[preference]}
      className={cx(
        'inline-flex items-center justify-center rounded-control border border-border-strong bg-surface px-3 text-xs text-text-muted transition hover:text-text',
        tapTarget,
        focusRing,
        className,
      )}
      onClick={cycle}
      type="button"
    >
      <span aria-hidden="true">{SHORT_LABELS[preference]}</span>
    </button>
  );
}
