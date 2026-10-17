import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names';
import { inputClass } from './Input';

export function Textarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea {...props} className={cx(inputClass, className)} />;
}
