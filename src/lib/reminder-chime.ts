// The notification sound.
//
// Synthesised rather than shipped as a file. An .mp3 is one more thing to
// host, cache and get a 404 from, and a two-note chime is a dozen lines of
// Web Audio — which also means it cannot fail to load, only fail to play.

/**
 * Plays a short two-note chime. Never throws.
 *
 * Browsers refuse to start audio until the page has been interacted with,
 * so this can legitimately do nothing — the popup is the notification and
 * the sound is the accompaniment, never the other way round. Once somebody
 * has clicked anything on the page, it works for the rest of the session.
 */
export async function playChime(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const context = new Ctor();
    // Suspended is what a browser returns when no gesture has happened yet.
    // Resuming is allowed to fail, and failing quietly is the right answer.
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    if (context.state !== "running") {
      await context.close().catch(() => undefined);
      return;
    }

    const start = context.currentTime;
    // A rising fifth: recognisable as a notification rather than an error,
    // and short enough not to be the thing somebody remembers about it.
    for (const [index, frequency] of [880, 1318.5].entries()) {
      const at = start + index * 0.13;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, at);

      // Ramped rather than switched on: a square edge on a gain node is an
      // audible click before the note.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.3);
    }

    // Closed after the notes have finished, so the tab does not accumulate
    // an audio context per reminder.
    window.setTimeout(() => void context.close().catch(() => undefined), 800);
  } catch {
    // No sound is a small loss. An exception here would be thrown from a
    // poll that is meant to be invisible.
  }
}
