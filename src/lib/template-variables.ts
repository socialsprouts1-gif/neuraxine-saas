// The placeholders in a template, of either kind Meta supports.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Meta has two: positional — {{1}}, {{2}} — and named, {{customer_name}}.
// A template declares which through parameter_format, and the send must
// match. A named one takes a parameter_name on every parameter; a
// positional one must not.
//
// Everything here counted digits and nothing else, so a template written
// in WhatsApp Manager as "Hi {{customer_name}}" was read as having no
// variables at all. The builder asked for no values, the dispatcher sent
// no parameters, and Meta refused every recipient with 132000: number of
// localizable_params (0) does not match the expected number of params
// (1). It was never a sync problem — the placeholder simply was not the
// shape the regex knew.

export interface TemplateVariable {
  /** "1" for a positional slot, "customer_name" for a named one. */
  token: string;
  named: boolean;
}

/** Anything between double braces, with the braces stripped. */
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Every placeholder in the text, in the order the send must supply them.
 *
 * Positional ones come back in numeric order because that is the order
 * Meta reads them in, whatever order they appear in the sentence.
 * Named ones keep the order they are written, which is the order a
 * person filling the form in expects to be asked.
 */
export function templateVariables(text: string): TemplateVariable[] {
  const positional: number[] = [];
  const named: string[] = [];

  for (const match of (text ?? "").matchAll(PLACEHOLDER)) {
    const token = match[1].trim();
    if (!token) continue;

    if (/^\d+$/.test(token)) {
      const index = Number(token);
      if (!positional.includes(index)) positional.push(index);
    } else if (!named.includes(token)) {
      named.push(token);
    }
  }

  // A template is one kind or the other. If somebody has written both,
  // the named ones are what Meta will have registered — a bare {{1}}
  // beside {{name}} is not a format Meta accepts, and guessing
  // positional would send a parameter_name-less parameter into a NAMED
  // template, which is refused.
  if (named.length > 0) {
    return named.map((token) => ({ token, named: true }));
  }

  return positional
    .sort((a, b) => a - b)
    .map((index) => ({ token: String(index), named: false }));
}

/** Whether this template uses named placeholders. */
export function isNamedTemplate(text: string): boolean {
  return templateVariables(text).some((variable) => variable.named);
}

/**
 * How many values the send has to supply.
 *
 * The one number the builder asks for and the dispatcher sends. They
 * used to compute it separately, both counting only digits.
 */
export function variableCount(text: string): number {
  return templateVariables(text).length;
}

/**
 * One parameter, in the shape the template's own format requires.
 *
 * parameter_name is required on a NAMED template and refused on a
 * positional one, so it is set from the placeholder rather than from a
 * flag somebody has to remember to pass.
 */
export function templateParameter(
  variable: TemplateVariable,
  value: string | undefined
): Record<string, unknown> {
  // A blank parameter is refused outright, so an unfilled slot becomes a
  // space. Losing a word beats losing the whole message.
  const text = (value ?? "").trim() || " ";
  return variable.named
    ? { type: "text", parameter_name: variable.token, text }
    : { type: "text", text };
}

/**
 * Fills the placeholders in for a preview, whichever kind they are.
 *
 * Positional values are taken by index; named ones by the order they
 * appear, which is the order the form asked for them.
 */
export function fillTemplateText(text: string, values: readonly string[]): string {
  const variables = templateVariables(text);
  const byToken = new Map(variables.map((variable, index) => [variable.token, values[index]]));

  return (text ?? "").replace(PLACEHOLDER, (whole, raw: string) => {
    const filled = byToken.get(raw.trim());
    return filled?.trim() ? filled : whole;
  });
}
