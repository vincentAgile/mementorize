'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface QueueMenuProps {
  english: string;
  position: number;
  total: number;
  /** « Monter » and « Descendre »: only when the list shows the whole queue, in order. */
  stepwise: boolean;
  onMove: (position: number) => void;
}

/**
 * MEM-64: where to put an item of the learning queue. A menu button, for
 * every device, the keyboard and screen readers: « Monter », « Descendre »
 * (when the whole queue is shown, in order), « En premier », « En dernier ».
 */
export function QueueMenu({ english, position, total, stepwise, onMove }: QueueMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Closed by a click elsewhere, or Escape (the focus back on the button).
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    box.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const choices = [
    ...(stepwise
      ? [
          { label: 'Monter', target: position - 1 },
          { label: 'Descendre', target: position + 1 },
        ]
      : []),
    { label: 'En premier', target: 1 },
    { label: 'En dernier', target: total },
  ];

  return (
    <div className="queue-menu" ref={box}>
      <button
        ref={button}
        type="button"
        className="row-actions__icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Déplacer « ${english} » dans la file (position ${position} sur ${total})`}
        title="Déplacer dans la file"
        onClick={() => setOpen(!open)}
      >
        <svg
          viewBox="0 0 24 24"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" className="queue-menu__list" aria-label={`Déplacer « ${english} »`}>
          {choices.map(({ label, target }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={target < 1 || target > total || target === position}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                onMove(target);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
