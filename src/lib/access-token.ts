// Meta access tokens travel in an HTTP header, and HTTP headers are
// ByteStrings — every character must be a single byte. A token carrying a
// smart quote, an em dash or a stray newline makes fetch() throw
//
//   TypeError: Cannot convert argument to a ByteString because the character
//   at index 21 has a value of 8212 which is greater than 255
//
// before the request is ever sent. That happened in production: an editor's
// dash substitution turned a hyphen in a pasted token into U+2014, and the
// operator saw "Failed to send message" with no way to know why.
//
// Cheaper to refuse the token at the point it is pasted, naming the exact
// character, than to let it fail at send time.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

export class InvalidAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAccessTokenError";
  }
}

// Printable ASCII. Meta's tokens are base64url — letters, digits, - and _ —
// so this is generous, and anything outside it cannot go in a header anyway.
const LOWEST_PRINTABLE = 0x21; // '!'
const HIGHEST_PRINTABLE = 0x7e; // '~'

// The substitutions that actually cause this, so the message can say what
// probably happened rather than just which code point is wrong.
const LIKELY_SUBSTITUTIONS: Record<number, string> = {
  0x2013: "an en dash (–), usually autocorrect replacing a hyphen",
  0x2014: "an em dash (—), usually autocorrect replacing a hyphen",
  0x2018: "a curly quote (‘), usually autocorrect replacing an apostrophe",
  0x2019: "a curly quote (’), usually autocorrect replacing an apostrophe",
  0x201c: "a curly quote (“), usually autocorrect replacing a straight quote",
  0x201d: "a curly quote (”), usually autocorrect replacing a straight quote",
  0x00a0: "a non-breaking space, usually picked up when copying from a web page",
  0x200b: "a zero-width space, usually picked up when copying from a web page",
  0x2026: "an ellipsis (…), which means the token was copied from a truncated display",
};

function describeCharacter(code: number): string {
  const known = LIKELY_SUBSTITUTIONS[code];
  if (known) return known;
  if (code === 0x0a || code === 0x0d) return "a line break";
  if (code === 0x09) return "a tab";
  if (code === 0x20) return "a space";
  return `the character U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

export interface TokenCheck {
  /** The token to store — trimmed. Only set when ok. */
  token?: string;
  /** Why it cannot be stored. Only set when not ok. */
  error?: string;
  /**
   * Storable, but probably not what the operator meant. Surfaced alongside
   * success rather than blocking — an unusual token beats a refused one.
   */
  warning?: string;
  ok: boolean;
}

/**
 * Checks a pasted Meta access token for characters that cannot survive an
 * HTTP header, and for the shape mistakes that are worth mentioning.
 */
export function checkAccessToken(raw: string): TokenCheck {
  const token = raw.trim();

  if (!token) {
    return { ok: false, error: "Paste the access token — the field is empty." };
  }

  for (let index = 0; index < token.length; index += 1) {
    const code = token.codePointAt(index)!;
    if (code < LOWEST_PRINTABLE || code > HIGHEST_PRINTABLE) {
      return {
        ok: false,
        error:
          `That token contains ${describeCharacter(code)} at character ${index + 1}, ` +
          `which cannot be sent in an HTTP header — so no message would ever reach Meta. ` +
          `Copy the token again straight from Meta, and paste it somewhere that does not ` +
          `autocorrect punctuation.`,
      };
    }
  }

  // Every token Meta issues for the Graph API starts "EA". Pasting the app
  // secret, the verify token, or the phone number ID here is a real and
  // repeated mistake, but not one worth blocking a save over.
  const warning = token.startsWith("EA")
    ? undefined
    : "Saved, but Meta access tokens normally start with \"EA\" — check you pasted the access token and not the app secret or verify token.";

  return { ok: true, token, warning };
}

/**
 * Throws if a token that is already stored cannot go in a header. Guards the
 * send path for tokens saved before this validation existed.
 */
export function assertUsableAccessToken(token: string): void {
  const check = checkAccessToken(token);
  if (!check.ok) {
    throw new InvalidAccessTokenError(
      `The stored WhatsApp access token is unusable. ${check.error} Fix it in Integrations → WhatsApp → Update access token.`
    );
  }
}
