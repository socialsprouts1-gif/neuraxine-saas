// The inbox chime, synthesised rather than loaded.
//
// A generated tone needs no asset request, no CDN, and cannot 404 behind a
// firewall — and it stays a few hundred bytes rather than a file the page
// has to fetch before it can ever make a sound.

let context: AudioContext | null = null;
let unlocked = false;

type WindowWithWebkitAudio = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;

  const Ctor =
    window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctor) return null;

  try {
    context = new Ctor();
    return context;
  } catch {
    // Some locked-down browsers refuse to construct one at all.
    return null;
  }
}

/**
 * Browsers start an AudioContext suspended until the page has been
 * interacted with, so the first chime after a cold load would be silent.
 * Call this once on mount: it resumes the context on the first click or
 * keypress and then takes itself off the page.
 */
export function armNotificationSound(): () => void {
  if (typeof window === "undefined" || unlocked) return () => {};

  const unlock = () => {
    unlocked = true;
    const ctx = audioContext();
    if (ctx && ctx.state === "suspended") void ctx.resume();
    remove();
  };

  const remove = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  return remove;
}

/**
 * Two short notes, the second a fifth above the first. Quiet enough to sit
 * in an office all day, distinct enough to notice across a room.
 *
 * Never throws: a browser that refuses audio should not take the inbox down
 * with it, and the message still arrives on screen either way.
 */
export function playNotificationSound(volume = 0.18): void {
  const ctx = audioContext();
  if (!ctx) return;

  // Still suspended means the page has not been interacted with yet. There
  // is nothing to be done about it, and calling start() anyway logs a
  // warning on every message.
  if (ctx.state === "suspended") {
    void ctx.resume();
    if (ctx.state === "suspended") return;
  }

  try {
    const now = ctx.currentTime;
    // 880 Hz then 1318.5 Hz — A5 and E6.
    const notes: Array<[number, number]> = [
      [880, 0],
      [1318.5, 0.09],
    ];

    for (const [frequency, offset] of notes) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      // An envelope rather than a hard start and stop: a square-edged tone
      // clicks, and the click is the part people find irritating.
      const start = now + offset;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    }
  } catch {
    // Audio is a courtesy. Losing it is not worth an error boundary.
  }
}

// --- the mute preference ---------------------------------------------------
//
// A tiny external store rather than component state: useSyncExternalStore
// reads it without an effect, which keeps the server render and the first
// client render agreeing, and the storage event keeps two open tabs in step.

const MUTE_KEY = "neura.inbox.muted";
const listeners = new Set<() => void>();
let cachedMuted: boolean | null = null;

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    // Private window, or site data blocked. Unmuted is the useful default.
    return false;
  }
}

export function subscribeMuted(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== MUTE_KEY) return;
    cachedMuted = null;
    listeners.forEach((listener) => listener());
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Must return a stable value between renders, so the read is cached. */
export function getMuted(): boolean {
  if (cachedMuted === null) cachedMuted = readMuted();
  return cachedMuted;
}

/** The server has no storage, and neither does the first client render. */
export function getMutedOnServer(): boolean {
  return false;
}

export function setMuted(next: boolean): void {
  cachedMuted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // The toggle still holds for this session.
  }
  listeners.forEach((listener) => listener());
}
