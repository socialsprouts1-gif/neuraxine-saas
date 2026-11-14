// Four automations people actually build.
//
// A blank form is the slowest way to learn what a tool does. These are
// the shapes that come up again and again, written out so the first one
// is a click and an edit rather than ten decisions in a row.
//
// Pure data, kept out of the component so the copy can be read and
// corrected without opening a React file.
//
// None of them pre-fill a button. A button needs a link only the person
// has, so filling in its label for them means their first click on
// "Next" is an error they did not make.

export interface Starter {
  key: string;
  /** The emoji stands in for an icon; it survives copy-paste and themes. */
  glyph: string;
  title: string;
  /** One line, in the words somebody would use to describe the job. */
  blurb: string;
  tint: "pink" | "purple" | "amber" | "blue";
  values: {
    triggerType: "comment" | "dm";
    name: string;
    keywords: string;
    dmMessage: string;
    publicReply: string;
    followGate: boolean;
    askEmail: boolean;
  };
}

export const STARTERS: Starter[] = [
  {
    key: "price",
    glyph: "💰",
    title: "Send your prices",
    blurb: "Somebody comments “price” and gets your price list.",
    tint: "amber",
    values: {
      triggerType: "comment",
      name: "Price enquiries",
      keywords: "price, cost, how much, rate",
      dmMessage: "Hey! Thanks for asking 💛 Here's everything, with the current prices 👇",
      publicReply: "",
      followGate: false,
      askEmail: false,
    },
  },
  {
    key: "link",
    glyph: "🔗",
    title: "Send a link",
    blurb: "A word on a post sends the link, instead of “link in bio”.",
    tint: "blue",
    values: {
      triggerType: "comment",
      name: "Link on request",
      keywords: "link, send, want",
      dmMessage: "Here you go! 🙌 Tap below and it's all yours.",
      publicReply: "Sent you a DM 💬",
      followGate: false,
      askEmail: false,
    },
  },
  {
    key: "freebie",
    glyph: "🎁",
    title: "Give something away",
    blurb: "They follow first, then get the free thing.",
    tint: "purple",
    values: {
      triggerType: "comment",
      name: "Free guide",
      keywords: "guide, free, send me",
      dmMessage: "Here's your free guide 🎁 Enjoy — and tell me what you think!",
      publicReply: "",
      followGate: true,
      askEmail: true,
    },
  },
  {
    key: "welcome",
    glyph: "👋",
    title: "Answer new messages",
    blurb: "Anybody who messages you gets a reply straight away.",
    tint: "pink",
    values: {
      triggerType: "dm",
      name: "Welcome message",
      keywords: "",
      dmMessage:
        "Hi! Thanks for reaching out 👋 Someone will be with you shortly — meanwhile, here's where most people start:",
      publicReply: "",
      followGate: false,
      askEmail: false,
    },
  },
];

export function starter(key: string): Starter | null {
  return STARTERS.find((item) => item.key === key) ?? null;
}
