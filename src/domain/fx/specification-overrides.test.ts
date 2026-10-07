import { describe, expect, it } from "vitest";
import { calculatePosition } from "./calculate-position";
import { createAdjustedPosition } from "./adjust-signal";
import { getPipValueRateCandidates } from "./conversion-rules";
import { sanitizeInstrumentLotOverrides } from "./instrument-rules";
import type { PositionInput } from "./types";

const trade: PositionInput = {
  pair: "EURUSD",
  side: "buy",
  orderType: "market",
  entry: 1.1,
  stopLoss: 1.09,
  takeProfit: 1.12,
  accountBalance: 10000,
  riskPercent: 1,
  accountCurrency: "USD",
};
describe("instrument specification overrides", () => {
  it.each([
    ["WTI", "USOIL.cash", 80, 78, 84],
    ["BTC/USD", "BTCUSD", 60000, 58800, 62400],
    ["brk.b.pro", "BRK.B", 200, 195, 210],
  ])(
    "uses effective specifications and conversion routes for activated %s",
    (instrument, symbol, entry, stopLoss, takeProfit) => {
      const input = {
        ...trade,
        pair: instrument,
        entry,
        stopLoss,
        takeProfit,
        instrumentOverrides: { [symbol]: { contractSize: 20, movementUnit: 0.1, lotStep: 0.001, minLot: 0.001 } },
      };
      const stopUnits = (entry - stopLoss) / 0.1;
      const result = calculatePosition(input);
      expect(result.pair).toBe(symbol);
      expect(result.stopPips).toBeCloseTo(stopUnits);
      expect(result.pipValuePerLot).toBe(2);
      expect(result.rawLotSize).toBeCloseTo(100 / (stopUnits * 2));
      const converted = calculatePosition({ ...input, accountCurrency: "CAD", quoteToAccountRate: 1.4 });
      expect(converted.pipValuePerLot).toBeCloseTo(2.8);
      expect(getPipValueRateCandidates(instrument, "CAD", false, input.instrumentOverrides)).toEqual([
        { baseCurrency: "USD", quoteCurrency: "CAD", useAs: "quote" },
      ]);
      expect(() => calculatePosition({ ...input, accountCurrency: "CAD", requireReliablePipValue: true })).toThrow(
        /Reliable pip value/,
      );
      const manualOverrides = { [symbol]: { ...input.instrumentOverrides[symbol], manualPipValuePerLot: 4 } };
      const manual = calculatePosition({
        ...input,
        accountCurrency: "CAD",
        instrumentOverrides: manualOverrides,
        requireReliablePipValue: true,
      });
      expect(manual.pipValuePerLot).toBe(4);
      expect(manual.rawLotSize).toBeCloseTo(100 / (stopUnits * 4));
      expect(getPipValueRateCandidates(instrument, "CAD", false, manualOverrides)).toEqual([]);
    },
  );
  it("keeps commodity signal-relative caps in displayed price increments with movement overrides", () => {
    const result = createAdjustedPosition(
      {
        ...trade,
        pair: "WTI",
        entry: 80,
        stopLoss: 78,
        takeProfit: 84,
        instrumentOverrides: { "USOIL.cash": { movementUnit: 0.1 } },
      },
      { enabled: true, mode: "signal-relative", profile: "shift", strength: "normal" },
    );
    expect(result.adjusted?.entry).toBeCloseTo(80.002, 6);
    expect(result.adjusted?.stopLoss).toBeCloseTo(78.002, 6);
  });
  it.each([
    ["BTCUSD", 60000, 58800, 62400, 42],
    ["BRK.B", 200, 195, 210, 0.1],
  ])(
    "retains category adjustment price caps with effective movement for %s",
    (instrument, entry, stopLoss, takeProfit, distance) => {
      const result = createAdjustedPosition(
        {
          ...trade,
          pair: instrument,
          entry,
          stopLoss,
          takeProfit,
          instrumentOverrides: { [instrument]: { movementUnit: 0.1 } },
        },
        { enabled: true, mode: "signal-relative", profile: "shift", strength: "normal" },
      );
      expect(result.adjusted?.entry).toBeCloseTo(entry + distance, 6);
      expect(result.adjusted?.stopLoss).toBeCloseTo(stopLoss + distance, 6);
    },
  );
  it("sizes using contract and movement overrides and applies authoritative instrument manual valuation", () => {
    const result = calculatePosition({
      ...trade,
      instrumentOverrides: { EURUSD: { contractSize: 10000, movementUnit: 0.001, manualPipValuePerLot: 20 } },
    });
    expect(result.stopPips).toBeCloseTo(10);
    expect(result.pipValuePerLot).toBe(20);
    expect(result.pipValueMode).toBe("manual");
    expect(result.lotSize).toBe(0.5);
    const contractOnly = calculatePosition({
      ...trade,
      instrumentOverrides: { EURUSD: { contractSize: 10000, movementUnit: 0.001 } },
    });
    expect(contractOnly.pipValuePerLot).toBe(10);
    expect(contractOnly.lotSize).toBe(1);
  });
  it("uses the effective movement unit in adjustment distance and precision", () => {
    const result = createAdjustedPosition(
      { ...trade, instrumentOverrides: { EURUSD: { movementUnit: 0.001 } } },
      { enabled: true, fixedPips: 1, profile: "shift" },
    );
    expect(result.adjusted?.entry).toBeCloseTo(1.101, 6);
    expect(result.adjusted?.stopPips).toBeCloseTo(10);
  });
  it("skips conversion for instrument manual valuation and otherwise retains reliable conversion routes", () => {
    expect(getPipValueRateCandidates("AUDCAD", "USD", false, { AUDCAD: { manualPipValuePerLot: 2 } })).toEqual([]);
    expect(getPipValueRateCandidates("AUDCAD", "USD", false, { AUDCAD: { contractSize: 10000 } })).not.toEqual([]);
    expect(() =>
      calculatePosition({
        ...trade,
        pair: "AUDCAD",
        requireReliablePipValue: true,
        instrumentOverrides: { AUDCAD: { contractSize: 10000 } },
      }),
    ).toThrow(/Reliable pip value/);
  });
  it("merges legacy lot-only aliases with new fields while rejecting invalid values", () => {
    expect(
      sanitizeInstrumentLotOverrides({
        GOLD: { lotStep: "0.1", minLot: 0.2 },
        XAUUSD: { contractSize: 10, movementUnit: 0.1, manualPipValuePerLot: 3 },
        EURUSD: { movementUnit: 0, contractSize: Infinity, manualPipValuePerLot: -2 },
      }),
    ).toEqual({ XAUUSD: { lotStep: 0.1, minLot: 0.2, contractSize: 10, movementUnit: 0.1, manualPipValuePerLot: 3 } });
  });
  it("uses effective contract specifications through quote, base, and built-in EUR/USD conversion", () => {
    const input = {
      ...trade,
      pair: "AUDCAD",
      entry: 1,
      stopLoss: 0.99,
      takeProfit: 1.02,
      instrumentOverrides: { AUDCAD: { contractSize: 10000, movementUnit: 0.001 } },
    };
    expect(calculatePosition({ ...input, quoteToAccountRate: 0.75 }).pipValuePerLot).toBe(7.5);
    expect(calculatePosition({ ...input, baseToAccountRate: 0.65 }).pipValuePerLot).toBe(6.5);
    expect(calculatePosition({ ...input, accountCurrency: "AUD" }).pipValuePerLot).toBe(10);
    expect(calculatePosition({ ...input, accountCurrency: "CAD" }).pipValuePerLot).toBe(10);
    expect(
      calculatePosition({
        ...trade,
        accountCurrency: "EUR",
        instrumentOverrides: { EURUSD: { contractSize: 10000, movementUnit: 0.001 } },
      }).pipValuePerLot,
    ).toBeCloseTo(10 / 1.1);
    const metal = calculatePosition({
      ...trade,
      pair: "GOLD",
      entry: 2000,
      stopLoss: 1990,
      takeProfit: 2020,
      accountCurrency: "EUR",
      eurUsdRate: 1.2,
      instrumentOverrides: { XAUUSD: { contractSize: 10, movementUnit: 0.1 } },
    });
    expect(metal.pipValuePerLot).toBeCloseTo(1 / 1.2);
    expect(metal.stopPips).toBe(100);
  });
  it("applies canonical lot specifications and fine index adjustment precision", () => {
    const input: PositionInput = {
      ...trade,
      pair: "NAS100",
      entry: 20000,
      stopLoss: 19900,
      takeProfit: 20200,
      instrumentOverrides: { US100: { lotStep: 0.5, minLot: 2, contractSize: 10, movementUnit: 0.01 } },
    };
    const result = createAdjustedPosition(input, { enabled: true, fixedPips: 1, profile: "shift", riskBuffer: 25 });
    expect(result.original.lotSize).toBe(2);
    expect(result.original.actualRiskExceedsTarget).toBe(true);
    expect(result.adjusted?.entry).toBeCloseTo(20000.01, 6);
    expect(result.adjusted?.priceText?.entry).toBe("20000.01");
  });
  it("rejects coercible nonnumeric persisted specifications", () => {
    expect(
      sanitizeInstrumentLotOverrides({ EURUSD: { contractSize: true, movementUnit: [1], manualPipValuePerLot: {} } }),
    ).toEqual({});
  });
  it("preserves scientific-notation movement and lot increments", () => {
    const adjusted = createAdjustedPosition(
      { ...trade, instrumentOverrides: { EURUSD: { movementUnit: 1e-7 } } },
      { enabled: true, fixedPips: 1, profile: "shift" },
    );
    expect(adjusted.adjusted?.entry).toBeCloseTo(1.1000001, 9);
    expect(adjusted.adjusted?.priceText?.entry).toBe("1.1000001");
    const small = calculatePosition({
      ...trade,
      pair: "US100",
      entry: 100,
      stopLoss: 99,
      takeProfit: 102,
      accountBalance: 1,
      riskPercent: 0.000025,
      instrumentOverrides: { US100: { lotStep: 1e-7, minLot: 1e-7, manualPipValuePerLot: 1 } },
    });
    expect(small.lotSize).toBe(2e-7);
  });
  it("keeps global manual pip value compatibility when exact valuation exists", () => {
    expect(calculatePosition({ ...trade, manualPipValuePerLot: 25 }).pipValuePerLot).toBe(10);
    expect(calculatePosition({ ...trade, pair: "AUDCAD", manualPipValuePerLot: 25 }).pipValuePerLot).toBe(25);
  });
});
