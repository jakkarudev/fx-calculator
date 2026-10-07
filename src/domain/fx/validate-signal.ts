import type { ParsedSignal } from "./types";

export type SignalValidationResult = { ok: true } | { ok: false; message: string };

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

export function validateParsedSignal(signal: ParsedSignal): SignalValidationResult {
  if (signal.side !== "buy" && signal.side !== "sell") {
    return { ok: false, message: "Side must be buy or sell." };
  }

  if (signal.orderType !== "market" && signal.orderType !== "limit") {
    return { ok: false, message: "Order type must be market or limit." };
  }

  if (!signal.pair.trim()) {
    return { ok: false, message: "Pair is required." };
  }

  if (!isPositiveFinite(signal.entry) || !isPositiveFinite(signal.stopLoss) || !isPositiveFinite(signal.takeProfit)) {
    return { ok: false, message: "Entry, stop loss, and take profit must be positive numbers." };
  }

  if (signal.side === "buy" && !(signal.stopLoss < signal.entry && signal.entry < signal.takeProfit)) {
    return {
      ok: false,
      message: "For buy trades, stop loss must be below entry and take profit must be above entry.",
    };
  }

  if (signal.side === "sell" && !(signal.takeProfit < signal.entry && signal.entry < signal.stopLoss)) {
    return {
      ok: false,
      message: "For sell trades, stop loss must be above entry and take profit must be below entry.",
    };
  }

  return { ok: true };
}

export function assertValidParsedSignal(signal: ParsedSignal): void {
  const validation = validateParsedSignal(signal);
  if (!validation.ok) throw new Error(validation.message);
}
