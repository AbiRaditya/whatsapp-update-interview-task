import { createDefaultPhoneNormalizer } from "../src-ts/phoneNormaliser";

describe("normalisePhone (E.164 +62)", () => {
  const normalizer = createDefaultPhoneNormalizer("e164");
  it("handles +62 formatted", () => {
    expect(normalizer.normalise("+62 812-3456-7890").canonical).toBe(
      "+6281234567890"
    );
  });
  it("handles 62 prefix", () => {
    expect(normalizer.normalise("6285678901234").canonical).toBe(
      "+6285678901234"
    );
  });
  it("handles leading zero", () => {
    expect(normalizer.normalise("081234567890").canonical).toBe(
      "+6281234567890"
    );
  });
  it("strips punctuation", () => {
    expect(normalizer.normalise("0834-5678-9012").canonical).toBe(
      "+6283456789012"
    );
  });
  it("assumes local", () => {
    expect(normalizer.normalise("85678901234").canonical).toBe(
      "+6285678901234"
    );
  });
  it("rejects short", () => {
    const r = normalizer.normalise("890123");
    expect(r.valid).toBe(false);
  });
  it("rejects non digit", () => {
    const r = normalizer.normalise("62abc123");
    expect(r.valid).toBe(false);
  });
});

describe("normalisePhone (local leading 0)", () => {
  const normalizer = createDefaultPhoneNormalizer("local0");
  it("handles +62 formatted -> 0…", () => {
    expect(normalizer.normalise("+62 812-3456-7890").canonical).toBe(
      "081234567890"
    );
  });
  it("handles 62 prefix -> 0…", () => {
    expect(normalizer.normalise("6285678901234").canonical).toBe(
      "085678901234"
    );
  });
  it("handles leading zero (kept as 0…)", () => {
    expect(normalizer.normalise("081234567890").canonical).toBe("081234567890");
  });
  it("strips punctuation -> 0…", () => {
    expect(normalizer.normalise("0834-5678-9012").canonical).toBe(
      "083456789012"
    );
  });
  it("assumes local -> 0…", () => {
    expect(normalizer.normalise("85678901234").canonical).toBe("085678901234");
  });
  it("rejects short", () => {
    const r = normalizer.normalise("890123");
    expect(r.valid).toBe(false);
  });
  it("rejects non digit", () => {
    const r = normalizer.normalise("62abc123");
    expect(r.valid).toBe(false);
  });
});
