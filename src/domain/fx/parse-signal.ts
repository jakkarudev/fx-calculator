import { getInstrumentSpec, getKnownInstrumentAliases, getPipSize, isForexSymbol, normalizePair } from "./pairs";
import type { OrderType, ParsedSignal, SignalSide } from "./types";

const numberPattern = /\b(\d+(?:[.,]\d+)?)\b/;
const homoglyphMap: Record<string, string> = {
  Α: "A",
  α: "a",
  Β: "B",
  β: "b",
  Ε: "E",
  ε: "e",
  Ζ: "Z",
  ζ: "z",
  Η: "H",
  η: "h",
  Ι: "I",
  ι: "i",
  Κ: "K",
  κ: "k",
  Μ: "M",
  μ: "m",
  Ν: "N",
  ν: "n",
  Ο: "O",
  ο: "o",
  Ρ: "P",
  ρ: "p",
  Τ: "T",
  τ: "t",
  Υ: "Y",
  υ: "y",
  Χ: "X",
  χ: "x",
};

function normalizeSignalText(value: string) {
  return value.normalize("NFKC").replace(/[ΑαΒβΕεΖζΗηΙιΚκΜμΝνΟοΡρΤτΥυΧχ]/g, (char) => homoglyphMap[char] ?? char);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePrice(line: string) {
  const priceText = line.replace(/\([^)]*\b(?:pips?|points?|pts?)\b[^)]*\)/gi, "");
  const matches = Array.from(priceText.matchAll(new RegExp(numberPattern, "g")));
  const match = matches.at(-1);
  if (!match) return null;

  const text = match[1].replace(",", ".");
  return {
    value: Number(text),
    text,
  };
}

function parseSide(text: string): SignalSide | null {
  if (/\b(buy|long)\b/i.test(text)) return "buy";
  if (/\b(sell|short)\b/i.test(text)) return "sell";
  return null;
}

function parseOrderType(text: string): OrderType {
  return /\b(?:buy|sell|long|short)\s+limit\b|\blimit\s+(?:buy|sell|long|short)\b/i.test(text) ? "limit" : "market";
}

function parsePair(text: string) {
  // Preserve symbol punctuation through resolution; unsupported suffixes must not
  // expose a supported ticker prefix. A terminal period remains sentence punctuation.
  const candidates = Array.from(text.matchAll(/[#$]?[A-Z0-9]+(?:[./_-][A-Z0-9]+)*/gi));
  for (const alias of getKnownInstrumentAliases().filter((value) => /\s/.test(value))) {
    const phrase = escapeRegExp(alias).replace(/\s+/g, "[ \\t]+");
    // Keep the entire suffix so normalizePair can reject unsupported decorations.
    candidates.push(
      ...text.matchAll(new RegExp(`(?<![A-Z0-9./_-])${phrase}(?:[./_-][A-Z0-9]+)*(?![A-Z0-9./_-])`, "gi")),
    );
  }
  candidates.sort((a, b) => a.index - b.index || b[0].length - a[0].length);

  const resolve = (value: string) => {
    const normalized = normalizePair(value.replace(/[ \t]+/g, " "));
    if (normalized) return normalized;
    // OCR may join the Greek omicron marker to a forex ticker (ΟCHFJPY).
    return /^O[A-Z]{6}$/i.test(value) && isForexSymbol(value.slice(1)) ? normalizePair(value.slice(1)) : "";
  };
  const declared = candidates.find((match) => /\b(?:pair|instrument|symbol)\s*:\s*$/i.test(text.slice(0, match.index)));
  if (declared) return resolve(declared[0]) || null;

  for (const match of candidates) {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + match[0].length);
    const standalone = !(before.split("\n").at(-1) ?? "").trim() && !after.split("\n")[0].trim();
    const besideDirection =
      /\b(?:buy|sell|long|short)(?:[ \t]+limit)?[ \t]+$/i.test(before) ||
      /^[ \t]+(?:buy|sell|long|short)\b/i.test(after) ||
      (standalone &&
        (/(?:^|\n)(?:buy|sell|long|short)(?:[ \t]+limit)?\n$/i.test(before) ||
          /^\n(?:buy|sell|long|short)(?:[ \t]+limit)?(?:\n|$)/i.test(after)));
    if (besideDirection) {
      const resolved = resolve(match[0]);
      if (resolved) return resolved;
    }
  }

  for (const match of candidates) {
    const resolved = resolve(match[0]);
    if (resolved && /^[#$]/.test(match[0]) && getInstrumentSpec(resolved).kind === "equity") return resolved;
  }

  for (const match of candidates) {
    // Phrase names need a standalone instrument line; prose is not a declaration.
    const multiword = /\s/.test(match[0]);
    const before = text.slice(0, match.index).split("\n").at(-1) ?? "";
    const after = text.slice(match.index + match[0].length).split("\n")[0];
    if (multiword ? before.trim() || after.trim() : match[0].length <= 2) continue;
    const resolved = resolve(match[0]);
    if (resolved && getInstrumentSpec(resolved).kind !== "equity") return resolved;
  }
  return null;
}

function findExplicitSignalLine(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line));
}

function getSignalScopedLines(lines: string[]) {
  const signalIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /\b(pair|type|entry|ent|sl|stop loss|stop|tp\d*|take profit)\b/i.test(line))
    .map(({ index }) => index);

  if (signalIndexes.length < 3) return lines;

  const start = Math.max(0, Math.min(...signalIndexes) - 2);
  const end = Math.min(lines.length, Math.max(...signalIndexes) + 3);
  return lines.slice(start, end);
}

export function parseSignal(input: string): ParsedSignal {
  const normalizedInput = normalizeSignalText(input);
  const lines = normalizedInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const signalLines = getSignalScopedLines(lines);
  const joined = signalLines.join(" ");

  const pair = parsePair(signalLines.join("\n"));
  const side = parseSide(joined);
  const orderType = parseOrderType(joined);

  const explicitEntry = findExplicitSignalLine(signalLines, /\b(entry|ent)\b/i);
  const entry =
    explicitEntry ??
    signalLines.find((line) => line.includes("@")) ??
    signalLines.find((line) => /^\d+(?:[.,]\d+)?\b/.test(line));
  const stop = findExplicitSignalLine(signalLines, /\b(sl|stop loss|stop)\b/i);
  const tp = findExplicitSignalLine(signalLines, /\b(tp\d*|take profit)\b/i);

  const parsedEntry = entry ? parsePrice(entry) : null;
  const parsedStop = stop ? parsePrice(stop) : null;
  const parsedTp = tp ? parsePrice(tp) : null;

  if (!pair || !side || parsedEntry === null || parsedStop === null || parsedTp === null) {
    throw new Error("Could not parse signal. Include pair, side, entry, stop loss, and take profit.");
  }

  return {
    pair,
    side,
    orderType,
    entry: parsedEntry.value,
    stopLoss: parsedStop.value,
    takeProfit: parsedTp.value,
    priceText: {
      entry: parsedEntry.text,
      stopLoss: parsedStop.text,
      takeProfit: parsedTp.text,
    },
  };
}

export function estimatePipSize(pair: string) {
  return getPipSize(pair);
}
