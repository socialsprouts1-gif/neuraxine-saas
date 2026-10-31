// The questions every business gets asked, ready to add.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// An FAQ bot with nothing in it answers nothing, and the blank form does
// not say what a good entry looks like — particularly the keywords,
// which are the whole mechanism and the one field people leave empty.
// Offering half a dozen real ones turns a blank screen into something
// that works in a click, and each is a worked example of the shape.

export interface FaqStarter {
  question: string;
  answer: string;
  keywords: string[];
  category: string;
}

export const FAQ_STARTERS: readonly FaqStarter[] = [
  {
    question: "What are your opening hours?",
    answer: "We are open Monday to Saturday, 10am to 8pm. Closed on Sundays.",
    keywords: ["hours", "open", "timing", "timings", "closed", "when open"],
    category: "General",
  },
  {
    question: "How long does delivery take?",
    answer:
      "Orders are dispatched within 24 hours and usually arrive in 3–5 working days. We will send you a tracking link as soon as it ships.",
    keywords: ["delivery", "shipping", "how long", "dispatch", "track", "courier"],
    category: "Shipping",
  },
  {
    question: "Where are you located?",
    answer: "Reply with your area and we will share the nearest branch address and directions.",
    keywords: ["address", "location", "where", "shop", "store", "branch"],
    category: "General",
  },
  {
    question: "What is your return policy?",
    answer:
      "Unused items can be returned within 7 days of delivery. Reply with your order number and we will arrange a pickup.",
    keywords: ["return", "refund", "exchange", "replace", "cancel order"],
    category: "Orders",
  },
  {
    question: "What payment methods do you accept?",
    answer: "UPI, all major cards, net banking and cash on delivery.",
    keywords: ["payment", "pay", "upi", "card", "cod", "cash on delivery"],
    category: "Payments",
  },
  {
    question: "Do you offer bulk or wholesale pricing?",
    answer:
      "Yes. Tell us the item and the quantity you need and we will send a quote the same day.",
    keywords: ["bulk", "wholesale", "quantity", "discount", "quote", "b2b"],
    category: "Sales",
  },
];

/**
 * The starters not already covered.
 *
 * Matched on the question rather than on keywords: two entries sharing a
 * keyword is normal and useful, two asking the same question is a
 * duplicate that will race for the same reply.
 */
export function availableStarters(
  existingQuestions: readonly string[]
): FaqStarter[] {
  const taken = new Set(existingQuestions.map((q) => q.trim().toLowerCase()));
  return FAQ_STARTERS.filter((starter) => !taken.has(starter.question.toLowerCase()));
}
