import { describe, expect, it } from "vitest";
import { formatLot } from "./format";

describe("lot formatting", () => {
  it.each([
    [0.025, "0.025"],
    [0.0000001, "0.0000001"],
    [1.23e-7, "0.000000123"],
    [1e-101, `0.${"0".repeat(100)}1`],
    [0.02345, "0.02345"],
    [0.02, "0.02"],
    [1.2, "1.20"],
    [2, "2.00"],
  ])("preserves actual lot %s with ordinary two-decimal padding", (value, expected) => {
    expect(formatLot(value)).toBe(expected);
  });

  it("retains explicit increment padding without rounding away the actual lot", () => {
    expect(formatLot(0.025, 0.01)).toBe("0.025");
    expect(formatLot(0.02, 0.001)).toBe("0.020");
    expect(formatLot(1.2, 0.1)).toBe("1.2");
  });
});
