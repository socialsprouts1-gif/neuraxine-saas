import type { AppointmentEvent } from "@/lib/drip";

// Ready-made follow-up journeys.
//
// The engine underneath is industry-agnostic, and that is the problem: a
// blank sequence builder asks somebody to invent four messages, four gaps
// and four WhatsApp templates before they can see the thing work once.
// Most people never get past the blank screen, and the ones who do write
// their first sequence badly because nobody writes good follow-up from
// cold.
//
// So each of these is a whole journey — the words, the gaps and the order
// — for one trade. Picking one creates the templates, submits them to
// Meta for approval, and leaves a draft sequence wired to them. Nothing
// sends until it is switched on.
//
// Two things every message in here obeys:
//
//  * No per-person variables. Variable values on a drip step are fixed
//    for everybody in the sequence, so "Hi {{1}}" would greet two hundred
//    people by the same name. A variable appears only where the value is
//    genuinely the same for everybody — a review link, a clinic's number.
//
//  * Nothing is promised that the business has not said. No discounts,
//    no claims about results, no "your report is ready". A follow-up that
//    says something untrue is worse than no follow-up.

export interface StarterStep {
  /** Appended to the sequence key to name the WhatsApp template. */
  slug: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  footer?: string;
  /** Example values for {{1}}, {{2}} — Meta reviews the template with them filled in. */
  samples?: string[];
  /** Suggested values for the same variables, which the operator then edits. */
  variables?: string[];
  /** The gap *after* this step. Ignored on the last one. */
  waitMinutes: number;
}

export interface JourneyStarter {
  key: string;
  /** The trade this is written for, as somebody would describe their own. */
  industry: string;
  /** What the sequence is called once it exists. */
  name: string;
  description: string;
  event: AppointmentEvent;
  steps: StarterStep[];
}

const HOUR = 60;
const DAY = 24 * HOUR;

