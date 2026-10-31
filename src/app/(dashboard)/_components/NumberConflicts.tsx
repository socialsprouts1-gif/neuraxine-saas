import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { conflicts, describeConflict, type Claimant } from "@/lib/number-conflicts";

// "Both of these are switched on and only one of them works."
//
// A chatbot and an assistant on the same number is the design working:
// the bot answers the keywords it was written for, the assistant catches
// the rest. Two assistants on one number is not — exactly one replies and
// the other sits there looking live. Nothing said so, which is how a
// workspace ends up with four assistants switched on and one doing all
// the work.
//
// Says which one answers rather than just that there is a clash, because
// "there is a conflict" leaves somebody to work out the rule themselves.

export default function NumberConflicts({
  rows,
  numbers,
  /** "assistant" / "chatbot", for the sentence. */
  noun,
}: {
  rows: Claimant[];
  numbers: { id: string; label: string }[];
  noun: string;
}) {
  const found = conflicts(rows);
  if (found.length === 0) return null;

  const labelFor = (id: string | null) =>
    id ? (numbers.find((n) => n.id === id)?.label ?? "That number") : "Any number";

  // "A assistant" is the kind of thing that makes a product look
  // unfinished, and the noun is a prop, so the article has to be worked
  // out rather than typed.
  const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
  const other = noun === "assistant" ? "chatbot" : "assistant";

  return (
    <Card className="mb-5 border-[#FACC15]/25">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-[#FACC15] flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="font-semibold mb-1">
            {found.length === 1
              ? `Two ${noun}s are on the same number`
              : `Some ${noun}s are on the same number as another`}
          </h2>
          <p className="text-sm text-white/55 leading-relaxed mb-3">
            Only one {noun} can answer a given message. Where more than one is switched on for a
            number, the one pinned to that number wins, and the oldest wins a tie — so the others
            never reply at all.
          </p>
          <ul className="space-y-1.5 mb-3">
            {found.map((conflict) => (
              <li
                key={conflict.connectionId ?? "any"}
                className="text-[13px] text-white/70 leading-relaxed"
              >
                {describeConflict(conflict, labelFor(conflict.connectionId))}
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-white/35 leading-relaxed">
            Switch the extra ones off, or put each on its own number. {article(noun)[0].toUpperCase()}
            {article(noun).slice(1)} {noun} and {article(other)} {other} sharing a number is fine —
            that pairing is how it is meant to work, and they never both reply to the same
            message.{" "}
            <Link href="/guides" className="text-accent-ink hover:underline">
              How replies are chosen
            </Link>
          </p>
        </div>
      </div>
    </Card>
  );
}
