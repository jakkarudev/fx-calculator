import { describe, expect, it } from "vitest";
import { validateParsedSignal } from "./validate-signal";
import type { ParsedSignal } from "./types";

const validBuy: ParsedSignal = {
  pair: "EURUSD",
  side: "buy",
  orderType: "market",
  entry: 1.0845,
  stopLoss: 1.0805,
  takeProfit: 1.0925,
};

describe("validateParsedSignal", () => {
  it("accepts a buy where stop loss is below entry and take profit is above entry", () => {
    expect(validateParsedSignal(validBuy)).toEqual({ ok: true });
  });

  it("accepts a sell where stop loss is above entry and take profit is below entry", () => {
    expect(
      validateParsedSignal({
        ...validBuy,
        side: "sell",
        stopLoss: 1.0885,
        takeProfit: 1.0765,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects invalid side values that can come from manual edits", () => {
    expect(validateParsedSignal({ ...validBuy, side: "hold" as ParsedSignal["side"] })).toEqual({
      ok: false,
      message: "Side must be buy or sell.",
    });
  });

  it("rejects invalid order types that can come from manual edits", () => {
    expect(validateParsedSignal({ ...validBuy, orderType: "stop" as ParsedSignal["orderType"] })).toEqual({
      ok: false,
      message: "Order type must be market or limit.",
    });
  });

  it("rejects non-positive prices", () => {
    expect(validateParsedSignal({ ...validBuy, entry: 0 })).toEqual({
      ok: false,
      message: "Entry, stop loss, and take profit must be positive numbers.",
    });
  });

  it("rejects buy trades with stop loss above entry", () => {
    expect(validateParsedSignal({ ...validBuy, stopLoss: 1.09 })).toEqual({
      ok: false,
      message: "For buy trades, stop loss must be below entry and take profit must be above entry.",
    });
  });

  it("rejects sell trades with take profit above entry", () => {
    expect(
      validateParsedSignal({
        ...validBuy,
        side: "sell",
        stopLoss: 1.09,
        takeProfit: 1.1,
      }),
    ).toEqual({
      ok: false,
      message: "For sell trades, stop loss must be above entry and take profit must be below entry.",
    });
  });
});
