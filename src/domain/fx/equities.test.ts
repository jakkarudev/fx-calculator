import { describe, expect, it } from "vitest";
import snapshot from "./catalog-source/symbols-response.json";
import { getInstrumentCatalog } from "./catalog";
import { getInstrumentSpec, normalizePair } from "./pairs";
import { parseSignal } from "./parse-signal";
import { calculatePosition } from "./calculate-position";
import { createAdjustedPosition } from "./adjust-signal";

const trade = {
  side: "buy" as const,
  orderType: "market" as const,
  accountBalance: 10000,
  riskPercent: 1,
  accountCurrency: "USD",
  requireReliablePipValue: true,
};
const prices = "\nENTRY 200.00\nSL 195.00\nTP 210.00";

describe("equity CFD imports", () => {
  it("activates each captured equity with accurate contract and explicit lot provenance", () => {
    const rows = snapshot.data.symbols.filter(
      (row) => row.active && row.region === "global" && row.assetClass === "Equities CFD",
    );
    expect(getInstrumentCatalog().filter((spec) => spec.kind === "equity")).toHaveLength(rows.length);
    for (const row of rows) {
      expect(getInstrumentSpec(row.code)).toMatchObject({
        symbol: row.code,
        displaySymbol: row.displayCode,
        contractSize: row.contractSize,
        profitCurrency: row.profitCurrency,
        priceDigits: row.digits,
        pipSize: row.pipConversion,
        lotRulesSource: row.code === "V" ? "historical-official" : "compatibility-default",
        defaultMinLot: row.code === "V" ? 1 : 0.01,
        defaultLotStep: row.code === "V" ? 1 : 0.01,
      });
    }
  });
  it.each([
    ["brk.b.pro BUY", "BRK.B"],
    ["BUY\nT", "T"],
    ["BRK.B\nSELL LIMIT", "BRK.B"],
    ["BUY T.", "T"],
    ["BUY BRK.B.", "BRK.B"],
    ["BUY #VOWG_p.raw", "VOWG_p"],
    ["SYMBOL:\n$t.raw\nTYPE BUY", "T"],
    ["buy T.raw", "T"],
    ["SYMBOL: v_std\nTYPE BUY", "V"],
    ["bAyGn BUY", "BAYGn"],
    ["VOWG_p.raw BUY", "VOWG_p"],
    ["BUY KO", "KO"],
    ["$t BUY", "T"],
    ["$T.raw\nTYPE BUY", "T"],
    ["#fb SELL", "META"],
  ])("resolves declared or direction-adjacent ticker %s", (header, canonical) => {
    expect(parseSignal(header + prices).pair).toBe(canonical);
  });
  it.each([
    "T noted; BUY T.FAKE",
    "BRK.B mentioned; BUY BRK.B.fake",
    "T mentioned; BUY T.raw.fake",
    "SYMBOL: T-FAKE BUY",
    "BUY T-FAKE",
    "BUY BRK.B-FAKE",
    "$T-FAKE BUY",
    "T mentioned; BUY $T.fake",
    "BRKB BUY",
    "BRK.B.fake BUY",
    "T.FAKE BUY",
    "SYMBOL: BRKB\nT BUY",
    "There is a t in this signal\nTYPE BUY",
    "ARM yourself with patience\nTYPE BUY",
    "SNOW is forecast\nTYPE BUY",
  ])("rejects unsupported decoration or prose %s", (header) => {
    expect(() => parseSignal(header + prices)).toThrow();
  });
  it("resolves every active equity alias only in instrument context", () => {
    for (const spec of getInstrumentCatalog().filter((instrument) => instrument.kind === "equity")) {
      for (const alias of spec.aliases) {
        for (const header of [
          `SYMBOL: ${alias.toLowerCase()}.raw\nTYPE BUY`,
          `BUY LIMIT ${alias}`,
          `${alias}\nBUY`,
          `$${alias}.std\nTYPE BUY`,
        ]) {
          expect(parseSignal(header + prices).pair, header).toBe(spec.symbol);
        }
        expect(() => parseSignal(`${alias} is mentioned\nTYPE BUY${prices}`), alias).toThrow();
      }
    }
  });

  it("prioritizes the declared symbol over direction-adjacent commentary", () => {
    expect(parseSignal("ARM BUY discussion\nSYMBOL: T\nTYPE BUY" + prices).pair).toBe("T");
  });
  it("preserves meaningful punctuation during direct resolution", () => {
    expect(normalizePair("brk.b")).toBe("BRK.B");
    expect(normalizePair("BRKB")).toBe("");
    expect(normalizePair("$t.raw")).toBe("T");
    expect(normalizePair("#brk.b")).toBe("BRK.B");
    expect(normalizePair("$EURUSD")).toBe("");
  });
  it.each([
    ["AAPL", "USD", 20, "exact"],
    ["AAPL", "EUR", 25, "converted"],
    ["TTE", "EUR", 20, "exact"],
    ["TTE", "USD", 16, "converted"],
    ["ASML", "EUR", 25, "converted"],
  ])("values %s in %s by the source profit currency", (instrument, accountCurrency, lotSize, mode) => {
    const result = calculatePosition({
      ...trade,
      pair: instrument,
      accountCurrency,
      eurUsdRate: 1.25,
      entry: 200,
      stopLoss: 195,
      takeProfit: 210,
    });
    expect(result.lotSize).toBe(lotSize);
    expect(result.pipValueMode).toBe(mode);
    expect(result.actualRiskAmount).toBeCloseTo(100);
    expect(result.rewardAmount).toBeCloseTo(200);
  });
  it("rejects missing conversion and invalid price structure", () => {
    expect(() =>
      calculatePosition({ ...trade, pair: "TTE", accountCurrency: "GBP", entry: 200, stopLoss: 195, takeProfit: 210 }),
    ).toThrow(/Reliable/);
    expect(() => calculatePosition({ ...trade, pair: "AAPL", entry: 200, stopLoss: 205, takeProfit: 210 })).toThrow(
      /below entry/,
    );
  });
  it.each([
    ["AAPL", 200, 195, 210, 0.1],
    ["SAN", 4, 3, 6, 0.001],
  ])("caps signal-relative adjustment using %s precision", (instrument, entry, stopLoss, takeProfit, cap) => {
    const result = createAdjustedPosition(
      { ...trade, pair: instrument, entry, stopLoss, takeProfit, eurUsdRate: 1.25 },
      { enabled: true, mode: "signal-relative", strength: "normal", profile: "shift" },
    );
    expect(result.changed).toBe(true);
    expect(result.active.entry - entry).toBeCloseTo(cap, 6);
    expect(result.active.actualRiskPercent).toBeLessThanOrEqual(1.2);
    expect(result.active.rr).toBeCloseTo(2);
  });
  it("rounds Visa to the historical whole-lot step and reports actual risk", () => {
    const result = calculatePosition({ ...trade, pair: "V", entry: 200, stopLoss: 195.2, takeProfit: 209.6 });
    expect(result.lotSize).toBe(20);
    expect(result.actualRiskAmount).toBeCloseTo(96);
    expect(result.rr).toBeCloseTo(2);
  });
  it("retains fixed movement units and minimum-volume risk safeguards", () => {
    const result = createAdjustedPosition(
      { ...trade, pair: "AAPL", entry: 200, stopLoss: 195, takeProfit: 210 },
      { enabled: true, fixedPips: 1, profile: "shift" },
    );
    expect(result.active.entry).toBe(201);
    const rejected = createAdjustedPosition(
      { ...trade, accountBalance: 100, pair: "V", entry: 200, stopLoss: 195, takeProfit: 210 },
      { enabled: true, mode: "signal-relative" },
    );
    expect(rejected.adjusted).toBeNull();
    expect(rejected.rejectionReason).toBe("risk");
  });
});
