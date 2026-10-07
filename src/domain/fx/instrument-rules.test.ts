import { describe, expect, it } from "vitest";
import { resolveInstrumentLotRules, sanitizeInstrumentLotOverrides } from "./instrument-rules";

describe("resolveInstrumentLotRules", () => {
  it("uses forex defaults for normal currency pairs", () => {
    expect(resolveInstrumentLotRules("EURUSD")).toEqual({
      symbol: "EURUSD",
      lotStep: 0.01,
      minLot: 0.01,
      source: "default",
    });
  });

  it("uses index defaults for index aliases", () => {
    expect(resolveInstrumentLotRules("NAS100")).toEqual({
      symbol: "US100",
      lotStep: 0.1,
      minLot: 0.1,
      source: "default",
    });
  });

  it("applies per-instrument overrides", () => {
    expect(resolveInstrumentLotRules("GOLD", { XAUUSD: { lotStep: 0.1, minLot: 0.5 } })).toEqual({
      symbol: "XAUUSD",
      lotStep: 0.1,
      minLot: 0.5,
      source: "override",
    });
  });
});

describe("sanitizeInstrumentLotOverrides", () => {
  it("keeps only positive numeric override fields and normalizes symbols", () => {
    expect(
      sanitizeInstrumentLotOverrides({
        gold: { lotStep: 0.1, minLot: "0.5" },
        EURUSD: { lotStep: -1, minLot: 0 },
        empty: "nope",
      }),
    ).toEqual({
      XAUUSD: { lotStep: 0.1, minLot: 0.5 },
    });
  });
});
