import { cx } from './class-names';

export interface TabItem {
  id: string;
  label: string;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center gap-1 border-b border-border', className)} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={item.id === value}
          className={cx(
            'rounded-control px-3 py-2 text-sm font-medium transition',
            item.id === value ? 'text-text' : 'text-text-muted hover:text-text',
          )}
          key={item.id}
          onClick={() => onChange(item.id)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
