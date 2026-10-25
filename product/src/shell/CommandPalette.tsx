import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { navigate } from '../lib/router';
import { Dialog } from '../ui';
import { NAV_ITEMS } from './Nav';

export interface PaletteAction {
  id: string;
  label: string;
  /** The text the palette matches on, in addition to the label. */
  keywords?: string[];
  run: () => void;
}

/**
 * The palette opens on Cmd/Ctrl+K and nothing else: no bare letter is bound, so a focused input
 * always receives its keystrokes. Escape closes it (through the dialog). Every entry is a route the
 * shell already links to, or an action the shell already exposes — the palette adds no new surface.
 */
export function CommandPalette({ actions }: { actions: PaletteAction[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function choose(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <Dialog
      className="p-0"
      description="Jump to a screen or run an action."
      onClose={() => setOpen(false)}
      open={open}
      title="Command palette"
    >
      <Command className="flex flex-col" label="Command palette">
        <div className="border-b border-border px-4">
          <Command.Input
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-text-subtle"
            placeholder="Search screens and actions…"
          />
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-text-muted">
            Nothing matches. Try another word.
          </Command.Empty>
          <Command.Group
            className="text-xs text-text-subtle [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
            heading="Go to"
          >
            {NAV_ITEMS.map((item) => (
              <Command.Item
                className={PALETTE_ITEM}
                key={item.href}
                keywords={[item.label.toLowerCase()]}
                onSelect={() => choose(() => navigate(item.href))}
                value={`go ${item.label}`}
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
          {actions.length > 0 ? (
            <Command.Group
              className="text-xs text-text-subtle [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide"
              heading="Actions"
            >
              {actions.map((action) => (
                <Command.Item
                  className={PALETTE_ITEM}
                  key={action.id}
                  keywords={action.keywords}
                  onSelect={() => choose(action.run)}
                  value={action.label}
                >
                  {action.label}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-text-subtle">
          <span>
            <kbd className="font-mono">↑↓</kbd> to move · <kbd className="font-mono">Enter</kbd> to
            open
          </span>
          <span>
            <kbd className="font-mono">Esc</kbd> to close
          </span>
        </div>
      </Command>
    </Dialog>
  );
}

const PALETTE_ITEM =
  'flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm text-text data-[selected=true]:bg-surface-muted';
