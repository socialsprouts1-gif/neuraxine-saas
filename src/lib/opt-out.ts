// Reading "stop" from an inbound message.
//
// WhatsApp requires a business to honour an opt-out, and Meta does not
// enforce it for you: a customer who cannot make the messages stop blocks
// the number instead, and blocks are what the quality rating is made of.
// So the cost of missing a STOP is not a complaint, it is the account's
// messaging limit.
//
// The opposite mistake is worse in a different way. This app's inbox also
// carries orders, bookings and invoices, so a false positive silently
// removes a paying customer from every future message with nothing on
// screen explaining it. That shapes the whole design below: the keyword
// has to be the entire message, and ambiguous words are left out.

export type OptIntent = "stop" | "start" | null;

/**
 * Words that mean "stop sending me things".
 *
 * Deliberately not the SMS carrier list. "cancel", "end" and "quit" are on
 * that list and all three are ordinary things to say to a business that
 * takes orders and books appointments — "cancel" alone, in a shop's
 * inbox, means the order far more often than the marketing.
 */
const STOP = [
  "stop",
  "stop all",
  "stopall",
  "unsubscribe",
  "unsub",
  "opt out",
  "optout",
  "remove me",
  "no more messages",
  "dont message me",
  "do not message me",
  // Hindi and Hinglish, which is how most of this will actually arrive.
  "band karo",
  "band kar do",
  "bandh karo",
  "rok do",
  "mat bhejo",
  "message mat bhejo",
  "बंद करो",
  "बंद कर दो",
  "रोको",
  "मुझे हटाओ",
  "हटाओ",
];

/**
 * Words that mean "you can message me again".
 *
 * "yes" is not among them, and never should be: it is the most common
 * reply in the inbox and means whatever the last question was.
 */
const START = [
  "start",
  "unstop",
  "resume",
  "subscribe",
  "opt in",
  "optin",
  "start messages",
  "chalu karo",
  "shuru karo",
  "शुरू करो",
  "चालू करो",
];

/**
 * Strips a message down to the words in it.
 *
 * Punctuation and emoji go, because "STOP." and "stop 🙏" are the same
 * intention as "stop" and a customer who has to guess the punctuation has
 * not been given a way out at all.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What an inbound message is asking for, if anything.
 *
 * The keyword must be the whole message. A sentence that merely contains
 * the word is left alone: "please don't stop the delivery" and "stop by
 * on Tuesday" are not opt-outs, and treating them as one takes a customer
 * off the list for saying something ordinary. Someone who means it sends
 * the word on its own — that is the convention every messaging channel
 * has taught them.
 */
export function readOptIntent(text: string | null | undefined): OptIntent {
  const cleaned = normalise(text ?? "");
  if (!cleaned) return null;

  // Longer phrases are checked by exact match too, so "band kar do" does
  // not need a separate rule from "stop".
  if (STOP.some((word) => normalise(word) === cleaned)) return "stop";
  if (START.some((word) => normalise(word) === cleaned)) return "start";
  return null;
}

/** What to send back, so the customer knows it worked. */
export function optOutConfirmation(intent: Exclude<OptIntent, null>, business: string): string {
  const name = business.trim() || "this business";
  return intent === "stop"
    ? `You've been unsubscribed and won't get any more updates from ${name}. Reply START if you change your mind.`
    : `You're subscribed again and will get updates from ${name}. Reply STOP at any time.`;
}
