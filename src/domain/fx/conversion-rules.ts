import { resolveInstrumentSpecification, type InstrumentLotOverride } from "./instrument-rules";

export type RequiredQuoteToAccountRate = {
  baseCurrency: string;
  quoteCurrency: string;
};

export type PipValueRateCandidate = RequiredQuoteToAccountRate & {
  useAs: "quote" | "base";
};

const usdEurCurrencies = new Set(["USD", "EUR"]);

function normalizeCurrency(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function canConvertWithEurUsd(fromCurrency: string | null, toCurrency: string) {
  return fromCurrency !== null && usdEurCurrencies.has(fromCurrency) && usdEurCurrencies.has(toCurrency);
}

export function getRequiredQuoteToAccountRate(
  pair: string,
  accountCurrency: string,
  hasManualPipValue = false,
  overrides: Record<string, InstrumentLotOverride> = {},
): RequiredQuoteToAccountRate | null {
  const firstCandidate = getPipValueRateCandidates(pair, accountCurrency, hasManualPipValue, overrides)[0];
  return firstCandidate
    ? {
        baseCurrency: firstCandidate.baseCurrency,
        quoteCurrency: firstCandidate.quoteCurrency,
      }
    : null;
}

/** Classify exact/manual bypasses and the preferred shared or instrument-specific conversion. */
export function getPipValueConversionPlan(
  symbol: string,
  accountCurrency: string,
  hasManualPipValue = false,
  overrides: Record<string, InstrumentLotOverride> = {},
  eurUsdAvailable = true,
): { usesEurUsd: boolean; candidates: PipValueRateCandidate[] } {
  const instrument = resolveInstrumentSpecification(symbol, overrides);
  const currency = normalizeCurrency(accountCurrency);
  if (
    hasManualPipValue ||
    instrument.manualPipValuePerLot !== undefined ||
    currency === instrument.profitCurrency ||
    currency === instrument.baseCurrency
  )
    return { usesEurUsd: false, candidates: [] };

  const usesEurUsd =
    canConvertWithEurUsd(instrument.profitCurrency, currency) ||
    canConvertWithEurUsd(instrument.baseCurrency, currency);
  if (usesEurUsd && eurUsdAvailable) return { usesEurUsd, candidates: [] };

  const candidates: PipValueRateCandidate[] = [
    { baseCurrency: instrument.profitCurrency, quoteCurrency: currency, useAs: "quote" },
  ];
  if (instrument.baseCurrency) {
    candidates.push({ baseCurrency: instrument.baseCurrency, quoteCurrency: currency, useAs: "base" });
  }
  return { usesEurUsd, candidates };
}

export function getPipValueRateCandidates(
  pair: string,
  accountCurrency: string,
  hasManualPipValue = false,
  overrides: Record<string, InstrumentLotOverride> = {},
): PipValueRateCandidate[] {
  return getPipValueConversionPlan(pair, accountCurrency, hasManualPipValue, overrides).candidates;
}
