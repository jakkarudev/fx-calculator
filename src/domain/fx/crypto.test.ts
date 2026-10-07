import { describe, expect, it } from "vitest";
import { getInstrumentCatalog } from "./catalog";
import { getInstrumentSpec, normalizePair } from "./pairs";
import { calculatePosition } from "./calculate-position";
import { createAdjustedPosition } from "./adjust-signal";
import { parseSignal } from "./parse-signal";
import { getPipValueRateCandidates } from "./conversion-rules";
import snapshot from "./catalog-source/symbols-response.json";

const trade = {
  side: "buy" as const,
  orderType: "market" as const,
  accountBalance: 10000,
  riskPercent: 1,
  accountCurrency: "USD",
  requireReliablePipValue: true,
};

// Public-domain arithmetic fixtures: invented prices, not market quotes. Expected
// values calculated by hand: risk / (absolute stop distance * contract / FX rate),
// rounded down to .01 lots; actual risk and reward use the rounded lot quantity.
const fixtures = [
  { symbol: "BTCUSD", entry: 60000, stopLoss: 58800, takeProfit: 62400, contract: 1, lot: 0.08, risk: 96 },
  { symbol: "ETHUSD", entry: 3000, stopLoss: 2920, takeProfit: 3160, contract: 10, lot: 0.12, risk: 96 },
  { symbol: "DOGEUSD", entry: 0.15, stopLoss: 0.143, takeProfit: 0.164, contract: 100000, lot: 0.14, risk: 98 },
  { symbol: "GALUSD", entry: 0.025, stopLoss: 0.021, takeProfit: 0.033, contract: 1000000, lot: 0.02, risk: 80 },
];

