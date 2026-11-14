import {
  LIMITS,
  isChoosing,
  labelLimit,
  normaliseFieldName,
  normaliseScreenId,
  textLimit,
  type ComponentKind,
  type FlowCategory,
  type FormField,
  type FormScreen,
  type InputType,
} from "./flow-json.ts";

// Forms that already exist when you open the screen.
//
// A blank form is the wrong place to start. WhatsApp Forms have a lot of
// small rules — a TextInput label may be 20 characters and not 21, a screen
// id may not be "SUCCESS", every answer key has to be unique within the
// form — and finding each one out by having Meta refuse the upload is a
// miserable way to learn them. Every template here is inside those limits,
// which the tests check rather than trust.
//
// Written as plain data and turned into editor screens on use, so a template
// is something you can read and change without knowing the editor's model.
//
// Imported with the .ts extension: the test runner strips types but does not
// resolve the "@/" alias, so a tested module has to reach its neighbour by
// relative path.

/** One component in a template, with everything optional but the kind. */
export interface TemplateField {
  kind: ComponentKind;
  /** The words shown, for headings and body text. */
  text?: string;
  /** The key the answer arrives under. Defaults from the label. */
  name?: string;
  label?: string;
  inputType?: InputType;
  required?: boolean;
  helperText?: string;
  /** Choices, for dropdowns, radios and checkboxes. */
  options?: string[];
}

export interface TemplateScreen {
  screenId: string;
  title: string;
  buttonLabel: string;
  fields: TemplateField[];
}

export interface FormTemplate {
  slug: string;
  /** What the form is called when it is created. */
  name: string;
  /** One line under the name in the picker. */
  description: string;
  category: FlowCategory;
  /** The message that goes out with the form when a bot offers it. */
  invitation: string;
  /** The label on the button that opens it. 20 characters at most. */
  buttonText: string;
  screens: TemplateScreen[];
}

// A note on labels: WhatsApp allows 20 characters on a TextInput or TextArea
// label and 30 on a chooser, which is tighter than it sounds. "Which service
// are you interested in?" does not fit; it goes in the heading instead, with
// the label kept to a couple of words.

