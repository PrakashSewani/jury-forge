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

  // The hint and the error live outside the control, so the only way for a screen reader to reach
  // them is to point the control at them: `aria-describedby` for both, `aria-invalid` for the
  // error state. The control is the caller's element, so the wiring is injected into it.
  //
  // Field owns these two attributes on its child, and it merges rather than replaces: a caller's
  // own `aria-describedby` is kept with the hint/error ids appended to it, and a caller's own
  // `aria-invalid` is never overwritten.
  const childProps = (isValidElement(children) ? children.props : {}) as Record<string, unknown>;
  const describedBy = [childProps['aria-describedby'], hint ? hintId : '', error ? errorId : '']
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .join(' ');

  const injected: Record<string, unknown> = {};
  if (describedBy !== '') {
    injected['aria-describedby'] = describedBy;
  }
  if (error && childProps['aria-invalid'] === undefined) {
    injected['aria-invalid'] = true;
  }

  const control =
    isValidElement(children) && Object.keys(injected).length > 0
      ? cloneElement(children as ReactElement<Record<string, unknown>>, injected)
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