/** The journeys, grouped by trade in the order most people look for them. */
export const JOURNEY_STARTERS: JourneyStarter[] = [
  // ---------------------------------------------------------------- health
  {
    key: "dental_after_treatment",
    industry: "Dental clinic",
    name: "After treatment — care, check-in, review, six-month recall",
    description:
      "Aftercare the same day, a check on day three, a review request once they are comfortable, and the cleaning reminder six months on.",
    event: "completed",
    steps: [
      {
        slug: "care",
        category: "UTILITY",
        body:
          "Thank you for coming in today.\n\nPlease take the medicines exactly as written on your prescription, and give very hot, very cold and hard food a miss for the next 24 hours.\n\nIf the pain gets worse instead of better, or anything feels wrong, reply to this message and we will call you back.",
        footer: "Reply here any time — a person reads these.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "How is it feeling now?\n\nBy day three most people are back to normal food. If something still hurts, feels sharp or does not sit right, tell us and we will fit you in this week.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "review",
        category: "MARKETING",
        body:
          "Glad you are feeling better.\n\nIf the visit went well, a short review helps other people in the area find us — it takes about a minute: {{1}}\n\nAnd if anything was not right, reply here instead and tell us. We would rather hear it.",
        samples: ["https://g.page/r/your-clinic/review"],
        variables: ["https://g.page/r/your-clinic/review"],
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 180 * DAY,
      },
      {
        slug: "recall",
        category: "MARKETING",
        body:
          "It has been about six months since we saw you.\n\nA cleaning and a quick look now is what keeps the small things small — most of what becomes painful later is painless today.\n\nReply BOOK and we will find you a slot.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "clinic_after_consultation",
    industry: "Clinic or doctor",
    name: "After a consultation — medicines, check-in, review",
    description:
      "The instructions again in writing, a check on day three while the course is still running, and a review request after.",
    event: "completed",
    steps: [
      {
        slug: "care",
        category: "UTILITY",
        body:
          "Thank you for coming in today.\n\nPlease finish the full course of medicines even if you feel better in two days — stopping early is the usual reason something comes back.\n\nIf you get any reaction, or you are not sure about a dose, reply here and we will guide you.",
        footer: "Reply here any time — a person reads these.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "Checking in — how are you feeling now?\n\nIf you are better, finish the course anyway. If there is no change at all by now, reply here and we will see you again sooner rather than later.",
        waitMinutes: 4 * DAY,
      },
      {
        slug: "review",
        category: "MARKETING",
        body:
          "We hope you are back to normal.\n\nIf we looked after you well, a short review helps other people find us: {{1}}\n\nIf anything was not right, reply here and tell us instead.",
        samples: ["https://g.page/r/your-clinic/review"],
        variables: ["https://g.page/r/your-clinic/review"],
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "physio_after_session",
    industry: "Physiotherapy",
    name: "After a session — home exercises, check-in, re-assessment",
    description:
      "The exercises in writing, a nudge on day two when people stop doing them, and a re-assessment two weeks on.",
    event: "completed",
    steps: [
      {
        slug: "exercises",
        category: "UTILITY",
        body:
          "Good session today.\n\nThe exercises we went through matter more than the session itself — twice a day, slowly, and stop if anything sharp comes on.\n\nIf you are not sure you are doing one right, reply here and we will send a short clip.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "nudge",
        category: "UTILITY",
        body:
          "Day two is where most people quietly stop.\n\nEven one round a day is far better than none. How is the movement feeling — easier, the same, or worse?",
        waitMinutes: 12 * DAY,
      },
      {
        slug: "reassess",
        category: "MARKETING",
        body:
          "It has been two weeks. This is a good point to measure the movement again and change the plan rather than keep doing the same thing.\n\nReply BOOK for a re-assessment slot.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },

  // ---------------------------------------------------------------- beauty
  {
    key: "salon_after_visit",
    industry: "Salon or spa",
    name: "After a visit — aftercare, check-in, review, rebook",
    description:
      "How to keep it looking right, a check on day two, a review request, and the rebook nudge four weeks on.",
    event: "completed",
    steps: [
      {
        slug: "care",
        category: "UTILITY",
        body:
          "Thank you for coming in today.\n\nTo keep it looking the way it did when you left: no washing for the next 48 hours, and a mild sulphate-free shampoo after that.\n\nAnything you are unsure about, just reply here.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "How is it settling in?\n\nIf anything is not sitting the way you wanted, tell us in the next few days and we will sort it out — that is much easier now than in three weeks.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "review",
        category: "MARKETING",
        body:
          "Hope you are still loving it.\n\nIf you are, a short review helps other people find us: {{1}}\n\nAnd if not, reply here instead and we will make it right.",
        samples: ["https://g.page/r/your-salon/review"],
        variables: ["https://g.page/r/your-salon/review"],
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 25 * DAY,
      },
      {
        slug: "rebook",
        category: "MARKETING",
        body:
          "You are around the four-week mark, which is usually when the shape starts to go.\n\nReply BOOK and we will hold a slot for you this week.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "pet_after_visit",
    industry: "Pet clinic or grooming",
    name: "After a visit — aftercare, check-in, next appointment",
    description: "Aftercare, a check on day three, and the next groom or vaccination two months on.",
    event: "completed",
    steps: [
      {
        slug: "care",
        category: "UTILITY",
        body:
          "Thank you for bringing them in today.\n\nKeep them calm and indoors for the rest of the day, normal food in the evening, and plenty of water.\n\nIf anything seems off — not eating, not settling, not themselves — reply here straight away.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "How are they doing now? Back to normal eating and playing, we hope.\n\nIf anything is still not right, tell us and we will see them again.",
        waitMinutes: 57 * DAY,
      },
      {
        slug: "next",
        category: "MARKETING",
        body:
          "It is about two months since the last visit — a good time for the next one.\n\nReply BOOK and we will find a slot that suits you.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },

  // --------------------------------------------------------------- fitness
  {
    key: "gym_after_trial",
    industry: "Gym or fitness studio",
    name: "After a trial session — how it felt, the plan, the offer",
    description:
      "The day-after message while the session is still fresh, a check on day three, and the membership offer on day seven.",
    event: "completed",
    steps: [
      {
        slug: "after",
        category: "UTILITY",
        body:
          "Good work today.\n\nYou will feel it tomorrow — that is normal and it passes faster if you move rather than sit. Water, protein, and sleep do most of the work.\n\nAny questions about the session, reply here.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "How did the last two days feel?\n\nIf you want, we can put together a simple weekly plan around whatever time you actually have. Reply here and tell us how many days a week are realistic.",
        waitMinutes: 5 * DAY,
      },
      {
        slug: "offer",
        category: "MARKETING",
        body:
          "A week on from your trial.\n\nThe people who get results are the ones who turned up three times a week for three months — nothing cleverer than that. If you want to start properly, reply JOIN and we will tell you about the plans.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "coaching_after_demo",
    industry: "Coaching or tuition",
    name: "After a demo class — notes, decision nudge, enrolment",
    description: "What was covered, a nudge on day two, and the enrolment ask on day five.",
    event: "completed",
    steps: [
      {
        slug: "notes",
        category: "UTILITY",
        body:
          "Thank you for joining the demo class today.\n\nWhatever was covered is worth going over once more this week — one read now saves an hour later.\n\nAny doubts from the class, reply here and the teacher will answer.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "nudge",
        category: "UTILITY",
        body:
          "Did the class feel like the right fit?\n\nIf there is something you want to know before deciding — the batch timings, how the tests work, how we handle a student who is behind — ask here and we will answer straight.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "enrol",
        category: "MARKETING",
        body:
          "The batch you sat in on is filling up.\n\nIf you would like the seat, reply JOIN and we will send you the details. If the timing does not work, tell us which days do and we will see what else is running.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },

  // ---------------------------------------------------------------- trades
  {
    key: "garage_after_service",
    industry: "Car service or garage",
    name: "After a service — what was done, check-in, next service",
    description:
      "The work and the warranty in writing, a check after a week of driving, and the next service six months on.",
    event: "completed",
    steps: [
      {
        slug: "summary",
        category: "UTILITY",
        body:
          "Your vehicle is serviced and back with you.\n\nKeep the invoice — the work carries a warranty, and the invoice is what it runs against. For the next 100 km, go easy on the brakes while the pads bed in.\n\nAnything that sounds or feels different, reply here before driving further.",
        waitMinutes: 7 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "A week of driving since the service — how is it running?\n\nIf there is any noise, pull or warning light that was not there before, tell us now. It is covered, and it is easier to fix early.",
        waitMinutes: 173 * DAY,
      },
      {
        slug: "next",
        category: "MARKETING",
        body:
          "It is about six months since your last service.\n\nOil, filters and a brake check now is the cheap version of what happens if it waits. Reply BOOK and we will find a day.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "property_after_visit",
    industry: "Real estate",
    name: "After a site visit — details, follow-up, other options",
    description:
      "The details in writing the same day, an honest follow-up on day two, and other options on day five.",
    event: "completed",
    steps: [
      {
        slug: "details",
        category: "UTILITY",
        body:
          "Thank you for taking the time to see the property today.\n\nIf you would like the floor plan, the papers or the price breakup in writing, reply here and we will send them across.\n\nAnd if you want to see it once more with family, just say when.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "followup",
        category: "UTILITY",
        body:
          "What did you think, honestly?\n\nIf it is not the one, that is useful to know — tell us what was wrong with it and we will stop sending you things like it.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "options",
        category: "MARKETING",
        body:
          "We have a couple of other options in the same budget and area that may suit you better.\n\nReply YES and we will send the details, or tell us what to change — budget, area, size — and we will look again.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "studio_after_shoot",
    industry: "Photography or events",
    name: "After a shoot — delivery, review, anniversary",
    description:
      "When the photos arrive, a review request once they have them, and a message a year on.",
    event: "completed",
    steps: [
      {
        slug: "delivery",
        category: "UTILITY",
        body:
          "Thank you for today — we got some lovely frames.\n\nEditing takes us about two weeks, and you will get the full set as a private link. If you need two or three photos sooner for sharing, reply here and we will send them early.",
        waitMinutes: 21 * DAY,
      },
      {
        slug: "review",
        category: "MARKETING",
        body:
          "We hope you loved the photos.\n\nIf you did, a short review genuinely helps us: {{1}}\n\nAnd if you would like prints or an album, reply here and we will send the options.",
        samples: ["https://g.page/r/your-studio/review"],
        variables: ["https://g.page/r/your-studio/review"],
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 330 * DAY,
      },
      {
        slug: "anniversary",
        category: "MARKETING",
        body:
          "It is almost a year since we shot for you — we still have your photos safe.\n\nIf there is something coming up this year, tell us early and we will keep the date free.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "consultant_after_meeting",
    industry: "Consultant, lawyer or accountant",
    name: "After a meeting — next steps, nudge, check-in",
    description: "The next steps in writing, a nudge on day three, and a check a month later.",
    event: "completed",
    steps: [
      {
        slug: "steps",
        category: "UTILITY",
        body:
          "Thank you for your time today.\n\nThe next step is with the documents we discussed — send them here whenever they are ready and we will take it from there.\n\nAnything that was not clear in the meeting, ask here rather than wait.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "nudge",
        category: "UTILITY",
        body:
          "Just a reminder about the documents.\n\nIf something is hard to get hold of, tell us which one and we will usually find a way around it.",
        waitMinutes: 27 * DAY,
      },
      {
        slug: "checkin",
        category: "MARKETING",
        body:
          "Checking in a month on — how is it going at your end?\n\nIf anything has changed, or you want to pick this up again, reply here and we will set up a call.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },

  // -------------------------------------------------------------- any trade
  {
    key: "any_after_appointment",
    industry: "Any business",
    name: "After any appointment — thank you, check-in, review",
    description:
      "The plainest version of the whole thing: a thank you, a check on day three, and a review request. Edit the words to suit what you do.",
    event: "completed",
    steps: [
      {
        slug: "thanks",
        category: "UTILITY",
        body:
          "Thank you for coming in today.\n\nIf anything comes up, or you have a question about what we did, reply to this message — it comes straight to us.",
        footer: "Reply here any time — a person reads these.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "checkin",
        category: "UTILITY",
        body:
          "Checking in a few days on — is everything as it should be?\n\nIf not, tell us now and we will put it right.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "review",
        category: "MARKETING",
        body:
          "If we looked after you well, a short review helps other people find us: {{1}}\n\nIf anything was not right, reply here instead and tell us.",
        samples: ["https://g.page/r/your-business/review"],
        variables: ["https://g.page/r/your-business/review"],
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "any_no_show",
    industry: "Any business",
    name: "Missed appointment — rebook",
    description:
      "For the slot nobody turned up to. Sent the moment it is marked missed, and once more two days later.",
    event: "no_show",
    steps: [
      {
        slug: "missed",
        category: "UTILITY",
        body:
          "We had you down for today and kept the slot free — no problem, these things happen.\n\nWould you like another time? Reply here with a day that suits you and we will fit you in.",
        waitMinutes: 2 * DAY,
      },
      {
        slug: "nudge",
        category: "UTILITY",
        body:
          "Still happy to find you another slot whenever you are ready.\n\nJust reply with a day and a rough time.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "any_cancelled",
    industry: "Any business",
    name: "Cancelled appointment — another time",
    description:
      "For a cancellation, while they still want the thing they booked. Sent on cancellation and once more three days later.",
    event: "cancelled",
    steps: [
      {
        slug: "cancelled",
        category: "UTILITY",
        body:
          "Your appointment is cancelled as requested.\n\nIf you would like another time, reply here with a day that works and we will set it up.",
        waitMinutes: 3 * DAY,
      },
      {
        slug: "nudge",
        category: "MARKETING",
        body:
          "Shall we find you another slot?\n\nReply with a day and a rough time and we will see what is free.",
        footer: "Reply STOP to stop these messages.",
        waitMinutes: 0,
      },
    ],
  },
  {
    key: "any_booked",
    industry: "Any business",
    name: "Just booked — what to expect",
    description:
      "Sent the moment a booking is made: how to find you, what to bring, and how to change it. The reminder before the appointment is separate and already running.",
    event: "booked",
    steps: [
      {
        slug: "expect",
        category: "UTILITY",
        body:
          "Your appointment is booked — thank you.\n\nPlease arrive five minutes early, and bring any earlier reports or papers you have with you.\n\nIf you need to change the time, reply here and we will move it. We would much rather move it than lose it.",
        footer: "Reply here any time — a person reads these.",
        waitMinutes: 0,
      },
    ],
  },
];

/** The trades on the picker, each once, in the order they are defined. */
export function industries(): string[] {
  const seen: string[] = [];
  for (const starter of JOURNEY_STARTERS) {
    if (!seen.includes(starter.industry)) seen.push(starter.industry);
  }
  return seen;
}

export function starterFor(key: string): JourneyStarter | null {
  return JOURNEY_STARTERS.find((starter) => starter.key === key) ?? null;
}

/**
 * The WhatsApp template name for one step.
 *
 * Deterministic, so running the same starter twice reuses the templates
 * already approved rather than submitting a second copy of each and
 * waiting on Meta again.
 */
export function templateNameFor(starter: JourneyStarter, step: StarterStep): string {
  return `neura_${starter.key}_${step.slug}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/** "4 messages over 6 months" — the shape of a journey, before reading it. */
export function describeStarter(starter: JourneyStarter): string {
  const messages = `${starter.steps.length} message${starter.steps.length === 1 ? "" : "s"}`;
  const span = starter.steps.slice(0, -1).reduce((total, step) => total + step.waitMinutes, 0);
  if (span === 0) return messages;

  const days = Math.round(span / (24 * 60));
  if (days >= 60) return `${messages} over ${Math.round(days / 30)} months`;
  if (days >= 14) return `${messages} over ${Math.round(days / 7)} weeks`;
  return `${messages} over ${days} day${days === 1 ? "" : "s"}`;
}
