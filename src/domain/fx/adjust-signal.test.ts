import { describe, expect, it } from "vitest";
import { createAdjustedPosition } from "./adjust-signal";
import { parseSignal } from "./parse-signal";
import { formatPrice } from "./format";
import type { PositionInput } from "./types";

const baseInput: PositionInput = {
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
};

describe("createAdjustedPosition", () => {
  it.each(["EURUSD", "XAUUSD", "US100", "USOIL.cash", "AAPL"])(
    "retains valid %s originals when every candidate has invalid prices",
    (instrument) => {
      const result = createAdjustedPosition(
        { ...baseInput, pair: instrument, entry: 0.15, stopLoss: 0.00001, takeProfit: 0.45, accountBalance: 20000 },
        { enabled: true, fixedPips: 1e8 },
      );
      expect(result.active).toBe(result.original);
      expect(result.adjusted).toBeNull();
      expect(result.rejectionReason).toBe("price-structure");
    },
  );

  it.each(["USOIL.cash", "AAPL"])(
    "retains the original %s when precision-capped signal-relative candidates cross zero",
    (instrument) => {
      const result = createAdjustedPosition(
        { ...baseInput, pair: instrument, entry: 0.15, stopLoss: 0.00001, takeProfit: 0.45, accountBalance: 20000 },
        { enabled: true, mode: "signal-relative" },
      );
      expect(result.active).toBe(result.original);
      expect(result.adjusted).toBeNull();
      expect(result.rejectionReason).toBe("price-structure");
    },
  );

  it("represents adjusted fractional prices without losing original import precision", () => {
    const signal = parseSignal("GER40.cash BUY\nENTRY 20000\nSL 19950\nTP 20100");
    const result = createAdjustedPosition(
      {
        ...signal,
        accountCurrency: "EUR",
        accountBalance: 10000,
        riskPercent: 1,
        requireReliablePipValue: true,
      },
      true,
      0.1,
    );
    expect(result.changed).toBe(true);
    expect(result.original.priceText).toEqual({ entry: "20000", stopLoss: "19950", takeProfit: "20100" });
    expect(result.active.priceText).toEqual({ entry: "20000.1", stopLoss: "19949.9", takeProfit: "20100.1" });
    expect(formatPrice(result.active.entry, result.active.priceText?.entry)).toBe("20000.1");
    expect(result.active.lotSize).toBe(1.9);
  });

  it("changes entry, stop loss, and take profit by one pip when safe", () => {
    const result = createAdjustedPosition(baseInput, true);
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(result.active).toBe(result.adjusted);
    expect(result.original.entry).toBe(1.0845);
    expect(adjusted.entry).toBeCloseTo(1.0846, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0804, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.0926, 5);
    expect(adjusted.rr).toBeGreaterThanOrEqual(result.original.rr - 0.2);
    expect(result.adjustedActualRiskPercent).toBeLessThanOrEqual(1.2);
  });

  it("changes entry, stop loss, and take profit by the configured pip distance", () => {
    const result = createAdjustedPosition(baseInput, true, 2);
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.0847, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0803, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.0927, 5);
  });

  it("moves sell trades in the sell-side direction", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        side: "sell",
        entry: 1.0845,
        stopLoss: 1.0885,
        takeProfit: 1.0765,
      },
      true,
    );
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.0844, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0886, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.0764, 5);
    expect(adjusted.takeProfit).toBeLessThan(adjusted.entry);
    expect(adjusted.entry).toBeLessThan(adjusted.stopLoss);
  });

  it("always lowers adjusted stop loss for long trades", () => {
    const result = createAdjustedPosition(baseInput, true);
    const adjusted = result.adjusted;

    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.stopLoss).toBeLessThan(result.original.stopLoss);
    expect(adjusted.stopLoss).toBeLessThan(adjusted.entry);
  });

  it("always raises adjusted stop loss for short trades", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        side: "sell",
        entry: 1.0845,
        stopLoss: 1.0885,
        takeProfit: 1.0765,
      },
      true,
    );
    const adjusted = result.adjusted;

    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.stopLoss).toBeGreaterThan(result.original.stopLoss);
    expect(adjusted.stopLoss).toBeGreaterThan(adjusted.entry);
  });

  it("returns original values when the feature is disabled", () => {
    const result = createAdjustedPosition(baseInput, false);

    expect(result.changed).toBe(false);
    expect(result.active).toBe(result.original);
    expect(result.adjusted).toBeNull();
  });

  it("does not adjust when RR would be reduced by more than 0.2", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        entry: 1.0845,
        stopLoss: 1.0843,
        takeProfit: 1.0851,
      },
      true,
    );

    expect(result.changed).toBe(false);
    expect(result.adjusted).toBeNull();
    expect(result.active).toBe(result.original);
  });

  it("does not adjust when the rounded lot would risk more than 1.2 percent", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        accountBalance: 100,
        minLot: 0.1,
        entry: 1.1,
        stopLoss: 1.09,
        takeProfit: 1.2,
      },
      true,
    );

    expect(result.changed).toBe(false);
    expect(result.adjusted).toBeNull();
    expect(result.originalActualRiskPercent).toBeGreaterThan(1.2);
  });

  it("keeps entry, stop loss, and take profit distinct for tight prices", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        entry: 1.0845,
        stopLoss: 1.0844,
        takeProfit: 1.0846,
      },
      true,
    );

    expect(result.changed).toBe(true);
    expect(result.adjusted).not.toBeNull();
    if (!result.adjusted) throw new Error("Expected adjusted values.");
    expect(result.adjusted.entry).not.toBe(result.adjusted.stopLoss);
    expect(result.adjusted.entry).not.toBe(result.adjusted.takeProfit);
    expect(result.adjusted.stopLoss).not.toBe(result.adjusted.takeProfit);
    expect(result.adjusted.stopLoss).toBeLessThan(result.adjusted.entry);
    expect(result.adjusted.entry).toBeLessThan(result.adjusted.takeProfit);
  });

  it("allows adjusted risk up to the configured risk plus 0.2 percent", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        riskPercent: 2,
      },
      true,
    );

    expect(result.changed).toBe(true);
    expect(result.adjusted).not.toBeNull();
    expect(result.rejectionReason).toBeNull();
    expect(result.adjustedActualRiskPercent).toBeLessThanOrEqual(2.2);
  });

  it("shrinks the requested adjustment to the largest valid changed candidate", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        entry: 1.0845,
        stopLoss: 1.0842,
        takeProfit: 1.0854,
      },
      true,
      1,
    );

    expect(result.changed).toBe(true);
    expect(result.adjusted).not.toBeNull();
    if (!result.adjusted) throw new Error("Expected adjusted values.");
    expect(result.rejectionReason).toBeNull();
    expect(result.adjusted.entry).toBeCloseTo(1.08451, 5);
    expect(result.adjusted.stopLoss).toBeCloseTo(1.08419, 5);
    expect(result.adjusted.takeProfit).toBeCloseTo(1.08541, 5);
    expect(result.adjusted.rr).toBeGreaterThanOrEqual(result.original.rr - 0.2);
  });

  it("reports unchanged when all candidates round back to the original prices", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        pair: "US100",
        entry: 19000,
        stopLoss: 18950,
        takeProfit: 19100,
      },
      true,
      0.1,
    );

    expect(result.changed).toBe(false);
    expect(result.adjusted).toBeNull();
    expect(result.rejectionReason).toBe("unchanged");
    expect(result.active).toBe(result.original);
  });

  it("reports risk when every changed candidate exceeds adaptive risk tolerance", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        accountBalance: 100,
        minLot: 0.1,
        entry: 1.1,
        stopLoss: 1.09,
        takeProfit: 1.2,
      },
      true,
    );

    expect(result.changed).toBe(false);
    expect(result.adjusted).toBeNull();
    expect(result.rejectionReason).toBe("risk");
  });

  it("uses the configured risk buffer when deciding whether adjustment is safe", () => {
    const input = {
      ...baseInput,
      minLot: 0.03,
    };

    const defaultBufferResult = createAdjustedPosition(input, true);
    const widerBufferResult = createAdjustedPosition(input, true, 1, 0.3);

    expect(defaultBufferResult.changed).toBe(false);
    expect(defaultBufferResult.rejectionReason).toBe("risk");
    expect(widerBufferResult.changed).toBe(true);
    expect(widerBufferResult.adjusted).not.toBeNull();
    expect(widerBufferResult.rejectionReason).toBeNull();
    expect(widerBufferResult.adjustedActualRiskPercent).toBeLessThanOrEqual(1.3);
  });

  it("allows risk below the target when the buffer mode is plus only", () => {
    const result = createAdjustedPosition(baseInput, true, 1, 0.2, "plus");

    expect(result.changed).toBe(true);
    expect(result.adjusted).not.toBeNull();
    expect(result.rejectionReason).toBeNull();
    expect(result.adjustedActualRiskPercent).toBeLessThan(1);
  });

  it("rejects risk below the lower buffer when the buffer mode is both ways", () => {
    const result = createAdjustedPosition(baseInput, true, 1, 0.1, "both");

    expect(result.changed).toBe(false);
    expect(result.adjusted).toBeNull();
    expect(result.rejectionReason).toBe("risk");
  });

  it("allows risk below target but rejects risk above target when the buffer mode is minus only", () => {
    const belowTarget = createAdjustedPosition(baseInput, true, 1, 0.2, "minus");
    const aboveTarget = createAdjustedPosition(
      {
        ...baseInput,
        minLot: 0.03,
      },
      true,
      1,
      0.2,
      "minus",
    );

    expect(belowTarget.changed).toBe(true);
    expect(belowTarget.rejectionReason).toBeNull();
    expect(belowTarget.adjustedActualRiskPercent).toBeGreaterThanOrEqual(0.8);
    expect(belowTarget.adjustedActualRiskPercent).toBeLessThanOrEqual(1);
    expect(aboveTarget.changed).toBe(false);
    expect(aboveTarget.rejectionReason).toBe("risk");
  });

  it("preserves old fixed-pip behavior with the keep-risk profile", () => {
    const result = createAdjustedPosition(baseInput, {
      enabled: true,
      mode: "fixed",
      fixedPips: 2,
      strength: "normal",
      profile: "keep-risk",
      riskBuffer: 0.2,
      riskBufferMode: "plus",
    });
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.0847, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0803, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.0927, 5);
    expect(adjusted.rr).toBeCloseTo(80 / 44, 5);
  });

  it("shifts all prices together when the profile is shift", () => {
    const result = createAdjustedPosition(baseInput, {
      enabled: true,
      mode: "fixed",
      fixedPips: 2,
      strength: "normal",
      profile: "shift",
      riskBuffer: 0.2,
      riskBufferMode: "plus",
    });
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.0847, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0807, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.0927, 5);
    expect(adjusted.stopPips).toBeCloseTo(result.original.stopPips, 5);
    expect(adjusted.rewardPips).toBeCloseTo(result.original.rewardPips, 5);
    expect(adjusted.rr).toBeCloseTo(result.original.rr, 5);
  });

  it("recalculates take profit to preserve RR when the profile is keep-rr", () => {
    const result = createAdjustedPosition(baseInput, {
      enabled: true,
      mode: "fixed",
      fixedPips: 2,
      strength: "normal",
      profile: "keep-rr",
      riskBuffer: 0.2,
      riskBufferMode: "plus",
    });
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.0847, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0803, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.0935, 5);
    expect(adjusted.stopPips).toBeCloseTo(44, 5);
    expect(adjusted.rewardPips).toBeCloseTo(88, 5);
    expect(adjusted.rr).toBeCloseTo(result.original.rr, 5);
  });

  it("uses normal signal-relative strength as 3.5 percent of stop distance with shift profile", () => {
    const result = createAdjustedPosition(baseInput, {
      enabled: true,
      mode: "signal-relative",
      fixedPips: 1,
      strength: "normal",
      profile: "shift",
      riskBuffer: 0.2,
      riskBufferMode: "plus",
    });
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(result.rejectionReason).toBeNull();
    expect(adjusted.entry).toBeCloseTo(1.08464, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.08064, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.09264, 5);
    expect(adjusted.rr).toBeCloseTo(result.original.rr, 5);
  });

  it("caps strong signal-relative forex movement for wide stops", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        entry: 1.1,
        stopLoss: 1.09,
        takeProfit: 1.12,
      },
      {
        enabled: true,
        mode: "signal-relative",
        fixedPips: 1,
        strength: "strong",
        profile: "shift",
        riskBuffer: 0.2,
        riskBufferMode: "plus",
      },
    );
    const adjusted = result.adjusted;

    expect(result.original.stopPips).toBeCloseTo(100, 5);
    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.1003, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.0903, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.1203, 5);
  });

  it("uses index point caps and price rounding in signal-relative mode", () => {
    const result = createAdjustedPosition(
      {
        ...baseInput,
        pair: "US100",
        entry: 19000,
        stopLoss: 18950,
        takeProfit: 19100,
        minLot: 0.1,
        lotStep: 0.1,
      },
      {
        enabled: true,
        mode: "signal-relative",
        fixedPips: 1,
        strength: "normal",
        profile: "shift",
        riskBuffer: 0.2,
        riskBufferMode: "plus",
      },
    );
    const adjusted = result.adjusted;

    expect(result.original.stopPips).toBe(50);
    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBe(19002);
    expect(adjusted.stopLoss).toBe(18952);
    expect(adjusted.takeProfit).toBe(19102);
  });

  it("falls back to normal strength and keep-risk profile when option values are invalid", () => {
    const result = createAdjustedPosition(baseInput, {
      enabled: true,
      mode: "signal-relative",
      fixedPips: 1,
      strength: "invalid" as never,
      profile: "invalid" as never,
      riskBuffer: 0.2,
      riskBufferMode: "plus",
    });
    const adjusted = result.adjusted;

    expect(result.changed).toBe(true);
    expect(adjusted).not.toBeNull();
    if (!adjusted) throw new Error("Expected adjusted values.");
    expect(adjusted.entry).toBeCloseTo(1.08464, 5);
    expect(adjusted.stopLoss).toBeCloseTo(1.08036, 5);
    expect(adjusted.takeProfit).toBeCloseTo(1.09264, 5);
  });
});
