// Turning a form a person drew on screen into the Flow JSON Meta will accept.
//
// WhatsApp Flows are a JSON document, not a UI: screens hold a layout, the
// layout holds a Form, the Form holds components, and the last component is
// a Footer whose action either navigates to the next screen or completes the
// flow. Meta validates the whole document on upload and answers with line
// and column numbers, so everything checkable is checked here first — a
// round trip to find out a label is one character too long is a bad trade.
//
// Shapes verified against Meta's Flow JSON reference: component properties
// are hyphenated (`input-type`, `on-click-action`), while the four
// top-level/screen keys below keep their underscores.

/** The Flow JSON version this builder emits. */
export const FLOW_JSON_VERSION = "7.3";

/** The version field on the interactive message that opens a flow. */
export const FLOW_MESSAGE_VERSION = "3";

export const FLOW_CATEGORIES = [
  "SIGN_UP",
  "SIGN_IN",
  "APPOINTMENT_BOOKING",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "SURVEY",
  "OTHER",
] as const;
export type FlowCategory = (typeof FLOW_CATEGORIES)[number];

export const COMPONENT_KINDS = [
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
  "TextInput",
  "TextArea",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "DatePicker",
  "OptIn",
] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export const INPUT_TYPES = ["text", "number", "email", "password", "passcode", "phone"] as const;
export type InputType = (typeof INPUT_TYPES)[number];

/** Components that collect an answer, as opposed to just displaying words. */
const ANSWERING: ReadonlySet<ComponentKind> = new Set([
  "TextInput",
  "TextArea",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "DatePicker",
  "OptIn",
]);

/** Components that offer a list of choices. */
const CHOOSING: ReadonlySet<ComponentKind> = new Set([
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
]);

export function isAnswering(kind: ComponentKind): boolean {
  return ANSWERING.has(kind);
}

export function isChoosing(kind: ComponentKind): boolean {
  return CHOOSING.has(kind);
}

// Meta's own limits. Exceeding any of them is a rejected upload, so the
// editor counts against these rather than discovering them later.
export const LIMITS = {
  screenTitle: 80,
  heading: 80,
  body: 4096,
  label: { TextInput: 20, TextArea: 20, DatePicker: 40, default: 30 },
  helperText: 80,
  footerLabel: 35,
  optionTitle: 30,
  childrenPerScreen: 50,
  options: 200,
} as const;

export function labelLimit(kind: ComponentKind): number {
  if (kind === "TextInput" || kind === "TextArea") return LIMITS.label.TextInput;
  if (kind === "DatePicker") return LIMITS.label.DatePicker;
  return LIMITS.label.default;
}

export function textLimit(kind: ComponentKind): number {
  return kind === "TextHeading" || kind === "TextSubheading" ? LIMITS.heading : LIMITS.body;
}

export interface FieldOption {
  id: string;
  title: string;
}

/** One component as the editor holds it — flat, so every kind uses one shape. */
export interface FormField {
  /** Editor-local, for React keys and reordering. Never reaches Meta. */
  key: string;
  kind: ComponentKind;
  /** Display components: the words shown. */
  text: string;
  /** Answering components: the key the answer arrives under. */
  name: string;
  label: string;
  inputType: InputType;
  required: boolean;
  helperText: string;
  options: FieldOption[];
}

export interface FormScreen {
  key: string;
  /** The id Meta routes by. Uppercase, unique, never "SUCCESS". */
  screenId: string;
  title: string;
  /** The Footer's label — the button at the bottom of the screen. */
  buttonLabel: string;
  fields: FormField[];
}

// --- defaults -------------------------------------------------------------

