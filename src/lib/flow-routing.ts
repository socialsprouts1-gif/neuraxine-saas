// Which of a workspace's WhatsApp numbers may act on a given flow.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// A flow belongs to exactly one WhatsApp Business Account. A workspace with
// two numbers usually has two accounts, and picking the wrong one produces
// two errors that name neither the number nor the account: 100/33 when
// uploading the flow's JSON, 131009 when sending it. Deciding this in one
// pure function means the rule is checkable without a Meta round trip.

/** A number and the account it is on. What most of this needs to know. */
export interface NumberAccount {
  id: string;
  wabaId: string;
  status: string;
}

/** The same, plus the tie-break for picking one of several. */
export interface NumberOnAccount extends NumberAccount {
  isDefault: boolean;
}

export type Routing =
  | { ok: true; connectionId: string; wabaId: string }
  | { ok: false; reason: "none-connected" | "account-not-connected" };

/**
 * Picks the number to act on for a flow.
 *
 * `wabaId` null means the flow predates the column being filled in: it is
 * routed to the default so it keeps working, and the caller records what it
 * learns so the next call routes properly.
 */
export function routeFlow(
  connections: readonly NumberOnAccount[],
  wabaId: string | null | undefined
): Routing {
  const active = connections.filter((connection) => connection.status === "active");
  if (active.length === 0) return { ok: false, reason: "none-connected" };

  const eligible = wabaId ? active.filter((connection) => connection.wabaId === wabaId) : active;

  // Deliberately not falling back to the default when the flow's own
  // account has no active number. The default is a number on some other
  // account, and using it is exactly the mistake being prevented.
  if (eligible.length === 0) return { ok: false, reason: "account-not-connected" };

  const chosen = eligible.find((connection) => connection.isDefault) ?? eligible[0];
  return { ok: true, connectionId: chosen.id, wabaId: chosen.wabaId };
}

/** The accounts to walk when importing everything Meta knows about. */
export function accountsToSync(connections: readonly NumberAccount[]): string[] {
  const seen = new Set<string>();
  for (const connection of connections) {
    if (connection.status === "active") seen.add(connection.wabaId);
  }
  return [...seen];
}

export interface FormOnAccount {
  id: string;
  /** Null on a form uploaded before the account was recorded. */
  wabaId: string | null;
}

/**
 * The forms a bot listening on these numbers can actually open.
 *
 * A Send Form node on a bot that only listens on one number cannot open a
 * form built on a different account — WhatsApp refuses it at the customer,
 * which is the worst place to find out. Offering only the forms that can
 * work is the difference between a bot that fails in a chat and one that
 * cannot be built wrong.
 *
 * `listeningOn` empty means every number, which is what a one-number
 * workspace wants and what every bot built before numbers existed means.
 *
 * A form with no account recorded is kept rather than hidden. It predates
 * the column, it may well work, and hiding a working form is worse than
 * showing one that might not.
 */
export function formsOnNumbers<T extends FormOnAccount>(
  forms: readonly T[],
  numbers: readonly NumberAccount[],
  listeningOn: readonly string[]
): T[] {
  const active = numbers.filter((number) => number.status === "active");
  const chosen =
    listeningOn.length === 0
      ? active
      : active.filter((number) => listeningOn.includes(number.id));

  const accounts = new Set(chosen.map((number) => number.wabaId));
  return forms.filter((form) => form.wabaId === null || accounts.has(form.wabaId));
}

export interface AssistantOnNumber {
  id: string;
  /** Null means "runs on every number", which is how most are set up. */
  connectionId: string | null;
}

/**
 * The assistants an AI Agent node on this bot can actually hand a reply to.
 *
 * An assistant pinned to one number must not answer on another — that is
 * the whole point of pinning it, and a flow that quietly used a different
 * one would answer in the wrong voice with the wrong knowledge. This is
 * narrower than the form rule above because an assistant is tied to a
 * single number, not to a whole WhatsApp account.
 *
 * `listeningOn` empty means the bot listens on every number, so every
 * assistant is reachable.
 */
export function assistantsOnNumbers<T extends AssistantOnNumber>(
  assistants: readonly T[],
  listeningOn: readonly string[]
): T[] {
  if (listeningOn.length === 0) return [...assistants];
  return assistants.filter(
    (assistant) =>
      assistant.connectionId === null || listeningOn.includes(assistant.connectionId)
  );
}
