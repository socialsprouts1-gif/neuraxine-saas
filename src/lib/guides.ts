// The manual, written as data.
//
// Pure by design: no fetch, no env, no server-only, so the whole library
// can be checked by a test — that every guide has a slug nothing else
// uses, that nothing links to a guide that does not exist, and that no
// section is left empty. A handbook with a dead link in it is worse than
// no handbook, because the reader concludes the product is unfinished
// rather than that one page is.
//
// Written for somebody who has never built an automation and does not
// want to become a programmer. Short sentences. The thing that goes
// wrong, named. No jargon that is not explained in the same breath.

export type Block =
  /** Plain prose. One idea per paragraph. */
  | { kind: "text"; body: string }
  /** The big one: boxes and arrows. `lanes` render left to right. */
  | {
      kind: "flow";
      caption?: string;
      lanes: Array<{ label: string; detail?: string; tone?: "neutral" | "good" | "bad" | "accent" }>;
    }
  /** Numbered things to do, in order. */
  | { kind: "steps"; title?: string; steps: Array<{ title: string; body: string }> }
  /** Two columns, for "this not that". */
  | {
      kind: "compare";
      goodTitle: string;
      badTitle: string;
      good: string[];
      bad: string[];
    }
  /** A small table. First row is the header. */
  | { kind: "table"; head: string[]; rows: string[][] }
  /** Short, high-value facts. The cheat codes. */
  | { kind: "tips"; title?: string; tips: Array<{ title: string; body: string }> }
  /** Something that will bite them. */
  | { kind: "warn"; body: string };

export interface Guide {
  slug: string;
  title: string;
  /** One line on the index card. */
  summary: string;
  /** Which lucide icon the page picks. Kept as a name, not a component,
   *  so this module stays plain data and testable. */
  icon: "map" | "clock" | "split" | "rocket" | "lightbulb" | "inbox" | "bot";
  /** Roughly how long it takes to read. Shown so nobody is ambushed. */
  minutes: number;
  blocks: Block[];
}

