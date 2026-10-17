import type { ReactNode } from 'react';
import { cx } from './class-names';

const NOTICE_TONES = {
  error: 'border-border-error bg-surface-error text-text-error',
  info: 'border-border-info bg-surface-info text-text-info',
} as const;

export function Notice({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'info';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cx('rounded-control border px-3 py-2 text-sm', NOTICE_TONES[tone], className)}>
      {children}
    </p>
  );
}
