"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// A dialog that actually covers the screen.
//
// Every modal in here used to be a plain `fixed inset-0` div sitting where
// it was written in the tree, and that is broken in a way nobody would
// guess from reading it: `.glass-card` carries `backdrop-filter`, and an
// ancestor with a backdrop-filter, filter, transform or will-change
// becomes the containing block for `position: fixed` inside it. So a
// dialog opened from a button inside a card was laid out against that
// card — a backdrop that dimmed one stat tile, a panel clipped at the
// card's edge with its buttons below the cut, and no way to scroll to
// them because the layout's own `overflow-hidden` was the next thing out.
//
// A portal to document.body fixes it by leaving the tree altogether.
// Three things come with it, because a dialog that lacks any of them is
// one people describe as broken: click the backdrop to close, press
// Escape to close, and scroll when the panel is taller than the window.

/**
 * The half that fixes the bug: the portal, Escape, the scroll container
 * and the backdrop click. A dialog with its own layout — a builder with
 * two columns, say — uses this and supplies its own panel.
 */
export function ModalShell({
  open,
  onClose,
  label,
  dismissable = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  dismissable?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissable) onClose();
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, dismissable]);

  // No mounted flag and no effect to set one: this starts closed on every
  // render, so the server renders nothing and there is nothing to hydrate
  // a mismatch against. By the time open is true, a person has clicked.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-label={label}
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/60 backdrop-blur-sm"
      // Only a click that started on the backdrop itself. Without the
      // target check, releasing the mouse outside after selecting text
      // inside the panel closes the dialog and throws the work away.
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:p-6">{children}</div>
    </div>,
    document.body
  );
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  /** Wider for a builder, narrower for a confirm. */
  size = "md",
  /** Off while a payment is in flight: closing then would lose the result. */
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  dismissable?: boolean;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  // Focus moves into the dialog so the keyboard goes with it, and Escape
  // works without clicking first.
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  const width = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-5xl",
  }[size];

  return (
    <ModalShell open={open} onClose={onClose} label={title} dismissable={dismissable}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full ${width} my-auto rounded-3xl border border-white/10 bg-[var(--app-bg)] shadow-2xl outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/8">
          <div className="min-w-0">
            <h2 className="font-semibold">{title}</h2>
            {description && (
              <div className="text-xs text-white/45 mt-1 leading-relaxed">{description}</div>
            )}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 -mr-2 -mt-1 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-white/8 flex flex-wrap gap-2 justify-end">
            {footer}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
