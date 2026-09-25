/**
 * The marker an assistant writes to ask for a form: `[[form: Some name]]`.
 *
 * A function rather than a shared constant because the pattern is global,
 * and a global regex carries `lastIndex` between uses — a single shared
 * object would work in `replace` and then quietly skip the first match the
 * next time anyone reached for `test` or `exec`. Handing out a fresh one
 * removes the trap rather than documenting it.
 */
export function formMarkerPattern(): RegExp {
  return /\[\[\s*form\s*:\s*([^\]]+?)\s*\]\]/gi;
}