let counter = 0;
/** Editor-local ids. Not persisted as anything Meta sees. */
function localKey(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newField(kind: ComponentKind, existing: FormField[] = []): FormField {
  return {
    key: localKey("f"),
    kind,
    text: kind === "TextHeading" ? "Welcome to our form" : "",
    name: uniqueName(defaultName(kind), existing),
    label: defaultLabel(kind),
    inputType: "text",
    required: false,
    helperText: "",
    options: isChoosing(kind)
      ? [
          { id: "1", title: "Option 1" },
          { id: "2", title: "Option 2" },
        ]
      : [],
  };
}

export function newScreen(index: number): FormScreen {
  return {
    key: localKey("s"),
    screenId: normaliseScreenId(`SCREEN_${index + 1}`),
    title: index === 0 ? "Basic" : `Screen ${index + 1}`,
    buttonLabel: "Continue",
    fields: [],
  };
}

function defaultName(kind: ComponentKind): string {
  switch (kind) {
    case "TextInput":
      return "text_field";
    case "TextArea":
      return "long_text";
    case "Dropdown":
      return "choice";
    case "RadioButtonsGroup":
      return "option";
    case "CheckboxGroup":
      return "options";
    case "DatePicker":
      return "date";
    case "OptIn":
      return "consent";
    default:
      return "field";
  }
}

function defaultLabel(kind: ComponentKind): string {
  switch (kind) {
    case "TextInput":
      return "Your Name";
    case "TextArea":
      return "Message";
    case "Dropdown":
      return "Choose one";
    case "RadioButtonsGroup":
      return "Pick one";
    case "CheckboxGroup":
      return "Select any";
    case "DatePicker":
      return "Pick a date";
    case "OptIn":
      return "I agree to be contacted";
    default:
      return "";
  }
}

/**
 * Answers are keyed by name, so a repeat would silently overwrite.
 *
 * The suffix goes through normaliseFieldName so it comes out as a word —
 * "email_two", not "email_2", which Meta refuses.
 */
export function uniqueName(base: string, existing: FormField[]): string {
  const taken = new Set(existing.filter((field) => isAnswering(field.kind)).map((f) => f.name));
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = normaliseFieldName(`${base}_${suffix}`);
    if (!taken.has(candidate)) return candidate;
  }
  return normaliseFieldName(`${base}_${Date.now()}`);
}

/**
 * "Your Name" -> "your_name". Meta requires a JSON-safe identifier.
 *
 * Component names carry the same restriction as screen ids: letters and
 * underscores only, no digits. Digits are spelled out rather than dropped
 * so two fields that differ only by a number stay distinct.
 */
export function normaliseFieldName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/\d/g, (digit) => DIGIT_WORDS[Number(digit)].toLowerCase())
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  return cleaned && /^[a-z]/.test(cleaned) ? cleaned : `field_${cleaned}`.replace(/_+$/, "");
}

const DIGIT_WORDS = [
  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
] as const;

/**
 * "Contact us" -> "CONTACT_US". Screen ids route the flow.
 *
 * Meta allows letters and underscores only — a digit anywhere in a screen
 * id is rejected outright with "Property 'id' should only consist of
 * alphabets and underscores". Digits are spelled out rather than dropped,
 * so "SCREEN_2" and "SCREEN_3" stay distinct instead of collapsing into
 * one id and silently merging two screens.
 */
