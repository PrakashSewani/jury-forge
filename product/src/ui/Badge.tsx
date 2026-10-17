import type { ReactNode } from 'react';
import { cx } from './class-names';

export type BadgeTone = 'neutral' | 'green' | 'red' | 'amber';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-text-body',
  green: 'bg-status-completed-surface text-status-completed-text',
  red: 'bg-status-failed-surface text-status-failed-text',
  amber: 'bg-status-running-surface text-status-running-text',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
