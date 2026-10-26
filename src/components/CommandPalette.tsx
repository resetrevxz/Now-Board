import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from './ui';
import { Icon, type IconName } from './Icon';
import { Kbd } from './ui';
import { cx } from '../lib/cx';

export interface CommandItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  keywords?: string;
  icon?: IconName;
  emoji?: string;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useDialogFocus(panelRef, open, onClose);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (!normalized) return true;
    const haystack = `${item.label} ${item.group} ${item.keywords ?? ''}`.toLowerCase();
    return normalized.split(/\s+/).every((part) => haystack.includes(part));
  });

  useEffect(() => {
    setSelected((current) =>
      filtered.length === 0 ? 0 : Math.min(current, filtered.length - 1),
    );
  }, [filtered.length]);

  useEffect(() => {
    const active = document.getElementById(`${listId}-opt-${filtered[selected]?.id ?? ''}`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [selected, filtered, listId]);

  if (!open) return null;

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    item.action();
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => (filtered.length === 0 ? 0 : (current + 1) % filtered.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) =>
        filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(filtered[selected]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';

  return createPortal(
    <div
      className="palette-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        tabIndex={-1}
      >
        <div className="palette__search">
          <Icon name="search" size={17} className="palette__search-icon" />
          <input
            className="palette__input"
            data-autofocus
            value={query}
            placeholder="Search commands, statuses, tasks…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              filtered[selected] ? `${listId}-opt-${filtered[selected].id}` : undefined
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKey}
          />
          <span className="palette__esc">
            <Kbd>Esc</Kbd>
          </span>
        </div>

        <div className="palette__list" id={listId} role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="palette__empty">
              <Icon name="search" size={18} />
              <span>No command matches “{query.trim()}”.</span>
              <span>Try “present”, “goal”, “focus” or “theme”.</span>
            </div>
          ) : (
            filtered.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {showGroup ? <div className="palette__group-label">{item.group}</div> : null}
                  <button
                    type="button"
                    id={`${listId}-opt-${item.id}`}
                    role="option"
                    aria-selected={index === selected}
                    className={cx('palette__item', index === selected && 'is-selected')}
                    onMouseMove={() => setSelected(index)}
                    onClick={() => run(item)}
                  >
                    <span className="palette__icon" aria-hidden="true">
                      {item.emoji ? (
                        <span className="palette__emoji">{item.emoji}</span>
                      ) : (
                        <Icon name={item.icon ?? 'sparkles'} size={14} />
                      )}
                    </span>
                    <span className="palette__label">{item.label}</span>
                    {item.hint ? <span className="palette__hint">{item.hint}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="palette__footer">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            Move
          </span>
          <span>
            <Kbd>↵</Kbd>
            Run
          </span>
          <span>
            <Kbd>Esc</Kbd>
            Close
          </span>
          <span style={{ marginLeft: 'auto' }}>{filtered.length} commands</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