export function normaliseScreenId(input: string): string {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replace(/\d/g, (digit) => DIGIT_WORDS[Number(digit)])
    .replace(/[^A-Z]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    // A trailing underscore can survive the slice above.
    .replace(/_+$/, "");
  return cleaned && /^[A-Z]/.test(cleaned) ? cleaned : `SCREEN_${cleaned}`.replace(/_+$/, "");
}

/**
 * Brings a stored form back within Meta's rules.
 *
 * Forms saved before screen ids were known to reject digits carry ids like
 * SCREEN_1, which Meta refuses on every upload. Repairing on load fixes
 * them in place rather than leaving the author with a form that can never
 * be published and no way to see why. Navigation is derived from screen
 * order, not from stored references, so renaming an id breaks nothing.
 */
export function repairScreens(screens: FormScreen[]): FormScreen[] {
  const taken = new Set<string>();

  return repairNames(screens).map((screen) => {
    let id = normaliseScreenId(screen.screenId || "SCREEN");
    // SUCCESS is Meta's own end state and cannot be claimed by a screen.
    if (id === "SUCCESS") id = "SUCCESS_SCREEN";

    if (taken.has(id)) {
      let suffix = 2;
      while (taken.has(normaliseScreenId(`${id}_${suffix}`))) suffix += 1;
      id = normaliseScreenId(`${id}_${suffix}`);
    }
    taken.add(id);

    return { ...screen, screenId: id, fields: screen.fields };
  });
}

/**
 * Brings stored field names back within Meta's rules, keeping them unique
 * across the whole form — answers land in one object keyed by name, so a
 * repeat anywhere loses one of the two.
 */
function repairNames(screens: FormScreen[]): FormScreen[] {
  const taken = new Set<string>();

  return screens.map((screen) => ({
    ...screen,
    fields: screen.fields.map((field) => {
      if (!isAnswering(field.kind)) return field;

      let name = normaliseFieldName(field.name || defaultName(field.kind));
      if (taken.has(name)) {
        for (let suffix = 2; suffix < 500; suffix += 1) {
          const candidate = normaliseFieldName(`${name}_${suffix}`);
          if (!taken.has(candidate)) {
            name = candidate;
            break;
          }
        }
      }
      taken.add(name);

      return name === field.name ? field : { ...field, name };
    }),
  }));
}

// --- validation -----------------------------------------------------------

export interface Validation {
  ok: boolean;
  errors: string[];
}

export function validateFlow(screens: FormScreen[]): Validation {
  const errors: string[] = [];

  if (screens.length === 0) {
    return { ok: false, errors: ["A form needs at least one screen."] };
  }

  const seenScreenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const [index, screen] of screens.entries()) {
    const where = screen.title || `Screen ${index + 1}`;

    if (!screen.screenId) {
      errors.push(`${where} has no screen id.`);
    } else if (!/^[A-Z_]+$/i.test(screen.screenId)) {
      // Meta's rule, and its error names only a JSON path, so it is worth
      // saying plainly here instead.
      errors.push(
        `${where}: the screen id "${screen.screenId}" must be letters and underscores only — no numbers.`
      );
    }
    // SUCCESS is reserved by Meta as the implicit end state.
    if (screen.screenId === "SUCCESS") {
      errors.push(`"SUCCESS" is reserved by WhatsApp and can't be a screen id.`);
    }
    if (seenScreenIds.has(screen.screenId)) {
      errors.push(`Two screens share the id ${screen.screenId}.`);
    }
    seenScreenIds.add(screen.screenId);

    if (screen.title.length > LIMITS.screenTitle) {
      errors.push(`${where}: the title is over ${LIMITS.screenTitle} characters.`);
    }
    if (!screen.buttonLabel.trim()) {
      errors.push(`${where} needs a button label.`);
    }
    if (screen.buttonLabel.length > LIMITS.footerLabel) {
      errors.push(`${where}: the button label is over ${LIMITS.footerLabel} characters.`);
    }
    // The Footer counts towards the total, hence the -1.
    if (screen.fields.length > LIMITS.childrenPerScreen - 1) {
      errors.push(`${where} has more than ${LIMITS.childrenPerScreen - 1} components.`);
    }
    if (screen.fields.length === 0) {
      errors.push(`${where} is empty — add a heading or a question.`);
    }

    for (const field of screen.fields) {
      errors.push(...validateField(field, where, seenNames));
    }
  }

  return { ok: errors.length === 0, errors };
}

function validateField(field: FormField, where: string, seenNames: Set<string>): string[] {
  const errors: string[] = [];

  if (!isAnswering(field.kind)) {
    if (!field.text.trim()) {
      errors.push(`${where}: a ${field.kind} has no text.`);
    } else if (field.text.length > textLimit(field.kind)) {
      errors.push(`${where}: that ${field.kind} is over ${textLimit(field.kind)} characters.`);
    }
    return errors;
  }

  if (!field.name) {
    errors.push(`${where}: a question has no field name.`);
  } else if (!/^[a-z][a-z_]*$/.test(field.name)) {
    // Same rule as screen ids: WhatsApp allows letters and underscores only.
    errors.push(
      `${where}: the field name "${field.name}" must be lowercase letters and underscores only — no numbers.`
    );
  } else if (seenNames.has(field.name)) {
    // Answers are collected into one object keyed by name, so a repeat
    // anywhere in the flow loses one of the two.
    errors.push(`${where}: two questions are both named "${field.name}".`);
  }
  seenNames.add(field.name);

  if (!field.label.trim()) {
    errors.push(`${where}: "${field.name}" has no label.`);
  } else if (field.label.length > labelLimit(field.kind)) {
    errors.push(`${where}: the label for "${field.name}" is over ${labelLimit(field.kind)} characters.`);
  }

  if (field.helperText.length > LIMITS.helperText) {
    errors.push(`${where}: the instructions for "${field.name}" are over ${LIMITS.helperText} characters.`);
  }

  if (isChoosing(field.kind)) {
    if (field.options.length === 0) {
      errors.push(`${where}: "${field.name}" has no options.`);
    }
    if (field.options.length > LIMITS.options) {
      errors.push(`${where}: "${field.name}" has more than ${LIMITS.options} options.`);
    }
    const ids = new Set<string>();
    for (const option of field.options) {
      if (!option.title.trim()) errors.push(`${where}: an option under "${field.name}" is blank.`);
      if (option.title.length > LIMITS.optionTitle) {
        errors.push(`${where}: an option under "${field.name}" is over ${LIMITS.optionTitle} characters.`);
      }
      if (ids.has(option.id)) {
        errors.push(`${where}: two options under "${field.name}" share an id.`);
      }
      ids.add(option.id);
    }
  }

  return errors;
}

