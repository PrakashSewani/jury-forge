import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { cx, focusRing, tapTarget } from './class-names';

export interface TabItem {
  id: string;
  label: string;
  /** Id of the panel this tab controls, when the caller renders panels (slice B). */
  panelId?: string;
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((item) => item.id === value);
  // Roving tabindex: only one tab is in the tab order, so Tab reaches the tablist once and the
  // arrow keys move within it — the APG tabs pattern this element's role claims.
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  function selectTab(index: number) {
    const next = (index + items.length) % items.length;
    refs.current[next]?.focus();
    onChange(items[next].id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectTab(index + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectTab(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      selectTab(items.length - 1);
    }
  }

  return (
    <div className={cx('flex items-center gap-1 border-b border-border', className)} role="tablist">
      {items.map((item, index) => (
        <button
          aria-controls={item.panelId}
          aria-selected={item.id === value}
          className={cx(
            `rounded-control px-3 py-2 text-sm font-medium transition ${tapTarget} ${focusRing}`,
            item.id === value ? 'text-text' : 'text-text-muted hover:text-text',
          )}
          key={item.id}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          ref={(node) => {
            refs.current[index] = node;
          }}
          role="tab"
          tabIndex={index === tabbableIndex ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
