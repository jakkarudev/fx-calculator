import { resolveInstrumentSpecification } from "./instrument-rules";
import { getDecimalPlaces } from "./format";
import { assertValidParsedSignal } from "./validate-signal";
import type { PositionInput, PositionResult } from "./types";

function roundDown(value: number, step: number) {
  const decimals = getDecimalPlaces(step);
  return Number((Math.floor(value / step + 1e-9) * step).toFixed(decimals));
}

function getEurUsdRate(input: PositionInput) {
  return typeof input.eurUsdRate === "number" && Number.isFinite(input.eurUsdRate) && input.eurUsdRate > 0
    ? input.eurUsdRate
    : input.requireReliablePipValue
      ? null
      : 1.16;
}

function convertUsdEur(amount: number, fromCurrency: string, toCurrency: string, eurUsdRate: number | null) {
  if (fromCurrency === toCurrency) return amount;
  if (eurUsdRate === null) return null;
  if (fromCurrency === "EUR" && toCurrency === "USD") return amount * eurUsdRate;
  if (fromCurrency === "USD" && toCurrency === "EUR") return amount / eurUsdRate;
  return null;
}

function getPositiveRate(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function calculatePosition(input: PositionInput): PositionResult {
  assertValidParsedSignal(input);

  const instrument = resolveInstrumentSpecification(input.pair, input.instrumentOverrides);
  const pair = instrument.symbol;
  const baseCurrency = instrument.baseCurrency;
  const pipSize = instrument.pipSize;
  const quoteCurrency = instrument.profitCurrency;
  const contractSize = instrument.contractSize;
  const accountCurrency = input.accountCurrency.toUpperCase().slice(0, 3);
  const eurUsdRate = getEurUsdRate(input);
  const riskAmount = (input.accountBalance * input.riskPercent) / 100;
  const stopPips = Math.abs(input.entry - input.stopLoss) / pipSize;
  const rewardPips = Math.abs(input.takeProfit - input.entry) / pipSize;
  const quoteValue = pipSize * contractSize;
  const quoteToAccountRate = getPositiveRate(input.quoteToAccountRate);
  const baseToAccountRate = getPositiveRate(input.baseToAccountRate);

  if (stopPips <= 0) {
    throw new Error("Stop loss must differ from entry.");
  }

  let pipValuePerLot: number;
  let pipValueMode: PositionResult["pipValueMode"];
  if (instrument.manualPipValuePerLot !== undefined) {
    pipValuePerLot = instrument.manualPipValuePerLot;
    pipValueMode = "manual";
  } else if (accountCurrency === quoteCurrency) {
    pipValuePerLot = quoteValue;
    pipValueMode = "exact";
  } else if (baseCurrency && accountCurrency === baseCurrency) {
    pipValuePerLot = (pipSize / input.entry) * contractSize;
    pipValueMode = "exact";
  } else if (
    typeof input.manualPipValuePerLot === "number" &&
    Number.isFinite(input.manualPipValuePerLot) &&
    input.manualPipValuePerLot > 0
  ) {
    pipValuePerLot = input.manualPipValuePerLot;
    pipValueMode = "manual";
  } else if (quoteToAccountRate !== null) {
    pipValuePerLot = quoteValue * quoteToAccountRate;
    pipValueMode = "converted";
  } else if (baseCurrency && baseToAccountRate !== null) {
    pipValuePerLot = (quoteValue / input.entry) * baseToAccountRate;
    pipValueMode = "converted";
  } else {
    const convertedFromQuote = convertUsdEur(quoteValue, quoteCurrency, accountCurrency, eurUsdRate);
    const convertedFromBase = baseCurrency
      ? convertUsdEur(quoteValue / input.entry, baseCurrency, accountCurrency, eurUsdRate)
      : null;

    if (convertedFromQuote !== null) {
      pipValuePerLot = convertedFromQuote;
      pipValueMode = "converted";
    } else if (convertedFromBase !== null) {
      pipValuePerLot = convertedFromBase;
      pipValueMode = "converted";
    } else {
      pipValuePerLot = 10;
      pipValueMode = "estimated";
    }
  }

  if (pipValueMode === "estimated" && input.requireReliablePipValue === true) {
    throw new Error("Reliable pip value unavailable. Add a live conversion rate or manual pip value.");
  }

  const rawLotSize = riskAmount / (stopPips * pipValuePerLot);
  const lotStep = input.lotStep ?? instrument.defaultLotStep;
  const minLot = input.minLot ?? (input.lotStep === undefined ? instrument.defaultMinLot : lotStep);
  const maxLot = input.maxLot ?? Number.POSITIVE_INFINITY;
  const lotSize = Math.min(maxLot, Math.max(minLot, roundDown(rawLotSize, lotStep)));
  const actualRiskAmount = stopPips * pipValuePerLot * lotSize;
  const actualRiskPercent = (actualRiskAmount / input.accountBalance) * 100;
  const actualRiskExceedsTarget = actualRiskPercent > input.riskPercent + 1e-9;
  const rewardAmount = rewardPips * pipValuePerLot * lotSize;
  const rr = rewardPips / stopPips;

  return {
    ...input,
    pair,
    pipSize,
    stopPips,
    rewardPips,
    rr,
    riskAmount,
    rewardAmount,
    pipValuePerLot,
    pipValueMode,
    rawLotSize,
    lotSize,
    actualRiskAmount,
    actualRiskPercent,
    actualRiskExceedsTarget,
  };
}
