import type { MatchOperator } from "@/lib/events";

// Ready-made rules, by trade.
//
// The same reasoning as the journey starters: an empty rules screen asks
// somebody to invent an event name, a condition and a message before
// they can see anything work at all — and the event name has to match
// one their own software sends, which they have not written yet either.
//
// So each of these names the events as well. A restaurant's panel can be
// built to send order.placed and dining.finished because this says those
// are the names, rather than every integration inventing its own.

export interface StarterRule {
  name: string;
  event: string;
  /** Said in words, for the screen. */
  when: string;
  /** What the message should say, for somebody writing the template. */
  says: string;
  action: "send_template" | "start_sequence" | "add_tag";
  /** The blanks this message would want, as tokens. */
  variables?: string[];
  match?: { field: string; operator: MatchOperator; value: string };
  tag?: string;
}

export interface EventStarter {
  key: string;
  industry: string;
  description: string;
  rules: StarterRule[];
}

export const EVENT_STARTERS: EventStarter[] = [
  {
    key: "restaurant",
    industry: "Restaurant or cafe",
    description:
      "The whole guest journey, driven by your till or booking panel: booked, seated, billed, reviewed, and brought back.",
    rules: [
      {
        name: "Table booked — confirm it",
        event: "booking.created",
        when: "Somebody books a table, however they booked it.",
        says: "Confirm the table, the time and how many people, and tell them how to change it.",
        action: "send_template",
        variables: ["{{data.guests}}", "{{data.time}}"],
      },
      {
        name: "Order placed — the kitchen has it",
        event: "order.placed",
        when: "An order goes in at the table or online.",
        says: "Tell them the order is in and roughly how long it will be.",
        action: "send_template",
        variables: ["{{data.order_id}}"],
      },
      {
        name: "Bill paid — send the receipt",
        event: "bill.paid",
        when: "The bill is settled, by card, cash or UPI.",
        says: "Thank them, give the total, and say the receipt is below.",
        action: "send_template",
        variables: ["{{data.total}}"],
      },
      {
        name: "Finished dinner — the follow-up",
        event: "dining.finished",
        when: "The table is closed for the night.",
        says: "Starts the sequence: thank you now, review request tomorrow, offer later.",
        action: "start_sequence",
      },
      {
        name: "Big spender — mark them",
        event: "bill.paid",
        when: "The bill is over ₹2,000.",
        says: "Tags them so your weekend offers can go to the right people.",
        action: "add_tag",
        tag: "regular",
        match: { field: "data.total", operator: "gt", value: "2000" },
      },
      {
        name: "Nobody turned up — win the table back",
        event: "booking.no_show",
        when: "A booking is marked as a no-show.",
        says: "A gentle offer of another evening, rather than a lost table and silence.",
        action: "start_sequence",
      },
    ],
  },
  {
    key: "retail",
    industry: "Shop or online store",
    description: "Order to delivery, and the nudge that brings them back.",
    rules: [
      {
        name: "Order placed",
        event: "order.placed",
        when: "An order is placed and paid for.",
        says: "Confirm what they bought and what happens next.",
        action: "send_template",
        variables: ["{{data.order_id}}", "{{data.total}}"],
      },
      {
        name: "Shipped",
        event: "order.shipped",
        when: "The parcel is handed to the courier.",
        says: "The tracking number and roughly when it lands.",
        action: "send_template",
        variables: ["{{data.tracking}}"],
      },
      {
        name: "Delivered — ask how it was",
        event: "order.delivered",
        when: "The courier marks the parcel delivered.",
        says: "Starts the sequence: did it arrive well, then a review request.",
        action: "start_sequence",
      },
      {
        name: "Basket left behind",
        event: "cart.abandoned",
        when: "A basket is filled and left without paying.",
        says: "One reminder with what is in it. One, not five.",
        action: "send_template",
      },
    ],
  },
  {
    key: "clinic",
    industry: "Clinic or salon",
    description: "Booked, seen, followed up, and brought back for the next one.",
    rules: [
      {
        name: "Appointment booked",
        event: "appointment.booked",
        when: "A booking is made in your own system.",
        says: "Confirm the time and what to bring.",
        action: "send_template",
        variables: ["{{data.time}}"],
      },
      {
        name: "Seen — start the aftercare",
        event: "appointment.completed",
        when: "The visit is marked finished in your system.",
        says: "Starts the sequence: aftercare, check-in, review, recall.",
        action: "start_sequence",
      },
      {
        name: "Payment taken",
        event: "payment.received",
        when: "A payment is taken, at the desk or online.",
        says: "A receipt with the amount, so they have it in writing.",
        action: "send_template",
        variables: ["{{data.amount}}"],
      },
    ],
  },
  {
    key: "gym",
    industry: "Gym or studio",
    description: "Signed up, turning up, and the month they stop.",
    rules: [
      {
        name: "Member joined",
        event: "member.joined",
        when: "Somebody takes out a membership.",
        says: "Welcome them and say what to do on day one.",
        action: "send_template",
        variables: ["{{data.plan}}"],
      },
      {
        name: "Checked in",
        event: "member.checked_in",
        when: "They scan in at the door or the app.",
        says: "Tags them as active, so the lapsed-member list stays honest.",
        action: "add_tag",
        tag: "active",
      },
      {
        name: "Membership about to end",
        event: "membership.expiring",
        when: "A membership is near its last day.",
        says: "Starts the renewal sequence.",
        action: "start_sequence",
      },
    ],
  },
  {
    key: "any",
    industry: "Any business",
    description:
      "The four events almost every system can send. Start here if your own panel is not built yet.",
    rules: [
      {
        name: "Somebody signed up",
        event: "user.signed_up",
        when: "A new account or a new customer is created.",
        says: "Welcome them.",
        action: "send_template",
      },
      {
        name: "A form was filled in",
        event: "form.submitted",
        when: "Somebody submits a form on your website.",
        says: "Confirm you have it and say when you will reply.",
        action: "send_template",
      },
      {
        name: "Somebody paid",
        event: "payment.received",
        when: "A payment lands, however you took it.",
        says: "A receipt with the amount, so they have it in writing.",
        action: "send_template",
        variables: ["{{data.amount}}"],
      },
      {
        name: "A job was finished",
        event: "job.completed",
        when: "Whatever you do for people is done.",
        says: "Starts the follow-up sequence: thank you, check-in, review.",
        action: "start_sequence",
      },
    ],
  },
];

export function starterFor(key: string): EventStarter | null {
  return EVENT_STARTERS.find((starter) => starter.key === key) ?? null;
}

/** Every event name the starters use, for the builder's suggestions. */
export function knownEventNames(): string[] {
  const seen = new Set<string>();
  for (const starter of EVENT_STARTERS) {
    for (const rule of starter.rules) seen.add(rule.event);
  }
  return [...seen].sort();
}
