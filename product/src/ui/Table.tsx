import type { ComponentPropsWithoutRef } from 'react';
import { cx } from './class-names';

export function Table({ className, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table {...props} className={cx(className)} />
    </div>
  );
}

export function Row({ className, ...props }: ComponentPropsWithoutRef<'tr'>) {
  return <tr {...props} className={cx(className)} />;
}
