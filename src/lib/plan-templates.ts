// Ready-made wording for the three plan cards.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The bullets on a pricing card are a comparison, not a list of facts
// about each tier separately. Written per plan they drift: one card says
// "1 WhatsApp number", the next says "Campaigns & automations", the third
// says "Priority support" — three true statements that cannot be read
// against each other, so the reader cannot tell what the extra money buys.
//
// These are parallel. Every tier answers the same five questions in the
// same order, so the differences are the only thing that moves.

export interface PlanTemplate {
  slug: string;
  name: string;
  description: string;
  /** Five bullets, same five subjects in the same order on every tier. */
  features: string[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    slug: "starter",
    name: "Starter",
    description: "For a business answering WhatsApp properly for the first time.",
    features: [
      "1,000 messages a month",
      "500 contacts",
      "2 team seats",
      "1 WhatsApp number",
      "Shared inbox, chatbot and forms",
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    description: "For a team running campaigns and following them up.",
    features: [
      "10,000 messages a month",
      "5,000 contacts",
      "10 team seats",
      "2 WhatsApp numbers",
      "Everything in Starter, plus campaigns, automations and the AI assistant",
    ],
  },
  {
    slug: "scale",
    name: "Scale",
    description: "For high volume across several numbers, with support that answers.",
    features: [
      "100,000 messages a month",
      "50,000 contacts",
      "50 team seats",
      "Unlimited WhatsApp numbers",
      "Everything in Growth, plus priority support and the API",
    ],
  },
];

export function templateFor(slug: string): PlanTemplate | null {
  const wanted = slug.trim().toLowerCase();
  return PLAN_TEMPLATES.find((template) => template.slug === wanted) ?? null;
}

/**
 * Matches a plan to a template by slug, then by name.
 *
 * Name as a fallback because a plan created by hand may have any slug —
 * and refusing to fill in a card because of a slug nobody chose
 * deliberately would make this useless on exactly the plans that need it.
 */
export function matchTemplate(plan: { slug?: string | null; name?: string | null }): PlanTemplate | null {
  const bySlug = plan.slug ? templateFor(plan.slug) : null;
  if (bySlug) return bySlug;

  const name = plan.name?.trim().toLowerCase() ?? "";
  return PLAN_TEMPLATES.find((template) => template.name.toLowerCase() === name) ?? null;
}

export interface PlanFill {
  description?: string;
  features?: string[];
}

/**
 * What to write onto a plan, leaving alone anything already set.
 *
 * Price, limits and whether a plan is active are all deliberate decisions
 * somebody made, and are never touched here — a button that tidies the
 * wording must not quietly reprice the product. A description or a bullet
 * list that is already written is left as it is too; this fills gaps.
 */
export function fillFor(
  plan: { slug?: string | null; name?: string | null; description?: string | null; features?: string[] | null },
  options: { overwrite?: boolean } = {}
): PlanFill | null {
  const template = matchTemplate(plan);
  if (!template) return null;

  const fill: PlanFill = {};
  const hasDescription = Boolean(plan.description?.trim());
  const hasFeatures = (plan.features ?? []).some((line) => line.trim().length > 0);

  if (options.overwrite || !hasDescription) fill.description = template.description;
  if (options.overwrite || !hasFeatures) fill.features = template.features;

  return Object.keys(fill).length > 0 ? fill : null;
}
