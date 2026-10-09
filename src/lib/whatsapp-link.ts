// A link that opens WhatsApp on the right number.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// wa.me wants digits and nothing else — no plus, no spaces, no dashes, and
// the country code always present. A number typed the way a person says it
// ("8767512569", "+91 87675 12569", "087675-12569") has to come out the
// same way every time, because a link with a malformed number does not
// fail loudly: WhatsApp opens and says the number is invalid, which reads
// to the visitor as the business being broken.

/** India, because that is where this product's own number is. */
const DEFAULT_COUNTRY = "91";

/** WhatsApp's own limit on a prefilled message. */
const MAX_PREFILL = 1000;

/**
 * The digits wa.me wants, or null if there is no usable number.
 *
 * A bare ten-digit number gets the default country code — that is how
 * Indian numbers are written and said, and refusing them would mean the
 * number in the footer has to be typed in a format nobody uses.
 */
export function normaliseWaNumber(
  input: string,
  country: string = DEFAULT_COUNTRY
): string | null {
  let digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // 00 is the other way of writing a leading plus.
  if (digits.startsWith("00")) digits = digits.slice(2);

  // A leading zero is a domestic trunk prefix, never part of an
  // international number: 087675 12569 and 091 87675 12569 are both the
  // same phone. Stripping only an 11-digit one missed the second.
  digits = digits.replace(/^0+/, "");
  if (!digits) return null;

  if (digits.length === 10) digits = `${country}${digits}`;

  // Shorter than a country code plus a subscriber number is not a number
  // anybody can be reached on; longer than E.164 allows is a typo.
  if (digits.length < 11 || digits.length > 15) return null;

  return digits;
}

/** How the number should read on screen: +91 87675 12569. */
export function displayWaNumber(input: string, country: string = DEFAULT_COUNTRY): string {
  const digits = normaliseWaNumber(input, country);
  if (!digits) return input;

  if (digits.startsWith(country) && digits.length === country.length + 10) {
    const local = digits.slice(country.length);
    return `+${country} ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}

/**
 * The https://wa.me/… link, with an optional first message.
 *
 * Returns null rather than a broken link when the number cannot be read,
 * so a caller renders nothing instead of a button that opens WhatsApp on
 * an error.
 */
export function whatsappHref(
  number: string,
  message?: string,
  country: string = DEFAULT_COUNTRY
): string | null {
  const digits = normaliseWaNumber(number, country);
  if (!digits) return null;

  const text = (message ?? "").trim().slice(0, MAX_PREFILL);
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}
