import { normalizePair } from "@/domain/fx/pairs";
import { parseSignal } from "@/domain/fx/parse-signal";
import type { ParsedSignal, PriceText } from "@/domain/fx/types";

/** Editable values are text, and may be incomplete or invalid. */
export type TradeDraft = {
  pair: string;
  side: string;
  orderType: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  priceText?: PriceText;
};

export const emptyTradeDraft: TradeDraft = {
  pair: "EURUSD",
  side: "buy",
  orderType: "market",
  entry: "",
  stopLoss: "",
  takeProfit: "",
};

export function createTradeDraft(signal: ParsedSignal): TradeDraft {
  return {
    pair: signal.pair,
    side: signal.side,
    orderType: signal.orderType,
    entry: signal.priceText?.entry ?? String(signal.entry),
    stopLoss: signal.priceText?.stopLoss ?? String(signal.stopLoss),
    takeProfit: signal.priceText?.takeProfit ?? String(signal.takeProfit),
    priceText: signal.priceText,
  };
}

/** This conversion alone does not validate user input. */
export function draftToSignal(draft: TradeDraft): ParsedSignal {
  return {
    pair: draft.pair,
    side: draft.side as ParsedSignal["side"],
    orderType: draft.orderType as ParsedSignal["orderType"],
    entry: Number(draft.entry),
    stopLoss: Number(draft.stopLoss),
    takeProfit: Number(draft.takeProfit),
    priceText: draft.priceText,
  };
}

export function editTradeDraft(
  draft: TradeDraft,
  field: keyof Omit<TradeDraft, "priceText">,
  value: string,
): TradeDraft {
  if (field === "pair" || field === "side" || field === "orderType") {
    return { ...draft, [field]: field === "pair" ? value.toUpperCase() : value.toLowerCase() };
  }
  return { ...draft, [field]: value, priceText: { ...draft.priceText, [field]: value } };
}

export type CalculatorDraft = {
  mode: "manual" | "import";
  manualDraft: TradeDraft;
  importDraft: TradeDraft | null;
  rawSignal: string;
  importedSource: string;
};

type RestoredCalculatorDraft = CalculatorDraft & { parseError: string | null };

function restoreTextDraft(value: unknown): TradeDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!["pair", "side", "orderType", "entry", "stopLoss", "takeProfit"].every((key) => typeof record[key] === "string"))
    return null;
  return {
    pair: record.pair as string,
    side: record.side as string,
    orderType: record.orderType as string,
    entry: record.entry as string,
    stopLoss: record.stopLoss as string,
    takeProfit: record.takeProfit as string,
    priceText: normalizeStoredPriceText(record.priceText),
  };
}

export function serializeDraft(draft: CalculatorDraft): string {
  return JSON.stringify({ version: 2, ...draft, parsed: draft.importDraft ? draftToSignal(draft.importDraft) : null });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStoredPriceText(value: unknown): ParsedSignal["priceText"] {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const entry = typeof record.entry === "string" ? record.entry : undefined;
  const stopLoss = typeof record.stopLoss === "string" ? record.stopLoss : undefined;
  const takeProfit = typeof record.takeProfit === "string" ? record.takeProfit : undefined;

  return entry || stopLoss || takeProfit ? { entry, stopLoss, takeProfit } : undefined;
}

function normalizeStoredParsed(value: unknown): ParsedSignal | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const pair = typeof record.pair === "string" ? record.pair.trim().toUpperCase() : "";
  const side = typeof record.side === "string" ? record.side.trim().toLowerCase() : "";
  const orderType = typeof record.orderType === "string" ? record.orderType.trim().toLowerCase() : "";
  const entry = Number(record.entry);
  const stopLoss = Number(record.stopLoss);
  const takeProfit = Number(record.takeProfit);

  if (!pair || (side !== "buy" && side !== "sell") || (orderType !== "market" && orderType !== "limit")) {
    return null;
  }

  if (!isFiniteNumber(entry) || !isFiniteNumber(stopLoss) || !isFiniteNumber(takeProfit)) {
    return null;
  }

  return {
    pair: normalizePair(pair) || pair,
    side,
    orderType,
    entry,
    stopLoss,
    takeProfit,
    priceText: normalizeStoredPriceText(record.priceText),
  };
}

/** Restores version 2 text drafts or migrates the original imported-signal storage. */
export function restoreDraft(value: string | null): RestoredCalculatorDraft | null {
  if (!value) return null;

  try {
    const stored: unknown = JSON.parse(value);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;
    const record = stored as Record<string, unknown>;
    const manualDraft = { ...emptyTradeDraft, side: "auto" };
    if (record.version === 2) {
      const manual = restoreTextDraft(record.manualDraft) ?? manualDraft;
      const rawSignal = typeof record.rawSignal === "string" ? record.rawSignal : "";
      return {
        mode: record.mode === "import" ? "import" : "manual",
        manualDraft: { ...manual, pair: normalizePair(manual.pair) || manual.pair },
        importDraft: restoreTextDraft(record.importDraft),
        rawSignal,
        importedSource: typeof record.importedSource === "string" ? record.importedSource : rawSignal,
        parseError: null,
      };
    }
    if (record.version !== undefined || typeof record.rawSignal !== "string") return null;
    const rawSignal = record.rawSignal;
    const parsed = normalizeStoredParsed(record.parsed);
    let importDraft = parsed ? createTradeDraft(parsed) : null;
    let parseError: string | null = null;
    if (!importDraft && rawSignal.trim()) {
      try {
        importDraft = createTradeDraft(parseSignal(rawSignal));
      } catch (error) {
        parseError = error instanceof Error ? error.message : "Unable to parse signal.";
      }
    }
    return { mode: "import", manualDraft, importDraft, rawSignal, importedSource: rawSignal, parseError };
  } catch {
    return null;
  }
}
