import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names';

export const inputClass =
  'w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent';

export function Input({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input {...props} className={cx(inputClass, className)} />;
}
