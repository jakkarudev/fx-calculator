import { getInstrumentCatalog, type InstrumentSpec } from "./catalog";
export type { InstrumentSpec } from "./catalog";
const instrumentSpecs = getInstrumentCatalog();

const currencyCodes = new Set([
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLF",
  "CLP",
  "CNH",
  "CNY",
  "COP",
  "CRC",
  "CUC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SLL",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XOF",
  "XPF",
  "YER",
  "ZAR",
  "ZMW",
  "ZWL",
]);

function cleanSymbol(value: string) {
  return value.trim().toUpperCase();
}

function getExplicitInstrument(value: string) {
  const normalized = cleanSymbol(value);
  return instrumentSpecs.find((spec) => spec.aliases.some((alias) => cleanSymbol(alias) === normalized)) ?? null;
}

export function isForexSymbol(value: string) {
  const symbol = cleanSymbol(value).replace(/^([A-Z]{3})\/([A-Z]{3})$/, "$1$2");
  if (symbol.length !== 6) return false;
  return (
    currencyCodes.has(symbol.slice(0, 3)) &&
    currencyCodes.has(symbol.slice(3)) &&
    symbol.slice(0, 3) !== symbol.slice(3)
  );
}

export function normalizePair(value: string): string {
  const normalized = cleanSymbol(value);
  if (/^[#$]/.test(normalized)) {
    const stock = normalizePair(normalized.slice(1));
    return stock && getExplicitInstrument(stock)?.kind === "equity" ? stock : "";
  }
  const explicit = getExplicitInstrument(normalized);
  if (explicit) return explicit.symbol;
  if (isForexSymbol(normalized)) return normalized.replace("/", "");
  // Only known account decorations are removed, after exact matching.
  const undecorated = normalized.replace(/(?:\.PRO|\.RAW|\.STD|\.M|_PRO|_RAW|_STD)$/, "");
  if (undecorated !== normalized) {
    const known = getExplicitInstrument(undecorated);
    if (known) return known.symbol;
    if (isForexSymbol(undecorated)) return undecorated.replace("/", "");
  }
  return "";
}

export function getInstrumentSpec(value: string): InstrumentSpec {
  const symbol = normalizePair(value);
  const explicit = getExplicitInstrument(symbol);
  if (explicit) return explicit;
  if (!isForexSymbol(symbol)) throw new Error(`Unsupported instrument: ${value}`);
  const quoteCurrency = symbol.slice(-3);
  const pipSize = quoteCurrency === "JPY" ? 0.01 : 0.0001;
  return {
    symbol,
    displaySymbol: `${symbol.slice(0, 3)}/${quoteCurrency}`,
    name: symbol,
    aliases: [symbol],
    kind: "forex",
    sourceAssetClass: "Dynamic forex",
    baseCurrency: symbol.slice(0, 3),
    quoteCurrency,
    profitCurrency: quoteCurrency,
    marginCurrency: symbol.slice(0, 3),
    pipSize,
    sourceMovementUnit: pipSize,
    contractSize: 100000,
    priceDigits: quoteCurrency === "JPY" ? 3 : 5,
    adjustmentDigits: quoteCurrency === "JPY" ? 3 : 5,
    defaultLotStep: 0.01,
    defaultMinLot: 0.01,
    lotRulesSource: "compatibility-default",
    catalogSource: { id: "dynamic-forex-compatibility", captureDate: "", url: "" },
  };
}

export function getQuoteCurrency(pair: string) {
  return getInstrumentSpec(pair).quoteCurrency;
}

export function getBaseCurrency(pair: string) {
  return getInstrumentSpec(pair).baseCurrency;
}

export function getPipSize(pair: string) {
  return getInstrumentSpec(pair).pipSize;
}

export function getContractSize(pair: string) {
  return getInstrumentSpec(pair).contractSize;
}

export function getDefaultLotStep(pair: string) {
  return getInstrumentSpec(pair).defaultLotStep;
}

export function getDefaultMinLot(pair: string) {
  return getInstrumentSpec(pair).defaultMinLot;
}

export function getKnownInstrumentAliases() {
  return instrumentSpecs.flatMap((spec) => spec.aliases);
}
