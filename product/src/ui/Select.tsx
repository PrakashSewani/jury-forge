import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names';
import { inputClass } from './Input';

export function Select({ className, ...props }: ComponentPropsWithoutRef<'select'>) {
  return <select {...props} className={cx(inputClass, className)} />;
}
