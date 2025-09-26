/**
 * Phone normalisation domain layer (Single Responsibility): provide a reusable, testable
 * implementation that converts raw inputs to canonical Indonesian E.164 (+62...) numbers.
 *
 * Open/Closed: Extend by adding new strategy implementing IPhoneNormalizer without modifying consumers.
 * Liskov: Alternate implementations must honour contract of returning consistent NormalisedPhone.
 * Interface Segregation: Only expose minimal interface needed by callers.
 * Dependency Inversion: Higher-level services depend on abstraction (IPhoneNormalizer) not concrete class.
 */

export interface NormalisedPhone {
  raw: string; // original input
  canonical: string | null; // canonical phone in the selected format or null if invalid
  valid: boolean;
  reason?: string; // reason for invalidation
}

export interface IPhoneNormalizer {
  normalise(rawInput: string): NormalisedPhone;
}

export type PhoneFormat = "e164" | "local0"; // e164 => +62..., local0 => 0...

const MIN_LEN = 10; // digits excluding +
const MAX_LEN = 15; // inclusive per E.164
const nonDigit = /[^+0-9]/g;
const leadingPlusCollapse = /^\++/;

export class PhoneNormalizer implements IPhoneNormalizer {
  constructor(private readonly format: PhoneFormat = "e164") {}
  normalise(rawInput: string): NormalisedPhone {
    const raw = (rawInput ?? "").trim();
    if (!raw) return build(raw, null, false, "empty");
    let cleaned = raw.replace(nonDigit, "");
    if (cleaned.startsWith("+"))
      cleaned = "+" + cleaned.replace(leadingPlusCollapse, "");

    let canonical: string | null = null;
    // Step 1: normalise to E.164-ish +62 as an internal canonical for validation
    if (cleaned.startsWith("+62")) {
      const digits = cleaned.slice(1);
      if (/^\d+$/.test(digits)) canonical = "+" + digits;
      else return build(raw, null, false, "non_digit");
    } else if (cleaned.startsWith("62")) {
      const rest = cleaned.slice(2);
      if (/^\d+$/.test(rest)) canonical = "+62" + rest;
      else return build(raw, null, false, "non_digit");
    } else if (cleaned.startsWith("0")) {
      const rest = cleaned.slice(1);
      if (/^\d+$/.test(rest)) canonical = "+62" + rest;
      else return build(raw, null, false, "non_digit");
    } else {
      if (!/^\d+$/.test(cleaned)) return build(raw, null, false, "non_digit");
      if (cleaned.length >= 9 && cleaned.length <= 13)
        canonical = "+62" + cleaned;
      else return build(raw, null, false, "length");
    }
    if (!canonical.startsWith("+62"))
      return build(raw, null, false, "bad_prefix");
    const digitsCount = canonical.length - 1;
    if (digitsCount < MIN_LEN || digitsCount > MAX_LEN)
      return build(raw, null, false, "length");
    // Step 2: project into requested output format
    const out = this.format === "local0" ? "0" + canonical.slice(3) : canonical;
    return build(raw, out, true);
  }
}

// Factory helper (Dependency Inversion convenience)
export function createDefaultPhoneNormalizer(
  format?: PhoneFormat
): IPhoneNormalizer {
  const f = format === "local0" || format === "e164" ? format : "e164";
  return new PhoneNormalizer(f);
}

function build(
  raw: string,
  canonical: string | null, // normalized phone number
  valid: boolean,
  reason?: string
): NormalisedPhone {
  return {
    raw,
    canonical,
    valid,
    reason,
  };
}
