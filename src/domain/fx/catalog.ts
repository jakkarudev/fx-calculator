import snapshot from "./catalog-source/runtime-symbols.json";

export type InstrumentKind = "forex" | "metal" | "index" | "commodity" | "crypto" | "equity";
export type InstrumentSpec = {
  symbol: string;
  displaySymbol: string;
  name: string;
  aliases: string[];
  kind: InstrumentKind;
  sourceAssetClass: string;
  baseCurrency: string | null;
  quoteCurrency: string;
  profitCurrency: string;
  marginCurrency: string;
  pipSize: number;
  sourceMovementUnit: number;
  contractSize: number;
  priceDigits: number;
  adjustmentDigits: number;
  defaultLotStep: number;
  defaultMinLot: number;
  lotRulesSource: "compatibility-default" | "historical-official";
  catalogSource: { id: string; captureDate: string; url: string };
};

export const catalogSource = {
  id: "ftmo-public-symbols-global-2026-10-07",
  captureDate: "2026-10-07",
  url: "https://ftmo.com/wp-json/ftmo/symbols",
};

const compatibilityAliases: Record<string, string[]> = {
  XAUUSD: ["GOLD", "GOLDUSD"],
  XAGUSD: ["SILVER", "SILVERUSD"],
  US100: ["NAS100", "NASDAQ", "NASDAQ100", "USTEC"],
  US30: ["DJ30", "DOW", "DOW30", "WALLSTREET30"],
  "JP225.cash": ["NIKKEI", "NK225"],
  "USOIL.cash": ["WTI", "USOIL", "WEST TEXAS INTERMEDIATE"],
  "UKOIL.cash": ["UKOIL", "BRENT OIL"],
  "NATGAS.cash": ["NATURAL GAS"],
  "HEATOIL.c": ["HEATING OIL"],
  AVAUSD: ["AVAXUSD"],
  GALUSD: ["GALAUSD"],
};

function getCategory(assetClass: string, code: string): InstrumentKind {
  if (assetClass === "Forex" || assetClass === "Exotics") return "forex";
  if (assetClass === "Metals CFD") return "metal";
  if (assetClass === "Crypto CFD") return "crypto";
  if (assetClass === "Equities CFD") return "equity";
  return /^(?:UKOIL|USOIL|NATGAS|HEATOIL|COCOA|COFFEE|CORN|SOYBEAN|WHEAT|COTTON|SUGAR)\./.test(code)
    ? "commodity"
    : "index";
}

/** Category slices share the same complete committed source; runtime never fetches it. */
export function buildInstrumentCatalog(categories: readonly InstrumentKind[]): InstrumentSpec[] {
  return snapshot.data.symbols
    .filter(
      (row) => row.active && row.region === "global" && categories.includes(getCategory(row.assetClass, row.code)),
    )
    .map((row) => {
      const kind = getCategory(row.assetClass, row.code);
      const symbol =
        row.code === "US100.cash" || row.code === "US30.cash" ? row.code.split(".")[0] : row.code.replace("/", "");
      const legacyIndex = symbol === "US100" || symbol === "US30";
      const legacyMetal = symbol === "XAUUSD" || symbol === "XAGUSD";
      const lot = kind === "index" ? 0.1 : 0.01;
      const historicalLot = /^(?:V|COCOA\.c|COFFEE\.c|SOYBEAN\.c|WHEAT\.c|CORN\.c)$/.test(symbol);
      const sourceAliases =
        row.code === "HK50.cash"
          ? []
          : (row.aliases ?? "")
              .split(",")
              .map((alias) => alias.trim())
              .filter(Boolean);
      return {
        symbol,
        displaySymbol: row.displayCode,
        name: row.name,
        aliases: [
          ...new Set([
            symbol,
            row.code,
            row.displayCode,
            ...(kind === "crypto" ? [`${symbol.slice(0, -3)}/${row.profitCurrency}`] : []),
            ...(kind === "index" || kind === "commodity" ? [row.code.replace(/\.(?:cash|c)$/, "")] : []),
            ...sourceAliases,
            ...(compatibilityAliases[symbol] ?? []),
          ]),
        ],
        kind,
        sourceAssetClass: row.assetClass,
        baseCurrency: kind === "forex" || kind === "metal" ? row.code.split("/")[0] : null,
        quoteCurrency: row.profitCurrency,
        profitCurrency: row.profitCurrency,
        marginCurrency: row.marginCurrency,
        pipSize: legacyMetal ? 0.01 : row.pipConversion,
        sourceMovementUnit: row.pipConversion,
        contractSize: row.contractSize,
        priceDigits: row.digits,
        adjustmentDigits: legacyIndex ? 0 : row.digits,
        defaultLotStep: historicalLot ? 1 : lot,
        defaultMinLot: historicalLot ? 1 : lot,
        lotRulesSource: historicalLot ? "historical-official" : "compatibility-default",
        catalogSource,
      };
    });
}

const activeCategories: readonly InstrumentKind[] = ["forex", "metal", "index", "commodity", "crypto", "equity"];
const instrumentCatalog = buildInstrumentCatalog(activeCategories);
export function getInstrumentCatalog(): readonly InstrumentSpec[] {
  return instrumentCatalog;
}
