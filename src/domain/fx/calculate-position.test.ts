import { describe, expect, it } from "vitest";
import { calculatePosition } from "./calculate-position";

describe("calculatePosition", () => {
  it("calculates risk and lot size for a EURUSD buy trade", () => {
    const result = calculatePosition({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.riskAmount).toBeCloseTo(10);
    expect(result.rr).toBeCloseTo(2);
    expect(result.lotSize).toBeCloseTo(0.02, 2);
    expect(result.pipValueMode).toBe("exact");
  });

  it("reports actual risk after lot size rounding", () => {
    const result = calculatePosition({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.riskAmount).toBeCloseTo(10);
    expect(result.actualRiskAmount).toBeCloseTo(8);
    expect(result.actualRiskPercent).toBeCloseTo(0.8);
    expect(result.actualRiskExceedsTarget).toBe(false);
  });

  it("reports the actual reward amount for the rounded lot size", () => {
    const result = calculatePosition({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.rewardAmount).toBeCloseTo(16);
  });

  it("reports when minimum lot size exceeds the requested risk", () => {
    const result = calculatePosition({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.1,
      stopLoss: 1.09,
      takeProfit: 1.12,
      accountBalance: 100,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
      minLot: 0.1,
    });

    expect(result.riskAmount).toBeCloseTo(1);
    expect(result.actualRiskAmount).toBeCloseTo(100);
    expect(result.actualRiskPercent).toBeCloseTo(100);
    expect(result.actualRiskExceedsTarget).toBe(true);
  });

  it("rejects buy trades with invalid price structure", () => {
    expect(() =>
      calculatePosition({
        pair: "EURUSD",
        side: "buy",
        orderType: "market",
        entry: 1.0845,
        stopLoss: 1.09,
        takeProfit: 1.0925,
        accountBalance: 1000,
        riskPercent: 1,
        accountCurrency: "USD",
      }),
    ).toThrow("For buy trades, stop loss must be below entry and take profit must be above entry.");
  });

  it("rejects sell trades with invalid price structure", () => {
    expect(() =>
      calculatePosition({
        pair: "EURUSD",
        side: "sell",
        orderType: "market",
        entry: 1.0845,
        stopLoss: 1.09,
        takeProfit: 1.0925,
        accountBalance: 1000,
        riskPercent: 1,
        accountCurrency: "USD",
      }),
    ).toThrow("For sell trades, stop loss must be above entry and take profit must be below entry.");
  });

  it("can reject estimated pip values when reliable pip value is required", () => {
    expect(() =>
      calculatePosition({
        pair: "GBPJPY",
        side: "sell",
        orderType: "market",
        entry: 190,
        stopLoss: 191,
        takeProfit: 188,
        accountBalance: 1000,
        riskPercent: 1,
        accountCurrency: "USD",
        lotStep: 0.01,
        requireReliablePipValue: true,
      }),
    ).toThrow("Reliable pip value unavailable. Add a live conversion rate or manual pip value.");
  });

  it("allows estimated pip values when explicitly permitted", () => {
    const result = calculatePosition({
      pair: "GBPJPY",
      side: "sell",
      orderType: "market",
      entry: 190,
      stopLoss: 191,
      takeProfit: 188,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
      requireReliablePipValue: false,
    });

    expect(result.pipValueMode).toBe("estimated");
  });

  it("calculates EUR account pip value when EUR is the base currency", () => {
    const result = calculatePosition({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "EUR",
      lotStep: 0.01,
    });

    expect(result.pipValuePerLot).toBeCloseTo(9.2208, 4);
    expect(result.rawLotSize).toBeCloseTo(0.0271, 4);
    expect(result.pipValueMode).toBe("exact");
  });

  it("converts EUR base pip value into a USD account using the EURUSD rate", () => {
    const eurAccount = calculatePosition({
      pair: "EURJPY",
      side: "buy",
      orderType: "market",
      entry: 173,
      stopLoss: 172,
      takeProfit: 175,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "EUR",
      eurUsdRate: 1.1614,
      lotStep: 0.01,
    });
    const usdAccount = calculatePosition({
      pair: "EURJPY",
      side: "buy",
      orderType: "market",
      entry: 173,
      stopLoss: 172,
      takeProfit: 175,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      eurUsdRate: 1.1614,
      lotStep: 0.01,
    });

    expect(eurAccount.pipValuePerLot).toBeCloseTo(5.7803, 4);
    expect(usdAccount.pipValuePerLot).toBeCloseTo(6.7133, 4);
    expect(usdAccount.rawLotSize).toBeLessThan(eurAccount.rawLotSize);
    expect(usdAccount.pipValueMode).toBe("converted");
  });

  it("converts USD quote pip value into a EUR account using the EURUSD rate", () => {
    const result = calculatePosition({
      pair: "GBPUSD",
      side: "sell",
      orderType: "market",
      entry: 1.27,
      stopLoss: 1.274,
      takeProfit: 1.262,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "EUR",
      eurUsdRate: 1.1614,
      lotStep: 0.01,
    });

    expect(result.pipValuePerLot).toBeCloseTo(8.6103, 4);
    expect(result.rawLotSize).toBeCloseTo(0.029, 3);
    expect(result.pipValueMode).toBe("converted");
  });

  it("uses an estimated pip value for cross pairs instead of blocking account currency changes", () => {
    const result = calculatePosition({
      pair: "GBPJPY",
      side: "sell",
      orderType: "market",
      entry: 190,
      stopLoss: 191,
      takeProfit: 188,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.pipValuePerLot).toBe(10);
    expect(result.pipValueMode).toBe("estimated");
    expect(result.lotSize).toBeCloseTo(0.01, 2);
  });

  it("converts JPY quote pip value into a USD account using the live quote rate", () => {
    const result = calculatePosition({
      pair: "GBPJPY",
      side: "sell",
      orderType: "market",
      entry: 190,
      stopLoss: 191,
      takeProfit: 188,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      quoteToAccountRate: 0.0065,
      lotStep: 0.01,
    });

    expect(result.pipValuePerLot).toBeCloseTo(6.5, 4);
    expect(result.rawLotSize).toBeCloseTo(0.0154, 4);
    expect(result.pipValueMode).toBe("converted");
    expect(result.lotSize).toBeCloseTo(0.01, 2);
  });

  it("converts cross-pair pip value through the base currency when quote conversion is unavailable", () => {
    const result = calculatePosition({
      pair: "GBPBGN",
      side: "sell",
      orderType: "market",
      entry: 2.25,
      stopLoss: 2.255,
      takeProfit: 2.24,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      baseToAccountRate: 1.27,
      lotStep: 0.01,
      requireReliablePipValue: true,
    });

    expect(result.pipValuePerLot).toBeCloseTo(5.6444, 4);
    expect(result.pipValueMode).toBe("converted");
  });

  it("calculates US100 index lot size with a one-dollar point value", () => {
    const result = calculatePosition({
      pair: "US100",
      side: "buy",
      orderType: "market",
      entry: 19000,
      stopLoss: 18950,
      takeProfit: 19100,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.pipSize).toBe(1);
    expect(result.stopPips).toBe(50);
    expect(result.pipValuePerLot).toBe(1);
    expect(result.rawLotSize).toBeCloseTo(0.2, 4);
    expect(result.lotSize).toBeCloseTo(0.2, 2);
    expect(result.pipValueMode).toBe("exact");
  });

  it("calculates XAUUSD lot size with a 100 ounce contract and 0.01 tick", () => {
    const result = calculatePosition({
      pair: "GOLD",
      side: "buy",
      orderType: "market",
      entry: 2020.5,
      stopLoss: 2019.5,
      takeProfit: 2022.5,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.pair).toBe("XAUUSD");
    expect(result.pipSize).toBe(0.01);
    expect(result.stopPips).toBe(100);
    expect(result.pipValuePerLot).toBe(1);
    expect(result.rawLotSize).toBeCloseTo(0.1, 4);
    expect(result.lotSize).toBeCloseTo(0.1, 2);
  });

  it("calculates XAGUSD lot size with a 5000 ounce contract and 0.01 pip", () => {
    const result = calculatePosition({
      pair: "SILVER",
      side: "sell",
      orderType: "market",
      entry: 30.25,
      stopLoss: 30.35,
      takeProfit: 30.05,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.pair).toBe("XAGUSD");
    expect(result.pipSize).toBe(0.01);
    expect(result.stopPips).toBeCloseTo(10, 4);
    expect(result.pipValuePerLot).toBe(50);
    expect(result.rawLotSize).toBeCloseTo(0.02, 4);
    expect(result.lotSize).toBeCloseTo(0.02, 2);
  });

  it("keeps dynamic forex support for uncommon ISO currency pairs", () => {
    const result = calculatePosition({
      pair: "USDTRY",
      side: "sell",
      orderType: "market",
      entry: 32,
      stopLoss: 32.1,
      takeProfit: 31.8,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.pair).toBe("USDTRY");
    expect(result.pipSize).toBe(0.0001);
    expect(result.pipValuePerLot).toBeCloseTo(0.3125, 4);
    expect(result.pipValueMode).toBe("exact");
  });

  it("converts USD-quoted CFD pip value into a EUR account", () => {
    const result = calculatePosition({
      pair: "US30",
      side: "sell",
      orderType: "market",
      entry: 39000,
      stopLoss: 39050,
      takeProfit: 38900,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "EUR",
      quoteToAccountRate: 0.86,
      lotStep: 0.01,
    });

    expect(result.pipValuePerLot).toBeCloseTo(0.86, 4);
    expect(result.rawLotSize).toBeCloseTo(0.2326, 4);
    expect(result.pipValueMode).toBe("converted");
  });

  it.each([
    {
      label: "gold XAUUSD",
      pair: "XAUUSD",
      side: "buy" as const,
      entry: 2020.5,
      stopLoss: 2019.5,
      takeProfit: 2022.5,
      pipSize: 0.01,
      stopPips: 100,
      pipValuePerLot: 1,
      rawLotSize: 0.1,
      lotSize: 0.1,
    },
    {
      label: "silver XAGUSD",
      pair: "XAGUSD",
      side: "sell" as const,
      entry: 30.25,
      stopLoss: 30.35,
      takeProfit: 30.05,
      pipSize: 0.01,
      stopPips: 10,
      pipValuePerLot: 50,
      rawLotSize: 0.02,
      lotSize: 0.02,
    },
    {
      label: "US30",
      pair: "US30",
      side: "buy" as const,
      entry: 39000,
      stopLoss: 38950,
      takeProfit: 39100,
      pipSize: 1,
      stopPips: 50,
      pipValuePerLot: 1,
      rawLotSize: 0.2,
      lotSize: 0.2,
    },
    {
      label: "US100",
      pair: "US100",
      side: "buy" as const,
      entry: 19000,
      stopLoss: 18950,
      takeProfit: 19100,
      pipSize: 1,
      stopPips: 50,
      pipValuePerLot: 1,
      rawLotSize: 0.2,
      lotSize: 0.2,
    },
  ])("matches the manual lot-size formula for $label", (example) => {
    const result = calculatePosition({
      pair: example.pair,
      side: example.side,
      orderType: "market",
      entry: example.entry,
      stopLoss: example.stopLoss,
      takeProfit: example.takeProfit,
      accountBalance: 1000,
      riskPercent: 1,
      accountCurrency: "USD",
      lotStep: 0.01,
    });

    expect(result.riskAmount).toBe(10);
    expect(result.pipSize).toBe(example.pipSize);
    expect(result.stopPips).toBeCloseTo(example.stopPips, 4);
    expect(result.pipValuePerLot).toBeCloseTo(example.pipValuePerLot, 4);
    expect(result.rawLotSize).toBeCloseTo(example.rawLotSize, 4);
    expect(result.lotSize).toBeCloseTo(example.lotSize, 2);
    expect(result.pipValueMode).toBe("exact");
  });

  it.each([
    ["XAUUSD", "buy", 2020, 2019, 2022, "USD", undefined],
    ["XAUUSD", "buy", 2020, 2019, 2022, "EUR", undefined],
    ["XAGUSD", "sell", 30.25, 30.35, 30.05, "EUR", undefined],
    ["US100", "buy", 19000, 18950, 19100, "USD", undefined],
    ["US100", "buy", 19000, 18950, 19100, "EUR", undefined],
    ["US30", "sell", 50700, 51200, 49650, "EUR", undefined],
    ["EURUSD", "buy", 1.0845, 1.0805, 1.0925, "USD", undefined],
    ["EURUSD", "buy", 1.0845, 1.0805, 1.0925, "EUR", undefined],
    ["GBPUSD", "sell", 1.27, 1.274, 1.262, "EUR", undefined],
    ["USDJPY", "buy", 156, 155, 158, "USD", undefined],
    ["USDJPY", "buy", 156, 155, 158, "EUR", undefined],
    ["EURJPY", "buy", 173, 172, 175, "USD", undefined],
    ["EURJPY", "buy", 173, 172, 175, "EUR", undefined],
    ["CHFJPY", "buy", 201.438, 200.746, 202.944, "USD", 0.00624],
    ["GBPJPY", "sell", 190, 191, 188, "EUR", 0.00538],
    ["AUDNZD", "buy", 1.082, 1.079, 1.088, "USD", 0.61],
    ["CADCHF", "sell", 0.65, 0.654, 0.642, "EUR", 1.08],
  ] as const)(
    "does not estimate pip value for supported reliable setup %s in %s",
    (pair, side, entry, stopLoss, takeProfit, accountCurrency, quoteToAccountRate) => {
      const result = calculatePosition({
        pair,
        side,
        orderType: "market",
        entry,
        stopLoss,
        takeProfit,
        accountBalance: 1000,
        riskPercent: 1,
        accountCurrency,
        eurUsdRate: 1.16,
        quoteToAccountRate,
        lotStep: pair.startsWith("US") ? 0.1 : 0.01,
        minLot: pair.startsWith("US") ? 0.1 : 0.01,
        requireReliablePipValue: true,
      });

      expect(result.pipValueMode).not.toBe("estimated");
    },
  );
});
