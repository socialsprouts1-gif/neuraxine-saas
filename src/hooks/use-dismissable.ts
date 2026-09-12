"use client";

import { useEffect, useRef, type RefObject } from "react";

// Closing a menu the way people expect.
//
// Every dropdown in the inbox was opened by a button and closed only by that
// same button. Clicking anywhere else left it hanging over the conversation,
// and the only way out was to find the button again — which is not how a
// menu has behaved anywhere since about 1995.
//
// One hook rather than four copies, because the fiddly parts are the same
// everywhere and each copy gets a different one of them wrong.

export interface DismissOptions {
  /** Skip the listeners entirely while the menu is shut. */
  active?: boolean;
  /** Escape closes it too. On unless a caller has its own handling. */
  escape?: boolean;
}

/**
 * Returns a ref to put on the element that wraps *both* the trigger and the
 * panel — not on the panel alone.
 *
 * That distinction is the whole trick. With the ref on the panel, clicking
 * the trigger to close registers as an outside click, the hook closes it,
 * and then the trigger's own handler reopens it in the same tick — so the
 * menu never shuts and it looks like the click did nothing.
 */
export function useDismissable<T extends HTMLElement>(
  onDismiss: () => void,
  { active = true, escape = true }: DismissOptions = {}
): RefObject<T | null> {
  const ref = useRef<T>(null);
  // Held in a ref so a caller passing an inline arrow does not re-subscribe
  // on every render — which, with pointerdown, is a listener churn that
  // shows up as a dropped first click. Written in an effect rather than
  // during render: a render can be thrown away and re-run, and a ref
  // written from one that was is left holding a callback nobody kept.
  const handler = useRef(onDismiss);
  useEffect(() => {
    handler.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: PointerEvent) => {
      const element = ref.current;
      if (!element) return;

      const target = event.target;
      if (!(target instanceof Node)) return;

      // composedPath covers a target inside a shadow root — the emoji
      // picker's scrollbar being one — where contains() says false.
      const path = event.composedPath?.();
      if (path?.includes(element) || element.contains(target)) return;

      handler.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (escape && event.key === "Escape") handler.current();
    };

    // pointerdown rather than click: a drag that starts inside the panel and
    // releases outside it — selecting text in a suggestion, dragging a
    // slider — is not a click outside, and `click` would treat it as one.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, escape]);

  return ref;
}

/**
 * The same, for a native `<details>` menu.
 *
 * `<details>` has no outside-click behaviour of its own and its open state
 * is a DOM attribute rather than React state, so it needs its own small
 * version rather than being bent into the one above.
 */
export function useDismissableDetails(): RefObject<HTMLDetailsElement | null> {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const element = ref.current;
      if (!element?.open) return;

      const target = event.target;
      if (!(target instanceof Node)) return;
      if (element.contains(target)) return;

      element.open = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return ref;
}
