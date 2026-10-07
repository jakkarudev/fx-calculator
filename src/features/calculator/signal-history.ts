import type { PositionResult, SignalSide, OrderType } from "@/domain/fx/types";
import { formatLot, formatNumber, formatPrice } from "@/domain/fx/format";

export const signalHistoryPreferenceKey = "fxcalc.signalHistory.v1";
export const signalHistoryLimit = 50;
export const signalHistoryPageSize = 20;

export type TradeOrigin = "manual" | "imported";

export type SignalHistoryEntry = {
  origin?: TradeOrigin;
  id: string;
  createdAt: string;
  updatedAt: string;
  rawSignal: string;
  original: PositionResult;
  adjusted: PositionResult | null;
};

type CreateSignalHistoryEntryInput = {
  origin?: TradeOrigin;
  rawSignal: string;
  original: PositionResult;
  adjusted: PositionResult | null;
  now?: Date;
};

function stableNumber(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}

function resultKeyParts(result: PositionResult | null) {
  if (!result) return ["none"];

  return [
    result.pair,
    result.side,
    result.orderType,
    stableNumber(result.entry),
    stableNumber(result.stopLoss),
    stableNumber(result.takeProfit),
    stableNumber(result.lotSize),
  ];
}

function createSignalHistoryId(original: PositionResult, origin?: TradeOrigin) {
  return [origin ?? "unknown", ...resultKeyParts(original)].join("|");
}

function duplicateKey(entry: SignalHistoryEntry) {
  return createSignalHistoryId(entry.original, entry.origin);
}

export function createSignalHistoryEntry({
  origin,
  rawSignal,
  original,
  adjusted,
  now = new Date(),
}: CreateSignalHistoryEntryInput): SignalHistoryEntry {
  const timestamp = now.toISOString();

  return {
    id: createSignalHistoryId(original, origin),
    ...(origin ? { origin } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    rawSignal: origin === "manual" ? "" : rawSignal,
    original,
    adjusted,
  };
}

export function upsertSignalHistoryEntry(
  history: SignalHistoryEntry[],
  entry: SignalHistoryEntry,
): SignalHistoryEntry[] {
  const entryKey = duplicateKey(entry);
  const existing = history.find((item) => duplicateKey(item) === entryKey);
  const rest = history.filter((item) => duplicateKey(item) !== entryKey);

  if (existing) {
    return [
      {
        ...entry,
        adjusted: entry.adjusted ?? existing.adjusted,
        createdAt: existing.createdAt,
        updatedAt: entry.updatedAt,
      },
      ...rest,
    ].slice(0, signalHistoryLimit);
  }

  return [entry, ...history].slice(0, signalHistoryLimit);
}

function isSignalSide(value: unknown): value is SignalSide {
  return value === "buy" || value === "sell";
}

function isOrderType(value: unknown): value is OrderType {
  return value === "market" || value === "limit";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositionResult(value: unknown): value is PositionResult {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.pair === "string" &&
    isSignalSide(record.side) &&
    isOrderType(record.orderType) &&
    isFiniteNumber(record.entry) &&
    isFiniteNumber(record.stopLoss) &&
    isFiniteNumber(record.takeProfit) &&
    isFiniteNumber(record.pipSize) &&
    isFiniteNumber(record.stopPips) &&
    isFiniteNumber(record.rewardPips) &&
    isFiniteNumber(record.rr) &&
    isFiniteNumber(record.riskAmount) &&
    isFiniteNumber(record.pipValuePerLot) &&
    typeof record.pipValueMode === "string" &&
    isFiniteNumber(record.rawLotSize) &&
    isFiniteNumber(record.lotSize)
  );
}

function isSignalHistoryEntry(value: unknown): value is SignalHistoryEntry {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.rawSignal === "string" &&
    isPositionResult(record.original) &&
    (record.adjusted === null || isPositionResult(record.adjusted))
  );
}

export function parseSignalHistory(value: string | null): SignalHistoryEntry[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isSignalHistoryEntry)
      .slice(0, signalHistoryLimit)
      .map((entry) => {
        if (entry.origin === "manual" || entry.origin === "imported") return entry;
        const legacy = { ...entry };
        delete legacy.origin;
        return legacy;
      });
  } catch {
    return [];
  }
}

export function serializeSignalHistory(history: SignalHistoryEntry[]) {
  return JSON.stringify(history.slice(0, signalHistoryLimit));
}

export function tradeOriginLabel(entry: SignalHistoryEntry) {
  return entry.origin === "manual" ? "Manual" : entry.origin === "imported" ? "Imported" : "Earlier trade";
}

function directionLabel(result: PositionResult) {
  return result.side === "buy" ? "LONG" : "SHORT";
}

function orderTypeLabel(result: PositionResult) {
  return result.orderType === "limit" ? "Limit" : "Market";
}

export function formatTradeClipboardText(result: PositionResult) {
  const pipModeLabel =
    result.pipValueMode === "converted"
      ? " converted"
      : result.pipValueMode === "estimated"
        ? " estimated"
        : result.pipValueMode === "exact"
          ? " exact"
          : "";

  return [
    `${result.pair} ${directionLabel(result)}`,
    `Order: ${orderTypeLabel(result)}`,
    `Entry: ${formatPrice(result.entry, result.priceText?.entry)}`,
    `Stop loss: ${formatPrice(result.stopLoss, result.priceText?.stopLoss)}`,
    `Take profit: ${formatPrice(result.takeProfit, result.priceText?.takeProfit)}`,
    `Lot size: ${formatLot(result.lotSize)}`,
    `RR: ${formatNumber(result.rr, 2)}`,
    `Target risk: ${formatNumber(result.riskAmount, 2)} ${result.accountCurrency}`,
    `Actual risk: ${formatNumber(result.actualRiskAmount, 2)} ${result.accountCurrency} (${formatNumber(
      result.actualRiskPercent,
      2,
    )}%)`,
    `Reward: ${formatNumber(result.rewardAmount, 2)} ${result.accountCurrency}`,
    `Pip/point: ${formatNumber(result.pipValuePerLot, 2)}${pipModeLabel}`,
  ].join("\n");
}
