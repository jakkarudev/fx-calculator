import { describe, expect, it } from "vitest";
import { buildInstrumentCatalog, getInstrumentCatalog } from "./catalog";
import snapshot from "./catalog-source/symbols-response.json";
import { getInstrumentSpec, normalizePair } from "./pairs";
import { calculatePosition } from "./calculate-position";
import { parseSignal } from "./parse-signal";
import { sanitizeInstrumentLotOverrides } from "./instrument-rules";
import { getPipValueRateCandidates } from "./conversion-rules";
import { createAdjustedPosition } from "./adjust-signal";

const trade = {
  side: "buy" as const,
  orderType: "market" as const,
  accountBalance: 10000,
  riskPercent: 1,
  accountCurrency: "USD",
  requireReliablePipValue: true,
};

describe("local FTMO contract catalog", () => {
  it("values platinum and silver using their actual contracts", () => {
    expect(calculatePosition({ ...trade, pair: "XPT/USD", entry: 1000, stopLoss: 990, takeProfit: 1020 }).lotSize).toBe(
      0.1,
    );
    expect(calculatePosition({ ...trade, pair: "XAGUSD", entry: 30, stopLoss: 29.8, takeProfit: 30.4 }).lotSize).toBe(
      0.1,
    );
    expect(getInstrumentSpec("XAUUSD").pipSize).toBe(0.01);
  });
  it("resolves cash indices conservatively while preserving legacy keys", () => {
    expect(normalizePair("GER40.cash.pro")).toBe("GER40.cash");
    expect(normalizePair("NAS100")).toBe("US100");
    expect(normalizePair("US30.cash")).toBe("US30");
    expect(normalizePair("nk225")).toBe("JP225.cash");
    expect(normalizePair("HK50.cash")).toBe("HK50.cash");
    expect(normalizePair("GER40foobar")).toBe("");
    expect(normalizePair("ABCDEF")).toBe("");
    expect(() => getInstrumentSpec("UNSUPPORTED")).toThrow(/Unsupported/);
    expect(normalizePair("USDTRY")).toBe("USDTRY");
  });
  it("uses profit currency and index multiplier for sizing and rate requests", () => {
    expect(
      calculatePosition({
        ...trade,
        pair: "GER40.cash",
        accountCurrency: "EUR",
        entry: 20000,
        stopLoss: 19950,
        takeProfit: 20100,
      }).lotSize,
    ).toBe(2);
    expect(
      calculatePosition({
        ...trade,
        pair: "GER40.cash",
        eurUsdRate: 1.25,
        entry: 20000,
        stopLoss: 19950,
        takeProfit: 20100,
      }).lotSize,
    ).toBe(1.6);
    expect(
      calculatePosition({
        ...trade,
        pair: "JP225.cash",
        quoteToAccountRate: 0.01,
        entry: 40000,
        stopLoss: 39900,
        takeProfit: 40200,
      }).lotSize,
    ).toBe(10);
    expect(getPipValueRateCandidates("JP225.cash", "USD")).toEqual([
      { baseCurrency: "JPY", quoteCurrency: "USD", useAs: "quote" },
    ]);
    expect(() =>
      calculatePosition({ ...trade, pair: "HK50.cash", entry: 20000, stopLoss: 19900, takeProfit: 20200 }),
    ).toThrow(/Reliable/);
  });
  it("captures exotic movement and source precision independently", () => {
    expect(getInstrumentSpec("EURCZK")).toMatchObject({
      pipSize: 0.001,
      priceDigits: 4,
      profitCurrency: "CZK",
      contractSize: 100000,
    });
    expect(getInstrumentSpec("XAGAUD")).toMatchObject({
      priceDigits: 3,
      profitCurrency: "AUD",
      contractSize: 5000,
      lotRulesSource: "compatibility-default",
    });
    expect(
      createAdjustedPosition(
        { ...trade, pair: "GER40.cash", accountCurrency: "EUR", entry: 20000, stopLoss: 19950, takeProfit: 20100 },
        true,
        0.1,
      ).adjusted?.entry,
    ).toBe(20000.1);
  });
  it("imports decorated symbols and does not match a known substring in an unsupported ticker", () => {
    expect(parseSignal("GER40.cash.pro BUY\nENTRY 20000.20\nSL 19950.20\nTP 20100.20").pair).toBe("GER40.cash");
    expect(() => parseSignal("GER40.cash.FAKE BUY\nENTRY 20000\nSL 19950\nTP 20100")).toThrow();
  });
  it("merges canonicalized partial lot overrides without dropping either field", () => {
    expect(sanitizeInstrumentLotOverrides({ US100: { lotStep: 0.5 }, "US100.cash": { minLot: 1 } })).toEqual({
      US100: { lotStep: 0.5, minLot: 1 },
    });
  });
});

it("requires symbol context for short source aliases", () => {
  expect(parseSignal("NQ BUY\nENTRY 19000\nSL 18950\nTP 19100").pair).toBe("US100");
  expect(parseSignal("TYPE BUY\nSYMBOL: ES\nENTRY 5000\nSL 4950\nTP 5100").pair).toBe("US500.cash");
  expect(() => parseSignal("Here is ES in prose BUY\nENTRY 5000\nSL 4950\nTP 5100")).toThrow();
});

it("activates this category slice from the complete local snapshot", () => {
  const active = snapshot.data.symbols.filter((row) => row.active && row.region === "global");
  const all = buildInstrumentCatalog(["forex", "metal", "index", "commodity", "crypto", "equity"]);
  expect(all).toHaveLength(active.length);
  expect(getInstrumentCatalog()).toHaveLength(active.length);
  expect(
    getInstrumentCatalog().every((spec) =>
      ["forex", "metal", "index", "commodity", "crypto", "equity"].includes(spec.kind),
    ),
  ).toBe(true);
  expect(getInstrumentCatalog().find((spec) => spec.symbol === "JP225.cash")).toMatchObject({
    contractSize: 10,
    profitCurrency: "JPY",
    catalogSource: { id: "ftmo-public-symbols-global-2026-10-07", captureDate: "2026-10-07" },
  });
  expect(all.find((spec) => spec.symbol === "ETHUSD")).toMatchObject({ contractSize: 10, kind: "crypto" });
  expect(all.find((spec) => spec.symbol === "COFFEE.c")).toMatchObject({
    defaultMinLot: 1,
    defaultLotStep: 1,
    lotRulesSource: "historical-official",
    kind: "commodity",
  });
  expect(all.find((spec) => spec.symbol === "BRK.B")).toMatchObject({ symbol: "BRK.B", kind: "equity" });
});

it("rejects unrecognized forex suffixes rather than accepting an embedded pair", () => {
  expect(() => parseSignal("EURUSDfoobar BUY\nENTRY 1.1\nSL 1.09\nTP 1.12")).toThrow();
});

it("keeps the runtime projection consistent with every active raw contract", () => {
  const all = buildInstrumentCatalog(["forex", "metal", "index", "commodity", "crypto", "equity"]);
  for (const row of snapshot.data.symbols.filter((row) => row.active && row.region === "global")) {
    expect(all.find((spec) => spec.aliases.includes(row.code))).toMatchObject({
      displaySymbol: row.displayCode,
      name: row.name,
      contractSize: row.contractSize,
      profitCurrency: row.profitCurrency,
      marginCurrency: row.marginCurrency,
      priceDigits: row.digits,
      sourceMovementUnit: row.pipConversion,
      sourceAssetClass: row.assetClass,
    });
  }
});
