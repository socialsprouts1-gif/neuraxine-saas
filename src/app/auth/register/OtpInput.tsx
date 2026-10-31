"use client";

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { CODE_LENGTH } from "@/lib/signup-otp";

// Six boxes for a six-digit code.
//
// One string of state, six views of it — not six pieces of state, which is
// how these end up disagreeing with themselves when somebody pastes.
//
// The three things people actually do with a code field, in order of how
// often they are got wrong: pasting the whole code into the third box,
// pressing backspace on an empty box and expecting to go left, and having
// the phone's keyboard offer to fill it in. All three work here.

export default function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Fired once the sixth digit lands, so nobody has to find the button. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);

  // The first empty box is where typing should go, so focus follows the
  // value rather than being pushed around by each keystroke's handler.
  useEffect(() => {
    if (disabled) return;
    const next = Math.min(digits.length, CODE_LENGTH - 1);
    const box = boxes.current[next];
    if (box && document.activeElement !== box) box.focus();
  }, [digits.length, disabled]);

  const set = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, CODE_LENGTH);
    onChange(cleaned);
    if (cleaned.length === CODE_LENGTH) onComplete?.(cleaned);
  };

  const handleKey = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      // On an empty box, delete the digit before it — which is what
      // backspace means to everybody. On a filled one, delete that digit and
      // close the gap, because the value is one string and a hole in the
      // middle of it is not a state this can be in.
      if (index >= digits.length) {
        set(digits.slice(0, Math.max(digits.length - 1, 0)));
      } else {
        set(digits.slice(0, index) + digits.slice(index + 1));
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      boxes.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      boxes.current[index + 1]?.focus();
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      // Overwrites the digit under the cursor rather than truncating what
      // follows it, so correcting one wrong digit does not clear the rest.
      set(digits.slice(0, index) + event.key + digits.slice(index + 1));
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    // The whole clipboard, not just the digits near the cursor — autofill
    // pastes the sentence the code was in, and a code is the only run of
    // six digits in it.
    set(event.clipboardData.getData("text"));
  };

  return (
    <div className="flex gap-2 justify-between" dir="ltr">
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          // One-time-code autofill only reads the first field, and only when
          // it is not hidden behind five others — so it goes here.
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={digits[index] ?? ""}
          onChange={() => {
            // Every change arrives through onKeyDown or onPaste above, which
            // keeps the single string the only source of truth. This exists
            // so React does not warn about a controlled input without it.
          }}
          onKeyDown={handleKey(index)}
          onPaste={handlePaste}
          onFocus={(event) => event.currentTarget.select()}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          className={`w-full min-w-0 h-14 rounded-xl text-center text-xl font-bold tabular-nums bg-white/5 border text-white transition-all focus:outline-none disabled:opacity-50 ${
            invalid
              ? "border-red-400/60 focus:border-red-400"
              : digits[index]
                ? "border-accent/50"
                : "border-white/12 focus:border-accent/50"
          }`}
        />
      ))}
    </div>
  );
}
