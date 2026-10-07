import { describe, expect, it } from "vitest";
import {
  getPipValueConversionPlan,
  getPipValueRateCandidates,
  getRequiredQuoteToAccountRate,
} from "./conversion-rules";

describe("getRequiredQuoteToAccountRate", () => {
  it.each([
    ["EURUSD", "USD"],
    ["EURUSD", "EUR"],
    ["GBPUSD", "EUR"],
    ["USDJPY", "USD"],
    ["USDJPY", "EUR"],
    ["EURJPY", "USD"],
    ["EURJPY", "EUR"],
    ["XAUUSD", "USD"],
    ["XAUUSD", "EUR"],
    ["XAGUSD", "EUR"],
    ["US100", "USD"],
    ["US100", "EUR"],
    ["US30", "EUR"],
  ])("does not require a pair-specific live rate for %s in a %s account", (pair, accountCurrency) => {
    expect(getRequiredQuoteToAccountRate(pair, accountCurrency)).toBeNull();
  });

  it.each([
    ["CHFJPY", "USD", "JPY", "USD"],
    ["GBPJPY", "EUR", "JPY", "EUR"],
    ["AUDNZD", "USD", "NZD", "USD"],
    ["CADCHF", "EUR", "CHF", "EUR"],
    ["GBPTRY", "USD", "TRY", "USD"],
  ])(
    "requires the quote-to-account live rate for %s in a %s account",
    (pair, accountCurrency, expectedBase, expectedQuote) => {
      expect(getRequiredQuoteToAccountRate(pair, accountCurrency)).toEqual({
        baseCurrency: expectedBase,
        quoteCurrency: expectedQuote,
      });
    },
  );

  it("does not require a live rate when a manual pip value is set", () => {
    expect(getRequiredQuoteToAccountRate("CHFJPY", "USD", true)).toBeNull();
  });

  it("returns quote and base conversion candidates for cross pairs", () => {
    expect(getPipValueRateCandidates("CHFJPY", "USD")).toEqual([
      { baseCurrency: "JPY", quoteCurrency: "USD", useAs: "quote" },
      { baseCurrency: "CHF", quoteCurrency: "USD", useAs: "base" },
    ]);
  });

  it("uses base fallback candidates for pairs whose quote is not available from the rate provider", () => {
    expect(getPipValueRateCandidates("GBPBGN", "USD")).toEqual([
      { baseCurrency: "BGN", quoteCurrency: "USD", useAs: "quote" },
      { baseCurrency: "GBP", quoteCurrency: "USD", useAs: "base" },
    ]);
  });

  it("does not return rate candidates for instruments already covered by exact or EUR/USD math", () => {
    expect(getPipValueRateCandidates("XAUUSD", "EUR")).toEqual([]);
    expect(getPipValueRateCandidates("EURJPY", "USD")).toEqual([]);
    expect(getPipValueRateCandidates("US100", "EUR")).toEqual([]);
  });
});

describe("available conversion plans", () => {
  it("retains the confirmed EUR/USD route and exposes quote/base alternates when unavailable", () => {
    expect(getPipValueConversionPlan("EURJPY", "USD")).toEqual({ usesEurUsd: true, candidates: [] });
    expect(getPipValueConversionPlan("EURJPY", "USD", false, {}, false)).toEqual({
      usesEurUsd: true,
      candidates: [
        { baseCurrency: "JPY", quoteCurrency: "USD", useAs: "quote" },
        { baseCurrency: "EUR", quoteCurrency: "USD", useAs: "base" },
      ],
    });
  });
  it.each([
    ["GER40", "EUR", false, {}],
    ["EURJPY", "EUR", false, {}],
    ["GER40", "USD", true, {}],
    ["GER40", "USD", false, { "GER40.cash": { manualPipValuePerLot: 2 } }],
  ] as const)(
    "keeps %s exact/manual valuation independent of conversion availability",
    (symbol, currency, manual, overrides) => {
      expect(getPipValueConversionPlan(symbol, currency, manual, overrides, false)).toEqual({
        usesEurUsd: false,
        candidates: [],
      });
    },
  );
});
