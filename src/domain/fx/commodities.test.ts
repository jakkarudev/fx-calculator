import { describe, expect, it } from "vitest";
import { getInstrumentCatalog } from "./catalog";
import { normalizePair, getInstrumentSpec } from "./pairs";
import { parseSignal } from "./parse-signal";
import { calculatePosition } from "./calculate-position";
import { createAdjustedPosition } from "./adjust-signal";
import { getPipValueRateCandidates } from "./conversion-rules";

const trade = {
  side: "buy" as const,
  orderType: "market" as const,
  accountBalance: 10000,
  riskPercent: 1,
  accountCurrency: "USD",
  requireReliablePipValue: true,
};

// Independently specified expected contracts and $100-risk position sizes.
const cases = [
  ["USOIL.cash", 100, 3, 80, 78, 84, 0.5, 0.01],
  ["UKOIL.cash", 100, 3, 85, 83, 89, 0.5, 0.01],
  ["NATGAS.cash", 1000, 3, 3, 2.9, 3.2, 1, 0.01],
  ["HEATOIL.c", 100, 3, 2.5, 2.4, 2.7, 10, 0.01],
  ["COCOA.c", 1, 1, 8000, 7950, 8100, 2, 1],
  ["COFFEE.c", 1, 2, 300, 295, 310, 20, 1],
  ["CORN.c", 1, 2, 450, 445, 460, 20, 1],
  ["SOYBEAN.c", 1, 2, 1000, 990, 1020, 10, 1],
  ["WHEAT.c", 1, 2, 600, 595, 610, 20, 1],
  ["COTTON.c", 1, 2, 70, 68, 74, 50, 0.01],
  ["SUGAR.c", 1, 2, 20, 19, 22, 100, 0.01],
] as const;

describe("FTMO commodities", () => {
  it("activates all eleven snapshot commodities", () => {
    expect(
      getInstrumentCatalog()
        .filter((s) => s.kind === "commodity")
        .map((s) => s.symbol)
        .sort(),
    ).toEqual(cases.map((c) => c[0]).sort());
  });
  it.each(cases)(
    "sizes %s using its validated contract and documented volume policy",
    (instrument, contractSize, priceDigits, entry, stopLoss, takeProfit, lotSize, lotStep) => {
      expect(getInstrumentSpec(instrument)).toMatchObject({
        kind: "commodity",
        contractSize,
        priceDigits,
        profitCurrency: "USD",
        pipSize: 1,
        defaultLotStep: lotStep,
        defaultMinLot: lotStep,
        lotRulesSource: lotStep === 1 ? "historical-official" : "compatibility-default",
      });
      const result = calculatePosition({ ...trade, pair: instrument, entry, stopLoss, takeProfit });
      expect(result.lotSize).toBe(lotSize);
      expect(result.actualRiskAmount).toBeCloseTo(100);
      expect(result.rewardAmount).toBeCloseTo(200);
    },
  );
  it.each([
    ["WTI", "USOIL.cash"],
    ["Brent", "UKOIL.cash"],
    ["natural gas", "NATGAS.cash"],
    ["heating oil", "HEATOIL.c"],
    ["Coffee", "COFFEE.c"],
    ["USOIL.cash.pro", "USOIL.cash"],
    ["COCOA.c.raw", "COCOA.c"],
  ])("resolves %s consistently through imports", (alias, instrument) => {
    expect(normalizePair(alias)).toBe(instrument);
    expect(parseSignal(`${alias} BUY\nENTRY 80\nSL 78\nTP 84`).pair).toBe(instrument);
  });
  it.each(["USOIL.cash.FAKE", "COFFEE.cFAKE", "COFFEE.cash", "OILFAKE", "natural gas.FAKE"])(
    "rejects unsupported %s without forex assumptions",
    (instrument) => {
      expect(normalizePair(instrument)).toBe("");
      expect(() =>
        calculatePosition({ ...trade, pair: instrument, entry: 80, stopLoss: 78, takeProfit: 84 }),
      ).toThrow();
    },
  );
  it("values USD contracts in EUR and rejects unavailable foreign conversion", () => {
    const input = { ...trade, pair: "WTI", entry: 80, stopLoss: 78, takeProfit: 84 };
    expect(calculatePosition({ ...input, accountCurrency: "EUR", eurUsdRate: 1.25 })).toMatchObject({
      lotSize: 0.62,
      pipValueMode: "converted",
      actualRiskAmount: 99.2,
    });
    expect(getPipValueRateCandidates("WTI", "GBP")).toEqual([
      { baseCurrency: "USD", quoteCurrency: "GBP", useAs: "quote" },
    ]);
    expect(() => calculatePosition({ ...input, accountCurrency: "GBP" })).toThrow(/Reliable/);
    expect(calculatePosition({ ...input, accountCurrency: "GBP", manualPipValuePerLot: 100 })).toMatchObject({
      lotSize: 0.5,
      pipValueMode: "manual",
    });
  });
  it.each([
    ["NATGAS.cash", 3, 2.9, 3.2, 3.002, 2.898, 3.202],
    ["COFFEE.c", 300, 295, 310, 300.02, 294.98, 310.02],
  ])(
    "uses quoted precision for signal-relative %s adjustments",
    (instrument, entry, stopLoss, takeProfit, adjustedEntry, adjustedSl, adjustedTp) => {
      const result = createAdjustedPosition(
        { ...trade, pair: instrument, entry, stopLoss, takeProfit },
        { enabled: true, mode: "signal-relative", strength: "normal", profile: "keep-risk", riskBuffer: 0.2 },
      );
      expect(result.original.entry).toBe(entry);
      expect(result.adjusted).toMatchObject({ entry: adjustedEntry, stopLoss: adjustedSl, takeProfit: adjustedTp });
      expect(result.active.actualRiskPercent).toBeLessThanOrEqual(1.2);
      expect(result.active.rr).toBeGreaterThanOrEqual(result.original.rr - 0.2);
    },
  );
  it("recognizes short commodity aliases only with symbol context", () => {
    expect(parseSignal("NG BUY\nENTRY 3\nSL 2.9\nTP 3.2").pair).toBe("NATGAS.cash");
    expect(parseSignal("SYMBOL: CL\nTYPE SELL\nENTRY 80\nSL 82\nTP 76").pair).toBe("USOIL.cash");
    expect(() => parseSignal("Here is NG in prose BUY\nENTRY 3\nSL 2.9\nTP 3.2")).toThrow();
  });
  it("preserves fixed adjustments and short keep-RR structure within guards", () => {
    const result = createAdjustedPosition(
      { ...trade, pair: "USOIL.cash", side: "sell", entry: 80, stopLoss: 82, takeProfit: 76 },
      { enabled: true, mode: "fixed", fixedPips: 0.1, profile: "keep-rr", riskBuffer: 0.2 },
    );
    expect(result.adjusted).toMatchObject({ entry: 79.9, stopLoss: 82.1, takeProfit: 75.5, lotSize: 0.45 });
    expect(result.active.actualRiskAmount).toBeCloseTo(99);
    expect(result.active.rr).toBeCloseTo(2);
  });
  it("falls back to the original when commodity minimum volume breaches adjustment risk guards", () => {
    const result = createAdjustedPosition(
      { ...trade, pair: "COCOA.c", entry: 8000, stopLoss: 7800, takeProfit: 8400 },
      true,
      1,
      0,
    );
    expect(result.adjusted).toBeNull();
    expect(result.active).toBe(result.original);
    expect(result.rejectionReason).toBe("risk");
  });
});
