// How long a free trial lasts.
//
// One place, because the number was written into seven files and a
// migration. A default that disagrees with itself is worse than a wrong
// one: the banner counts down from a different number than the welcome
// email promised, and neither matches what the database actually gave.

/** Used when platform_settings has nothing to say. */
export const DEFAULT_TRIAL_DAYS = 7;

/**
 * Reads the configured length out of the `billing` platform setting.
 *
 * The value is an object — {"trial_days": 7} — not a bare number, which
 * is worth stating because reading it as one is a bug that shows up only
 * as everybody silently getting the default.
 */
export function readTrialDays(value: unknown): number {
  const days = (value as { trial_days?: unknown } | null)?.trial_days;
  return typeof days === "number" && Number.isFinite(days) && days > 0
    ? Math.floor(days)
    : DEFAULT_TRIAL_DAYS;
}
