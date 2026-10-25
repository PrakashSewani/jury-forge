import { Tabs as TabsPrimitive } from 'radix-ui';
import { cx, focusRing, tapTarget } from './class-names';

export interface TabItem {
  id: string;
  label: string;
  /** Id of the panel this tab controls, when the caller renders panels. */
  panelId?: string;
}

/**
 * A tab list with the WAI-ARIA keyboard model: arrows move between tabs, Home and End jump to the
 * ends, and only the selected tab sits in the tab order. Radix owns that behaviour; this wrapper
 * keeps the `items`/`value`/`onChange` contract the screens already use.
 */
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
    <TabsPrimitive.Root onValueChange={onChange} value={value}>
      <TabsPrimitive.List
        className={cx('flex items-center gap-1 overflow-x-auto border-b border-border', className)}
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            aria-controls={item.panelId}
            className={cx(
              `shrink-0 rounded-control px-3 py-2 text-sm font-medium transition ${tapTarget} ${focusRing}`,
              'data-[state=active]:bg-surface-muted data-[state=active]:text-text',
              'text-text-muted hover:text-text',
            )}
            key={item.id}
            value={item.id}
          >
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
