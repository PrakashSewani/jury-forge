import type { ReactNode } from 'react';
import { cx } from './class-names';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-text-muted">{hint}</span> : null}
      {error ? (
        <span className="block text-xs text-text-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
