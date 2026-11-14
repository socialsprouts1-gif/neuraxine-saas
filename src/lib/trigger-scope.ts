import type { FlowNode } from "@/types/flow";

// Which of a workspace's WhatsApp numbers a chatbot trigger listens on.
//
// Its own module because it is pure — no imports that survive compilation —
// which is what makes it testable directly. flow-engine re-exports it so
// call sites keep a single import.

/**
 * An empty list means every number.
 *
 * That is what a one-number workspace wants, and what every bot built
 * before numbers were a concept already means — so the absence of a choice
 * must never be read as "listens on nothing".
 *
 * A conversation with no number recorded matches only unrestricted
 * triggers: a bot told to stay off a number must not answer on a thread
 * whose number we cannot identify.
 */
export function triggerListensOn(node: FlowNode, connectionId: string | null): boolean {
  const chosen = Array.isArray(node.data?.phoneNumbers)
    ? (node.data.phoneNumbers as unknown[]).filter(
        (entry): entry is string => typeof entry === "string" && entry.length > 0
      )
    : [];

  if (chosen.length === 0) return true;
  return connectionId !== null && chosen.includes(connectionId);
}