export const FORM_TEMPLATES: readonly FormTemplate[] = [
  {
    slug: "appointment",
    name: "Book an appointment",
    description: "Date, time and reason — everything needed to put someone in the diary.",
    category: "APPOINTMENT_BOOKING",
    invitation: "Happy to book you in. Tap below and pick a time that suits you.",
    buttonText: "Book a time",
    screens: [
      {
        screenId: "BOOKING",
        title: "Book an appointment",
        buttonLabel: "Request booking",
        fields: [
          { kind: "TextHeading", text: "Let's find you a time" },
          {
            kind: "TextBody",
            text: "Tell us when suits and we will confirm on WhatsApp shortly.",
          },
          { kind: "TextInput", name: "full_name", label: "Your name", required: true },
          {
            kind: "TextInput",
            name: "phone",
            label: "Phone number",
            inputType: "phone",
            required: true,
            helperText: "So we can confirm if WhatsApp is unavailable.",
          },
          { kind: "DatePicker", name: "preferred_date", label: "Preferred date", required: true },
          {
            kind: "RadioButtonsGroup",
            name: "preferred_time",
            label: "Preferred time",
            required: true,
            options: ["Morning (9am – 12pm)", "Afternoon (12pm – 4pm)", "Evening (4pm – 8pm)"],
          },
          {
            kind: "TextArea",
            name: "reason",
            label: "What is it for",
            helperText: "Optional, but it helps us prepare.",
          },
        ],
      },
    ],
  },
  {
    slug: "lead",
    name: "Enquiry",
    description: "Name, contact and what they want — the everyday lead capture form.",
    category: "LEAD_GENERATION",
    invitation: "Tell us a little about what you need and the right person will get back to you.",
    buttonText: "Send enquiry",
    screens: [
      {
        screenId: "ENQUIRY",
        title: "Tell us about your enquiry",
        buttonLabel: "Send",
        fields: [
          { kind: "TextHeading", text: "How can we help?" },
          { kind: "TextInput", name: "full_name", label: "Your name", required: true },
          {
            kind: "TextInput",
            name: "email",
            label: "Email",
            inputType: "email",
            helperText: "Optional. We will reply on WhatsApp either way.",
          },
          { kind: "TextInput", name: "company", label: "Business name" },
          {
            kind: "Dropdown",
            name: "interest",
            label: "What are you after",
            required: true,
            options: ["A quote", "Product details", "Bulk or wholesale", "Something else"],
          },
          {
            kind: "TextArea",
            name: "message",
            label: "Your message",
            required: true,
            helperText: "The more detail, the better the answer.",
          },
          {
            kind: "OptIn",
            name: "marketing_optin",
            label: "Send me offers on WhatsApp",
          },
        ],
      },
    ],
  },
  {
    slug: "feedback",
    name: "Customer feedback",
    description: "A rating and a comment, short enough that people actually finish it.",
    category: "SURVEY",
    invitation: "Thanks for your order. Two quick questions — it takes under a minute.",
    buttonText: "Give feedback",
    screens: [
      {
        screenId: "FEEDBACK",
        title: "How did we do?",
        buttonLabel: "Submit",
        fields: [
          { kind: "TextHeading", text: "How did we do?" },
          {
            kind: "RadioButtonsGroup",
            name: "rating",
            label: "Your rating",
            required: true,
            options: ["Excellent", "Good", "Okay", "Poor"],
          },
          {
            kind: "RadioButtonsGroup",
            name: "would_recommend",
            label: "Would you recommend us",
            required: true,
            options: ["Yes, definitely", "Maybe", "No"],
          },
          {
            kind: "TextArea",
            name: "comments",
            label: "Anything to add",
            helperText: "Tell us what we could do better.",
          },
        ],
      },
    ],
  },
  {
    slug: "support",
    name: "Support request",
    description: "Order number, problem and urgency — a ticket your team can act on.",
    category: "CUSTOMER_SUPPORT",
    invitation: "Sorry about that. Fill this in and someone from support will pick it up.",
    buttonText: "Raise a request",
    screens: [
      {
        screenId: "SUPPORT",
        title: "Report a problem",
        buttonLabel: "Send request",
        fields: [
          { kind: "TextHeading", text: "What has gone wrong?" },
          { kind: "TextInput", name: "order_number", label: "Order number" },
          {
            kind: "Dropdown",
            name: "issue_type",
            label: "Type of problem",
            required: true,
            options: [
              "Order not delivered",
              "Wrong or damaged item",
              "Payment or refund",
              "Something else",
            ],
          },
          {
            kind: "RadioButtonsGroup",
            name: "urgency",
            label: "How urgent",
            required: true,
            options: ["Needs sorting today", "Within a few days", "No rush"],
          },
          {
            kind: "TextArea",
            name: "details",
            label: "What happened",
            required: true,
          },
        ],
      },
    ],
  },
  {
    slug: "order",
    name: "Place an order",
    description: "What they want, how many, and where it goes.",
    category: "OTHER",
    invitation: "Happy to take that order. Tap below and tell us what you need.",
    buttonText: "Order now",
    screens: [
      {
        screenId: "ORDER",
        title: "What would you like?",
        buttonLabel: "Continue",
        fields: [
          { kind: "TextHeading", text: "Your order" },
          {
            kind: "TextArea",
            name: "items",
            label: "What you want",
            required: true,
            helperText: "Item names and sizes, one per line.",
          },
          {
            kind: "TextInput",
            name: "quantity",
            label: "How many",
            inputType: "number",
            required: true,
          },
        ],
      },
      {
        screenId: "DELIVERY",
        title: "Where should it go?",
        buttonLabel: "Place order",
        fields: [
          { kind: "TextSubheading", text: "Delivery details" },
          { kind: "TextInput", name: "full_name", label: "Name", required: true },
          {
            kind: "TextInput",
            name: "phone",
            label: "Phone number",
            inputType: "phone",
            required: true,
          },
          {
            kind: "TextArea",
            name: "address",
            label: "Full address",
            required: true,
            helperText: "Include the landmark and PIN code.",
          },
          {
            kind: "RadioButtonsGroup",
            name: "payment_method",
            label: "How you will pay",
            required: true,
            options: ["UPI", "Cash on delivery", "Bank transfer", "Card"],
          },
        ],
      },
    ],
  },
  {
    slug: "contact",
    name: "Contact us",
    description: "The short one. A name, a way to reach them, and a message.",
    category: "CONTACT_US",
    invitation: "Leave your details here and we will come back to you.",
    buttonText: "Get in touch",
    screens: [
      {
        screenId: "CONTACT",
        title: "Get in touch",
        buttonLabel: "Send",
        fields: [
          { kind: "TextHeading", text: "Leave us a message" },
          { kind: "TextInput", name: "full_name", label: "Your name", required: true },
          { kind: "TextInput", name: "email", label: "Email", inputType: "email" },
          { kind: "TextArea", name: "message", label: "Your message", required: true },
        ],
      },
    ],
  },
  {
    slug: "registration",
    name: "Event registration",
    description: "Sign people up for a class, webinar or demo.",
    category: "SIGN_UP",
    invitation: "Save your seat — it only takes a moment.",
    buttonText: "Register",
    screens: [
      {
        screenId: "REGISTER",
        title: "Save your seat",
        buttonLabel: "Register",
        fields: [
          { kind: "TextHeading", text: "Save your seat" },
          {
            kind: "TextBody",
            text: "We will send the joining details on WhatsApp once you are registered.",
          },
          { kind: "TextInput", name: "full_name", label: "Full name", required: true },
          {
            kind: "TextInput",
            name: "email",
            label: "Email",
            inputType: "email",
            required: true,
            helperText: "Where the joining link is sent.",
          },
          { kind: "TextInput", name: "city", label: "City" },
          {
            kind: "CheckboxGroup",
            name: "interests",
            label: "What interests you",
            options: ["Getting started", "Advanced tips", "Pricing and plans", "Case studies"],
          },
          { kind: "OptIn", name: "reminders_optin", label: "Remind me before it starts" },
        ],
      },
    ],
  },
];

