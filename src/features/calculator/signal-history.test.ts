import { describe, expect, it } from "vitest";
import type { PositionResult } from "@/domain/fx/types";
import {
  createSignalHistoryEntry,
  formatTradeClipboardText,
  parseSignalHistory,
  serializeSignalHistory,
  upsertSignalHistoryEntry,
} from "./signal-history";

const originalResult: PositionResult = {
  pair: "EURUSD",
  side: "buy",
  orderType: "market",
  entry: 1.0845,
  stopLoss: 1.0805,
  takeProfit: 1.0925,
  priceText: {
    entry: "1.08450",
    stopLoss: "1.08050",
    takeProfit: "1.09250",
  },
  pipSize: 0.0001,
  stopPips: 40,
  rewardPips: 80,
  rr: 2,
  riskAmount: 10,
  rewardAmount: 24,
  pipValuePerLot: 10,
  pipValueMode: "exact",
  rawLotSize: 0.025,
  lotSize: 0.03,
  actualRiskAmount: 12,
  actualRiskPercent: 1.2,
  actualRiskExceedsTarget: true,
  accountCurrency: "USD",
};

const adjustedResult: PositionResult = {
  ...originalResult,
  entry: 1.0846,
  stopLoss: 1.0804,
  takeProfit: 1.0926,
  priceText: {
    entry: "1.08460",
    stopLoss: "1.08040",
    takeProfit: "1.09260",
  },
  stopPips: 42,
  rewardPips: 80,
  rr: 1.9,
};

describe("signal history", () => {
  it("creates an entry with original and adjusted values", () => {
    const entry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250",
      original: originalResult,
      adjusted: adjustedResult,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });

    expect(entry).toMatchObject({
      createdAt: "2026-06-11T10:00:00.000Z",
      updatedAt: "2026-06-11T10:00:00.000Z",
      rawSignal: "EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250",
      original: {
        pair: "EURUSD",
        side: "buy",
        entry: 1.0845,
        lotSize: 0.03,
      },
      adjusted: {
        pair: "EURUSD",
        side: "buy",
        entry: 1.0846,
        lotSize: 0.03,
      },
    });
    expect(entry.id).toContain("EURUSD");
  });

  it("updates an existing entry instead of creating a duplicate", () => {
    const first = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: originalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    const second = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: originalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:05:00.000Z"),
    });

    const history = upsertSignalHistoryEntry([first], second);

    expect(history).toHaveLength(1);
    expect(history[0].createdAt).toBe("2026-06-11T10:00:00.000Z");
    expect(history[0].updatedAt).toBe("2026-06-11T10:05:00.000Z");
  });

  it("updates an original-only entry with adjusted values instead of creating a duplicate", () => {
    const originalOnly = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: originalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    const withAdjustedValues = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: originalResult,
      adjusted: adjustedResult,
      now: new Date("2026-06-11T10:05:00.000Z"),
    });

    const history = upsertSignalHistoryEntry([originalOnly], withAdjustedValues);

    expect(history).toHaveLength(1);
    expect(history[0].createdAt).toBe("2026-06-11T10:00:00.000Z");
    expect(history[0].updatedAt).toBe("2026-06-11T10:05:00.000Z");
    expect(history[0].adjusted?.entry).toBe(1.0846);
  });

  it("round-trips valid history and ignores malformed storage", () => {
    const entry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: originalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });

    expect(parseSignalHistory(serializeSignalHistory([entry]))).toEqual([entry]);
    expect(parseSignalHistory("{bad json")).toEqual([]);
    expect(parseSignalHistory(JSON.stringify([{ id: "missing-values" }]))).toEqual([]);
  });

  it("keeps identical manual and imported trades distinct through persistence", () => {
    const manual = createSignalHistoryEntry({
      origin: "manual",
      rawSignal: "unrelated import",
      original: originalResult,
      adjusted: null,
    });
    const imported = createSignalHistoryEntry({
      origin: "imported",
      rawSignal: "original source",
      original: originalResult,
      adjusted: adjustedResult,
    });
    const history = upsertSignalHistoryEntry([manual], imported);
    expect(history).toHaveLength(2);
    expect(manual.rawSignal).toBe("");
    expect(manual.origin).toBe("manual");
    expect(imported.origin).toBe("imported");
    expect(parseSignalHistory(serializeSignalHistory(history))).toEqual(history);
  });

  it("retains adjusted values when the same original trade is copied again", () => {
    const adjusted = createSignalHistoryEntry({
      origin: "imported",
      rawSignal: "source",
      original: originalResult,
      adjusted: adjustedResult,
    });
    const originalOnly = createSignalHistoryEntry({
      origin: "imported",
      rawSignal: "source",
      original: originalResult,
      adjusted: null,
    });
    const history = upsertSignalHistoryEntry([adjusted], originalOnly);
    expect(history).toHaveLength(1);
    expect(history[0].adjusted).toEqual(adjustedResult);
  });

  it("normalizes unrecognized origin to legacy unknown without losing stored values", () => {
    const legacy = createSignalHistoryEntry({
      rawSignal: "legacy source",
      original: originalResult,
      adjusted: adjustedResult,
    });
    expect(parseSignalHistory(JSON.stringify([{ ...legacy, origin: "guessed" }]))).toEqual([legacy]);
  });

  it("preserves fine original and adjusted lots through legacy history and trade sharing", () => {
    const entry = createSignalHistoryEntry({
      rawSignal: "legacy fine lots",
      original: { ...originalResult, lotSize: 0.025 },
      adjusted: { ...adjustedResult, lotSize: 0.023 },
    });
    const [restored] = parseSignalHistory(serializeSignalHistory([entry]));
    expect(restored.original.lotSize).toBe(0.025);
    expect(restored.adjusted?.lotSize).toBe(0.023);
    expect(formatTradeClipboardText(restored.original)).toContain("Lot size: 0.025\n");
    expect(formatTradeClipboardText(restored.adjusted!)).toContain("Lot size: 0.023\n");
  });

  it("formats a complete trade for clipboard sharing", () => {
    expect(formatTradeClipboardText(originalResult)).toBe(
      [
        "EURUSD LONG",
        "Order: Market",
        "Entry: 1.08450",
        "Stop loss: 1.08050",
        "Take profit: 1.09250",
        "Lot size: 0.03",
        "RR: 2.00",
        "Target risk: 10.00 USD",
        "Actual risk: 12.00 USD (1.20%)",
        "Reward: 24.00 USD",
        "Pip/point: 10.00 exact",
      ].join("\n"),
    );
  });
});