export const GUIDES: Guide[] = [
  // ---------------------------------------------------------------- the map
  {
    slug: "how-it-works",
    title: "How Neura Chat works",
    summary: "The whole thing on one page — what happens when a customer messages you, and where each part of the app sits.",
    icon: "map",
    minutes: 4,
    blocks: [
      {
        kind: "text",
        body: "Everything in this app is either about a message coming in, or a message going out. Once you can see which of the two you are looking at, the rest of the screens stop being a list of features and start being a sequence.",
      },
      {
        kind: "flow",
        caption: "A customer messages you. This is what happens, in order, in about two seconds.",
        lanes: [
          { label: "Customer writes", detail: "On WhatsApp, to your business number.", tone: "neutral" },
          { label: "It arrives here", detail: "Lands in your Inbox and opens a 24-hour window.", tone: "accent" },
          { label: "Automations try", detail: "Booking, then Chatbot, then FAQ, then AI Assistant.", tone: "accent" },
          { label: "Reply goes out", detail: "Or nothing matches and it waits for a human.", tone: "good" },
        ],
      },
      {
        kind: "text",
        body: "That order matters. The first thing that matches answers, and the rest do not run. So if your chatbot and your FAQ both know about delivery, the chatbot wins — because it is checked first.",
      },
      {
        kind: "flow",
        caption: "You message a customer. This is the other direction, and it has one hard rule in it.",
        lanes: [
          { label: "Did they write first?", detail: "In the last 24 hours.", tone: "neutral" },
          { label: "Yes — say anything", detail: "Text, buttons, products, invoices, payment requests.", tone: "good" },
          { label: "No — template only", detail: "A message Meta approved in advance. Nothing else gets through.", tone: "bad" },
        ],
      },
      {
        kind: "table",
        head: ["What you want to do", "Where it lives"],
        rows: [
          ["Read and reply by hand", "Inbox"],
          ["Answer the same question forever", "FAQ Bot"],
          ["Ask questions and branch on the answer", "Chatbot"],
          ["Let AI answer in your own words", "AI Assistant"],
          ["Message people who did not write first", "Manage → Templates, then Campaigns"],
          ["Sell things", "Commerce"],
          ["Take money", "WA Pay, or an invoice"],
          ["Ship things", "Shipments"],
        ],
      },
      {
        kind: "warn",
        body: "Nothing you build answers anybody until it is switched on AND the number it belongs to is connected. A bot that is off looks identical to a bot that is broken — check the toggle first, every time.",
      },
    ],
  },

  // ------------------------------------------------------------ the 24h rule
  {
    slug: "the-24-hour-rule",
    title: "The 24-hour rule",
    summary: "The single rule behind most things that 'do not work'. Worth four minutes — it explains half the errors you will ever see.",
    icon: "clock",
    minutes: 4,
    blocks: [
      {
        kind: "text",
        body: "WhatsApp does not let a business start a conversation with whatever it likes. This is deliberate, it is not a setting, and no plan or payment changes it. Understanding it will save you more time than anything else in this app.",
      },
      {
        kind: "flow",
        caption: "The clock starts when the customer writes to you — and only then.",
        lanes: [
          { label: "Customer messages you", detail: "The window opens.", tone: "good" },
          { label: "Next 24 hours", detail: "You can send anything at all.", tone: "good" },
          { label: "After 24 hours", detail: "Only an approved template gets through.", tone: "bad" },
          { label: "They reply again", detail: "A fresh 24 hours starts.", tone: "good" },
        ],
      },
      {
        kind: "compare",
        goodTitle: "Inside the window, you can send",
        badTitle: "Outside it, all of this is refused",
        good: [
          "Plain text, images, documents",
          "Buttons and list menus",
          "Product cards and your catalogue",
          "Invoices and payment requests",
          "WhatsApp Forms",
          "Anything a chatbot or AI assistant says",
        ],
        bad: [
          "Plain text — even one word",
          "Buttons and lists",
          "Product cards",
          "Payment requests",
          "Anything your chatbot wanted to say",
          "Everything except an approved template",
        ],
      },
      {
        kind: "tips",
        title: "What this explains",
        tips: [
          {
            title: "“There is no WhatsApp conversation with this contact yet”",
            body: "You are trying to message someone who has never written to you. Nothing is broken. They have to message you first, or you send an approved template.",
          },
          {
            title: "Your campaign needed a template and a plain message did not",
            body: "A campaign reaches people who have not written recently, so it can only be a template. A reply in the Inbox is usually inside the window, so it can be anything.",
          },
          {
            title: "The bot answered instantly at 2pm and refused at 4pm the next day",
            body: "The window closed in between. Same bot, same message, different clock.",
          },
        ],
      },
      {
        kind: "text",
        body: "The practical consequence: make it easy for customers to message you first. A WhatsApp link on your website, a QR code in your shop, a click-to-WhatsApp ad. Every one of those opens a window you can then use.",
      },
    ],
  },

  // ------------------------------------------------- which automation answers
  {
    slug: "faq-chatbot-or-ai",
    title: "FAQ Bot, Chatbot or AI Assistant?",
    summary: "You have three ways to answer automatically and they are good at different things. Pick wrong and it feels broken.",
    icon: "split",
    minutes: 5,
    blocks: [
      {
        kind: "text",
        body: "All three reply on their own. The difference is how much they can handle, and how much control you keep over what gets said.",
      },
      {
        kind: "table",
        head: ["", "FAQ Bot", "Chatbot", "AI Assistant"],
        rows: [
          ["Answers are", "Written by you, word for word", "Written by you, word for word", "Written by the AI, in your style"],
          ["Can ask questions back", "No", "Yes", "Yes"],
          ["Can branch on the answer", "No", "Yes", "Yes"],
          ["Can say something you did not plan", "Never", "Never", "Yes — that is the point, and the risk"],
          ["Costs money per message", "No", "No", "Yes, to the AI provider"],
          ["Best for", "“What are your hours?”", "Booking, ordering, qualifying", "Anything you did not think of"],
        ],
      },
      {
        kind: "flow",
        caption: "The order they are tried in. The first one that matches answers, and the rest never run.",
        lanes: [
          { label: "1. Appointments", detail: "If the customer is mid-booking.", tone: "neutral" },
          { label: "2. Chatbot", detail: "If a trigger word matches.", tone: "neutral" },
          { label: "3. FAQ Bot", detail: "If a keyword matches.", tone: "neutral" },
          { label: "4. AI Assistant", detail: "If nothing above did.", tone: "accent" },
        ],
      },
      {
        kind: "warn",
        body: "This order is why a new FAQ sometimes seems ignored: a chatbot earlier in the queue already matched the same word. If an answer is not appearing, check what else matches that word before assuming the FAQ is broken.",
      },
      {
        kind: "tips",
        title: "How most businesses end up using them",
        tips: [
          {
            title: "FAQ Bot for the ten questions you are sick of",
            body: "Hours, address, delivery time, returns, payment methods, sizes. Ten minutes of setup, answers forever, costs nothing.",
          },
          {
            title: "Chatbot for anything with steps",
            body: "Taking a booking, collecting an order, qualifying a lead. Anywhere you need to ask something and do different things depending on the answer.",
          },
          {
            title: "AI Assistant as the catch-all underneath",
            body: "It picks up everything the other two did not recognise, so a customer who phrases something oddly still gets an answer instead of silence.",
          },
        ],
      },
    ],
  },

  // ------------------------------------------------------------- first bot
  {
    slug: "your-first-bot",
    title: "Get your first bot live in 15 minutes",
    summary: "The shortest path from an empty account to a bot that actually answers a real customer.",
    icon: "rocket",
    minutes: 5,
    blocks: [
      {
        kind: "steps",
        steps: [
          {
            title: "Connect a number",
            body: "Integrations → WhatsApp. Nothing in the app can send anything until this is done, and every other error you hit before it is a distraction.",
          },
          {
            title: "Add the six starter questions",
            body: "FAQ Bot → “Add 6 starter questions”. They arrive with keywords already filled in. Edit the answers to match your business — the keywords are the part that took the thought, so keep them.",
          },
          {
            title: "Message your own number from your phone",
            body: "Write one of the keywords, like “delivery”. You should get the answer back within seconds. If nothing happens, the entry is paused or its keywords do not include the word you typed.",
          },
          {
            title: "Build one chatbot for the thing you do most",
            body: "Chatbot → Build with AI. Describe it in plain language: what sets it off, what it asks, and where each answer leads. You get a real flow you can edit rather than a blank canvas.",
          },
          {
            title: "Switch it on and test it as a customer",
            body: "Use a different phone. Testing from the same number you connected does not behave like a real customer.",
          },
          {
            title: "Only then worry about templates and campaigns",
            body: "Those reach people who have not written to you, and they need Meta's approval. Everything above works today with no approval at all.",
          },
        ],
      },
      {
        kind: "tips",
        title: "Cheat codes",
        tips: [
          {
            title: "Write keywords the way customers type, not the way you write",
            body: "“kitna time”, “how long”, “delivery”, “kab aayega”. Not “delivery timeframe enquiry”. The keywords are the whole mechanism — the question text is only a label for you.",
          },
          {
            title: "One idea per message",
            body: "WhatsApp is a chat, not an email. Two or three sentences, then stop. A wall of text gets skimmed and the customer asks the same thing again anyway.",
          },
          {
            title: "Always give a way out",
            body: "Put a “talk to a person” button on any bot longer than two steps. The fastest way to make somebody hate a bot is to trap them in it.",
          },
          {
            title: "Never leave a button wired to nothing",
            body: "An unconnected button ends the conversation silently. The customer taps it and nothing happens ever again. It is the single most common way these flows fail.",
          },
          {
            title: "Name your bots",
            body: "Four bots called “Untitled bot” is four bots you will be afraid to delete in a month.",
          },
          {
            title: "Check the Automations log when something does not fire",
            body: "It records every inbound message and what answered it, or why nothing did. It turns “it is broken” into a specific sentence.",
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------- business ideas
  {
    slug: "what-to-build",
    title: "What to actually build",
    summary: "Things other businesses run on WhatsApp that earn their keep — by the kind of business you are.",
    icon: "lightbulb",
    minutes: 5,
    blocks: [
      {
        kind: "text",
        body: "The mistake is building a bot that tries to do everything. The ones that work do one annoying thing perfectly and hand the rest to a person.",
      },
      {
        kind: "tips",
        title: "If you sell products",
        tips: [
          {
            title: "Catalogue on request",
            body: "Trigger on “price”, “catalogue”, “rate”. Send your product list straight into the chat. They browse, build a cart and send it back as an order without ever leaving WhatsApp.",
          },
          {
            title: "Where is my order",
            body: "Trigger on “tracking”, “shipped”, “where is my order”. Ask for the order number, answer with the courier status. This one question is most of a small shop's support load.",
          },
          {
            title: "Abandoned enquiry follow-up",
            body: "Someone asks a price and goes quiet. A delay node and a single follow-up a day later recovers a surprising number of them — while the window is still open.",
          },
        ],
      },
      {
        kind: "tips",
        title: "If you sell time — clinic, salon, studio, consultant",
        tips: [
          {
            title: "Booking without the phone call",
            body: "Ask for the service, the day and the name, then hand off to a person to confirm. Even half-automated booking removes most of the back and forth.",
          },
          {
            title: "Reminders the day before",
            body: "No-shows are the whole problem in this business. One reminder message is the highest-value automation you will ever set up.",
          },
          {
            title: "Reschedule instead of cancel",
            body: "When someone cancels, offer two other times in the same message. A cancellation you turn into a reschedule is money you did not lose.",
          },
        ],
      },
      {
        kind: "tips",
        title: "If you sell to other businesses",
        tips: [
          {
            title: "Qualify before a human ever reads it",
            body: "Three questions — what they need, roughly what budget, and where — then tag them and hand off. Your salespeople stop spending mornings on enquiries that were never going to buy.",
          },
          {
            title: "Quote and invoice in the chat",
            body: "Agree a price in the conversation, raise the invoice from the same screen, send the payment link into the same thread. No email, no PDF, no chasing.",
          },
        ],
      },
      {
        kind: "warn",
        body: "Whatever you build: send it to yourself first, from a different phone, and read it as a customer would. Almost every bad automation would have been obvious to its own author after one real test.",
      },
    ],
  },
];

/** One guide by slug, or null. */
export function guideBySlug(slug: string): Guide | null {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}

/** Every slug, for the static params of the guide route. */
export function guideSlugs(): string[] {
  return GUIDES.map((guide) => guide.slug);
}

/** Total reading time, for the index. */
export function totalMinutes(): number {
  return GUIDES.reduce((sum, guide) => sum + guide.minutes, 0);
}