// --- the document Meta reads ---------------------------------------------

type Json = Record<string, unknown>;

export interface FlowJson {
  version: string;
  screens: Json[];
}

/**
 * Builds the Flow JSON.
 *
 * Screens hand their answers forward: a screen's Footer navigates with a
 * payload of everything gathered so far, and the next screen declares those
 * keys in `data` so it can pass them on again. Without that relay the final
 * `complete` payload would only ever hold the last screen's answers.
 */
export function buildFlowJson(screens: FormScreen[]): FlowJson {
  return {
    version: FLOW_JSON_VERSION,
    screens: screens.map((screen, index) => {
      const isLast = index === screens.length - 1;
      const inherited = screens.slice(0, index).flatMap(answeringFields);
      const own = answeringFields(screen);

      // Everything the next screen (or the completion) should receive:
      // this screen's own answers plus everything relayed into it.
      const payload: Json = {};
      for (const field of inherited) payload[field.name] = `\${data.${field.name}}`;
      for (const field of own) payload[field.name] = `\${form.${field.name}}`;

      const children = screen.fields.map(toComponent);
      children.push({
        type: "Footer",
        label: screen.buttonLabel,
        "on-click-action": isLast
          ? { name: "complete", payload }
          : {
              name: "navigate",
              next: { type: "screen", name: screens[index + 1].screenId },
              payload,
            },
      });

      const document: Json = {
        id: screen.screenId,
        title: screen.title,
        layout: {
          type: "SingleColumnLayout",
          children: [{ type: "Form", name: "form", children }],
        },
      };

      // Only screens after the first receive anything, and `data` must
      // carry an example so Meta can type-check the references.
      if (inherited.length > 0) {
        const data: Json = {};
        for (const field of inherited) data[field.name] = dataSchema(field);
        document.data = data;
      }

      // A flow has to be able to end. The last screen is where it does.
      if (isLast) {
        document.terminal = true;
        document.success = true;
      }

      return document;
    }),
  };
}

function answeringFields(screen: FormScreen): FormField[] {
  return screen.fields.filter((field) => isAnswering(field.kind));
}

/** The declared type of a relayed answer, with the example Meta requires. */
function dataSchema(field: FormField): Json {
  if (field.kind === "OptIn") return { type: "boolean", __example__: false };
  if (field.kind === "CheckboxGroup") {
    return { type: "array", items: { type: "string" }, __example__: [] };
  }
  return { type: "string", __example__: "" };
}

function toComponent(field: FormField): Json {
  const trimmedHelper = field.helperText.trim();

  switch (field.kind) {
    case "TextHeading":
    case "TextSubheading":
    case "TextBody":
    case "TextCaption":
      return { type: field.kind, text: field.text };

    case "TextInput":
      return {
        type: "TextInput",
        name: field.name,
        label: field.label,
        "input-type": field.inputType,
        required: field.required,
        ...(trimmedHelper ? { "helper-text": trimmedHelper } : {}),
      };

    case "TextArea":
      return {
        type: "TextArea",
        name: field.name,
        label: field.label,
        required: field.required,
        ...(trimmedHelper ? { "helper-text": trimmedHelper } : {}),
      };

    case "DatePicker":
      return {
        type: "DatePicker",
        name: field.name,
        label: field.label,
        required: field.required,
        ...(trimmedHelper ? { "helper-text": trimmedHelper } : {}),
      };

    case "OptIn":
      // OptIn takes no helper text and no label limit beyond 30; it is a
      // checkbox with a sentence beside it.
      return {
        type: "OptIn",
        name: field.name,
        label: field.label,
        required: field.required,
      };

    case "Dropdown":
    case "RadioButtonsGroup":
    case "CheckboxGroup":
      return {
        type: field.kind,
        name: field.name,
        label: field.label,
        required: field.required,
        "data-source": field.options.map((option) => ({
          id: option.id,
          title: option.title,
        })),
      };
  }
}

/**
 * The answers a completed flow will hand back, in order.
 *
 * Used to show the author what the submission will look like, and to render
 * a response once one arrives.
 */
export function answerKeys(screens: FormScreen[]): Array<{ name: string; label: string }> {
  return screens.flatMap((screen) =>
    answeringFields(screen).map((field) => ({ name: field.name, label: field.label }))
  );
}
