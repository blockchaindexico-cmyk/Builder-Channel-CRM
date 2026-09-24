import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ValidationError } from "@/platform/errors";

import { parseInput } from "./validation";

describe("parseInput", () => {
  const schema = z.object({
    name: z.string().min(2, "Too short"),
    address: z.object({ city: z.string().min(1, "Required") }),
  });

  it("returns parsed data", () => {
    expect(parseInput(schema, { name: "Ok", address: { city: "Pune" } })).toEqual({
      name: "Ok",
      address: { city: "Pune" },
    });
  });

  it("throws ValidationError with dotted field paths", () => {
    try {
      parseInput(schema, { name: "x", address: { city: "" } });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors).toEqual({
        name: ["Too short"],
        "address.city": ["Required"],
      });
    }
  });
});
