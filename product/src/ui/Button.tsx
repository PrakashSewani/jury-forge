import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names';

const BASE =
  'inline-flex items-center justify-center rounded-control font-medium transition disabled:cursor-not-allowed disabled:opacity-50';

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
} as const;

const VARIANTS = {
  primary: 'bg-accent text-text-inverse hover:bg-accent-hover',
  secondary: 'border border-border-strong bg-surface text-text hover:border-text-muted',
  ghost: 'text-text-muted hover:text-text',
} as const;

export const buttonClass = `${BASE} ${SIZES.md} ${VARIANTS.primary}`;

export const secondaryButtonClass = `${BASE} ${SIZES.md} ${VARIANTS.secondary}`;

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      aria-busy={busy ? true : undefined}
      className={cx(BASE, SIZES[size], VARIANTS[variant], className)}
      disabled={busy || disabled}
      type={type}
    />
  );
}
