import type { ReactElement, ReactNode } from 'react';
import { cloneElement, isValidElement, useId } from 'react';
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
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');

  // The hint and the error live outside the control, so the only way for a screen reader to reach
  // them is to point the control at them: `aria-describedby` for both, `aria-invalid` for the
  // error state. The control is the caller's element, so the wiring is injected into it.
  const control =
    isValidElement(children) && describedBy !== ''
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          'aria-describedby': describedBy,
          ...(error ? { 'aria-invalid': true } : {}),
        })
      : children;

  return (
    <label className={cx('block space-y-1.5', className)}>
      <span className="block text-sm font-medium">{label}</span>
      {control}
      {hint ? (
        <span className="block text-xs text-text-muted" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="block text-xs text-text-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
