'use client';

import Link from 'next/link';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { fullNameOf, initialsOf } from '../lib/initials';
import type { Profile } from '../lib/types';
import { logoutAction } from './(auth)/actions';

/**
 * The account menu (MEM-10): the avatar of the header opens a popup with the
 * account (initials, name, e-mail), "Profil", "Ressources" and "Déconnexion". It follows
 * the "menu button" pattern of the WAI-ARIA guide: arrows to move between
 * the entries, Escape to close, and the focus goes back to the avatar.
 */
export function AccountMenu({ profile }: { profile: Profile }) {
  const { email } = profile;
  const name = fullNameOf(profile);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = initialsOf(profile);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  // Opening with the keyboard puts the focus on the first entry (or the last
  // one with ArrowUp); `focusOnOpen` says which, until the menu is rendered.
  const focusOnOpen = useRef<'first' | 'last' | null>(null);
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    const entries = items();
    (focusOnOpen.current === 'first' ? entries[0] : entries[entries.length - 1])?.focus();
    focusOnOpen.current = null;
  }, [open]);

  // A click (or a tap) outside the menu closes it, without stealing the focus.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onButtonKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOnOpen.current = event.key === 'ArrowDown' ? 'first' : 'last';
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const entries = items();
    const current = entries.indexOf(document.activeElement as HTMLElement);
    const move = (index: number) => entries[(index + entries.length) % entries.length]?.focus();

    switch (event.key) {
      case 'ArrowDown':
        move(current + 1);
        break;
      case 'ArrowUp':
        move(current - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(entries.length - 1);
        break;
      case 'Escape':
        close(true);
        break;
      case 'Tab':
        close(false); // let the focus go on to the next element of the page
        return;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="avatar"
        aria-label={`Mon compte (${email})`}
        title="Mon compte"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          // As in the WAI-ARIA example, opening puts the focus on the first entry.
          focusOnOpen.current = 'first';
          setOpen((wasOpen) => !wasOpen);
        }}
        onKeyDown={onButtonKeyDown}
      >
        {initials}
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="account-menu__popup"
          role="menu"
          aria-label="Mon compte"
          onKeyDown={onMenuKeyDown}
        >
          <div className="account-menu__identity">
            <span className="avatar avatar--large" aria-hidden="true">
              {initials}
            </span>
            <div className="account-menu__who">
              {name && <strong>{name}</strong>}
              <span>{email}</span>
            </div>
          </div>

          <Link
            href="/profil"
            role="menuitem"
            tabIndex={-1}
            className="account-menu__item"
            onClick={() => close(false)}
          >
            Profil
          </Link>
          <Link
            href="/ressources"
            role="menuitem"
            tabIndex={-1}
            className="account-menu__item"
            onClick={() => close(false)}
          >
            Ressources
          </Link>
          <hr className="account-menu__separator" role="separator" />
          <form action={logoutAction}>
            <button type="submit" role="menuitem" tabIndex={-1} className="account-menu__item">
              <LogoutIcon />
              Déconnexion
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** An open frame with an arrow going out of it (MEM-12). */
function LogoutIcon() {
  return (
    <svg
      className="account-menu__icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M10 12h10" />
      <path d="m16 8 4 4-4 4" />
    </svg>
  );
}
