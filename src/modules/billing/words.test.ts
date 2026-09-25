import { describe, expect, it } from "vitest";

import { amountInWords, numberInWords } from "./words";

describe("amounts in words (Indian system)", () => {
  it("spells lakhs and crores", () => {
    expect(numberInWords(0)).toBe("Zero");
    expect(numberInWords(105)).toBe("One Hundred Five");
    expect(numberInWords(295000)).toBe("Two Lakh Ninety-Five Thousand");
    expect(numberInWords(12_34_56_789)).toBe(
      "Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine",
    );
    expect(numberInWords(1_00_00_000)).toBe("One Crore");
  });

  it("adds paise", () => {
    expect(amountInWords("225380.06")).toBe(
      "Rupees Two Lakh Twenty-Five Thousand Three Hundred Eighty and Six Paise Only",
    );
    expect(amountInWords("1180")).toBe("Rupees One Thousand One Hundred Eighty Only");
  });
});
