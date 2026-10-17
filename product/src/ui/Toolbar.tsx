import type { ReactNode } from 'react';
import { cx } from './class-names';

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex items-center gap-2', className)}>{children}</div>;
}