describe("crypto CFD contracts", () => {
  it("activates every supported raw crypto contract with its precision and lot policy", () => {
    const rows = snapshot.data.symbols.filter(
      (r) => r.active && r.region === "global" && r.assetClass === "Crypto CFD",
    );
    const crypto = getInstrumentCatalog().filter((s) => s.kind === "crypto");
    expect(crypto).toHaveLength(rows.length);
    for (const row of rows)
      expect(getInstrumentSpec(row.code)).toMatchObject({
        contractSize: row.contractSize,
        priceDigits: row.digits,
        profitCurrency: row.profitCurrency,
        pipSize: row.pipConversion,
        defaultLotStep: 0.01,
        defaultMinLot: 0.01,
        lotRulesSource: "compatibility-default",
      });
    for (const row of rows) {
      const slash = `${row.code.slice(0, -3)}/USD.raw`;
      expect(normalizePair(slash)).toBe(row.code);
      expect(parseSignal(`${slash} SELL\nENTRY 10\nSL 11\nTP 8`).pair).toBe(row.code);
    }
  });
  it.each(fixtures)("sizes $symbol independently in USD and EUR", (fixture) => {
    const usd = calculatePosition({ ...trade, ...fixture, pair: fixture.symbol });
    expect(usd.lotSize).toBe(fixture.lot);
    expect(usd.actualRiskAmount).toBeCloseTo(fixture.risk, 8);
    expect(usd.rewardAmount).toBeCloseTo(fixture.risk * 2, 8);
    expect(usd.pipValuePerLot).toBe(fixture.contract);
    const eur = calculatePosition({
      ...trade,
      ...fixture,
      pair: fixture.symbol,
      accountCurrency: "EUR",
      eurUsdRate: 1.25,
    });
    const expected = { BTCUSD: [0.1, 96], ETHUSD: [0.15, 96], DOGEUSD: [0.17, 95.2], GALUSD: [0.03, 96] }[
      fixture.symbol
    ]!;
    expect(eur.lotSize).toBe(expected[0]);
    expect(eur.actualRiskAmount).toBeCloseTo(expected[1], 8);
    expect(eur.pipValueMode).toBe("converted");
  });
  it.each([
    ["BTC/USD.pro", "BTCUSD"],
    ["ETH/USD", "ETHUSD"],
    ["GALAUSD", "GALUSD"],
    ["AVAXUSD", "AVAUSD"],
  ])("resolves %s conservatively", (alias, symbol) => {
    expect(normalizePair(alias)).toBe(symbol);
    expect(parseSignal(`${alias} BUY\nENTRY 10.00\nSL 9.00\nTP 12.00`).pair).toBe(symbol);
    expect(normalizePair(`${alias}.FAKE`)).toBe("");
  });
  it("uses USD profit conversions without inventing a crypto base conversion", () => {
    expect(getPipValueRateCandidates("GALUSD", "EUR")).toEqual([]);
    expect(getPipValueRateCandidates("GALUSD", "JPY")).toEqual([
      { baseCurrency: "USD", quoteCurrency: "JPY", useAs: "quote" },
    ]);
    expect(() =>
      calculatePosition({ ...trade, ...fixtures[3], pair: fixtures[3].symbol, accountCurrency: "JPY" }),
    ).toThrow(/Reliable/);
    expect(
      calculatePosition({
        ...trade,
        ...fixtures[3],
        pair: fixtures[3].symbol,
        quoteToAccountRate: 0.8,
        accountCurrency: "EUR",
      }).lotSize,
    ).toBe(0.03);
  });
  it("reports minimum-lot excess risk instead of hiding it", () => {
    const result = calculatePosition({ ...trade, ...fixtures[3], pair: fixtures[3].symbol, accountBalance: 1000 });
    expect(result.lotSize).toBe(0.01);
    expect(result.actualRiskAmount).toBeCloseTo(40);
    expect(result.actualRiskExceedsTarget).toBe(true);
    expect(
      createAdjustedPosition({ ...trade, ...fixtures[3], pair: fixtures[3].symbol, accountBalance: 1000 }, true)
        .adjusted,
    ).toBeNull();
  });
  it.each(["fixed", "signal-relative"] as const)("shrinks invalid near-zero prices in %s mode", (mode) => {
    // Invented wide-stop prices: .01 lots * 100000 units * .1499 = $149.90.
    for (const side of ["buy", "sell"] as const) {
      const result = createAdjustedPosition(
        {
          ...trade,
          pair: "DOGEUSD",
          accountBalance: 20000,
          side,
          entry: 0.15,
          stopLoss: side === "buy" ? 0.0001 : 0.3,
          takeProfit: side === "buy" ? 0.45 : 0.0001,
        },
        { enabled: true, mode },
      );
      expect(result.changed).toBe(true);
      expect(result.active.entry).toBeGreaterThan(0);
      expect(result.active.stopLoss).toBeGreaterThan(0);
      expect(result.active.takeProfit).toBeGreaterThan(0);
      expect(Math.abs(result.active.entry - result.original.entry)).toBeLessThan(0.0001);
      expect(result.active.actualRiskPercent).toBeLessThanOrEqual(1.2);
      expect(result.active.rr).toBeGreaterThanOrEqual(result.original.rr - 0.2);
      if (side === "buy") {
        expect(result.original.actualRiskAmount).toBeCloseTo(149.9);
        expect(result.active.actualRiskAmount).toBeCloseTo(150.04);
      }
    }
  });

  it.each(["fixed", "signal-relative"] as const)("preserves the original when all %s candidates cross zero", (mode) => {
    const result = createAdjustedPosition(
      { ...trade, pair: "DOGEUSD", accountBalance: 20000, entry: 0.15, stopLoss: 0.000001, takeProfit: 0.45 },
      { enabled: true, mode },
    );
    expect(result.active).toBe(result.original);
    expect(result.adjusted).toBeNull();
    expect(result.rejectionReason).toBe("price-structure");
    expect(result.original.actualRiskAmount).toBeCloseTo(149.999);
  });

  it("keeps original validation and conversion failures visible with adjustment enabled", () => {
    expect(() =>
      createAdjustedPosition({ ...trade, ...fixtures[2], pair: fixtures[2].symbol, stopLoss: 0 }, true),
    ).toThrow(/positive/);
    expect(() =>
      createAdjustedPosition({ ...trade, ...fixtures[2], pair: fixtures[2].symbol, entry: Number.NaN }, true),
    ).toThrow(/positive/);
    expect(() =>
      createAdjustedPosition({ ...trade, ...fixtures[2], pair: fixtures[2].symbol, accountCurrency: "JPY" }, true),
    ).toThrow(/Reliable/);
  });

  it("retains valid short crypto structure and keeps RR within the guard", () => {
    const result = createAdjustedPosition(
      { ...trade, pair: "DOGEUSD", side: "sell", entry: 0.15, stopLoss: 0.157, takeProfit: 0.136 },
      { enabled: true, profile: "keep-rr", mode: "signal-relative" },
    );
    expect(result.changed).toBe(true);
    expect(result.active.takeProfit).toBeLessThan(result.active.entry);
    expect(result.active.entry).toBeLessThan(result.active.stopLoss);
    expect(result.active.rr).toBeCloseTo(result.original.rr, 2);
  });
  it("retains fixed movement units while honoring smaller configured amounts", () => {
    const result = createAdjustedPosition(
      { ...trade, ...fixtures[3], pair: fixtures[3].symbol },
      { enabled: true, mode: "fixed", fixedPips: 0.00001 },
    );
    expect(result.active.entry).toBe(0.02501);
    expect(result.active.stopLoss).toBe(0.02099);
    expect(result.active.takeProfit).toBe(0.03301);
  });
  it.each([
    ["subtle", 0.02501],
    ["normal", 0.02502],
    ["strong", 0.02505],
  ] as const)("uses the %s entry cap at source precision", (strength, entry) => {
    const result = createAdjustedPosition(
      { ...trade, ...fixtures[3], pair: fixtures[3].symbol },
      { enabled: true, mode: "signal-relative", strength },
    );
    expect(result.active.entry).toBe(entry);
    expect(result.active.actualRiskPercent).toBeLessThanOrEqual(1.2);
  });
  it.each(["fixed", "signal-relative"] as const)("keeps the original below price precision in %s mode", (mode) => {
    const result = createAdjustedPosition(
      { ...trade, pair: "GALUSD", entry: 0.005, stopLoss: 0.004, takeProfit: 0.007 },
      { enabled: true, mode },
    );
    expect(result.changed).toBe(false);
    expect(result.adjusted).toBeNull();
    expect(result.active).toBe(result.original);
    expect(result.rejectionReason).toBe("unchanged");
  });
  it.each(["fixed", "signal-relative"] as const)("applies safe %s defaults at high and low prices", (mode) => {
    for (const fixture of [fixtures[0], fixtures[3]]) {
      const result = createAdjustedPosition({ ...trade, ...fixture, pair: fixture.symbol }, { enabled: true, mode });
      expect(result.changed).toBe(true);
      expect(result.original.entry).toBe(fixture.entry);
      expect(result.adjusted!.entry).toBe(fixture.symbol === "BTCUSD" ? (mode === "fixed" ? 60001 : 60042) : 0.02502);
      expect(result.adjusted!.entry - fixture.entry).toBeLessThanOrEqual(fixture.entry * 0.001 + 1e-9);
      expect(result.adjusted!.entry).toBeLessThan(result.adjusted!.takeProfit);
      expect(result.adjusted!.stopLoss).toBeLessThan(result.adjusted!.entry);
      expect(result.adjusted!.rr).toBeGreaterThanOrEqual(result.original.rr - 0.2);
      expect(result.adjusted!.actualRiskPercent).toBeLessThanOrEqual(1.2);
    }
  });
});