/** One template by slug, or undefined for a name nothing matches. */
export function findTemplate(slug: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((template) => template.slug === slug);
}

let counter = 0;
/** Editor-local ids, matching the shape flow-json's own helpers produce. */
function localKey(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A template as screens the builder can open and Meta will accept.
 *
 * Every string is cut to its limit here rather than trusted, so a template
 * edited later can shorten a label by being wrong rather than by being
 * rejected on upload.
 */
export function templateScreens(template: FormTemplate): FormScreen[] {
  const used = new Set<string>();

  return template.screens.map((screen, index) => ({
    key: localKey("s"),
    screenId: normaliseScreenId(screen.screenId || `SCREEN_${index + 1}`),
    title: screen.title.slice(0, LIMITS.screenTitle),
    buttonLabel: screen.buttonLabel.slice(0, LIMITS.footerLabel),
    fields: screen.fields.map((field) => buildField(field, used)),
  }));
}

function buildField(field: TemplateField, used: Set<string>): FormField {
  // Answer keys are unique across the whole form, not just one screen —
  // Meta routes every answer into one payload.
  const base = normaliseFieldName(field.name ?? field.label ?? field.kind);
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    name = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(name);

  return {
    key: localKey("f"),
    kind: field.kind,
    text: (field.text ?? "").slice(0, textLimit(field.kind)),
    name,
    label: (field.label ?? "").slice(0, labelLimit(field.kind)),
    inputType: field.inputType ?? "text",
    required: field.required ?? false,
    helperText: (field.helperText ?? "").slice(0, LIMITS.helperText),
    options: isChoosing(field.kind)
      ? (field.options ?? []).slice(0, LIMITS.options).map((title, index) => ({
          id: `${index}`,
          title: title.slice(0, LIMITS.optionTitle),
        }))
      : [],
  };
}
