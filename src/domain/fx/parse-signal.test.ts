import { describe, expect, it } from "vitest";
import { parseSignal } from "./parse-signal";

describe("parseSignal", () => {
  it("parses a standard buy signal", () => {
    expect(parseSignal("EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250")).toMatchObject({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
    });
  });

  it("parses slash pair variants", () => {
    expect(parseSignal("BUY EUR/USD @ 1.08450\nStop Loss 1.08050\nTake Profit 1.09250")).toMatchObject({
      pair: "EURUSD",
      side: "buy",
      orderType: "market",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
    });
  });

  it("detects buy limit when limit appears next to buy", () => {
    expect(parseSignal("EURUSD BUY LIMIT\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250")).toMatchObject({
      pair: "EURUSD",
      side: "buy",
      orderType: "limit",
      entry: 1.0845,
      stopLoss: 1.0805,
      takeProfit: 1.0925,
    });
  });

  it("detects sell limit when limit appears next to sell", () => {
    expect(parseSignal("Sell Limit GBP/USD @ 1.27000\nSL 1.27400\nTP1 1.26200")).toMatchObject({
      pair: "GBPUSD",
      side: "sell",
      orderType: "limit",
      entry: 1.27,
      stopLoss: 1.274,
      takeProfit: 1.262,
    });
  });

  it("detects long signals as buy-side trades", () => {
    expect(parseSignal("XAUUSD LONG\nENTRY: 2020.50\nSL: 2019.50\nTP: 2022.50")).toMatchObject({
      pair: "XAUUSD",
      side: "buy",
      orderType: "market",
      entry: 2020.5,
      stopLoss: 2019.5,
      takeProfit: 2022.5,
    });
  });

  it("detects short signals as sell-side trades", () => {
    expect(parseSignal("US100 SHORT\nENTRY: 19000\nSL: 19050\nTP: 18900")).toMatchObject({
      pair: "US100",
      side: "sell",
      orderType: "market",
      entry: 19000,
      stopLoss: 19050,
      takeProfit: 18900,
    });
  });

  it("ignores pip notes on the stop loss line", () => {
    expect(
      parseSignal(`📊 𝗙𝗢𝗥𝗘𝗫 𝗦𝗜𝗚𝗡𝗔𝗟 — CHF/JPY 🔻 SELL NOW
━━━━━━━━━━━━━━━━━━
💱 PAIR: CHFJPY
📉 TYPE: SELL NOW
🎯 ENTRY: 202.904
🛑 SL: 203.500  (60 pips)
💰 TP: 201.600
━━━━━━━━━━━━━━━━━━
⚖️ R:R ~1 : 2.19
🔸 RISK: 1% ανά trade
✅ STATUS: Placed ⏳`),
    ).toMatchObject({
      pair: "CHFJPY",
      side: "sell",
      orderType: "market",
      entry: 202.904,
      stopLoss: 203.5,
      takeProfit: 201.6,
    });
  });

  it("parses US100 index signals", () => {
    expect(parseSignal("US100 BUY\nENTRY: 19000\nSL: 18950\nTP: 19100")).toMatchObject({
      pair: "US100",
      side: "buy",
      orderType: "market",
      entry: 19000,
      stopLoss: 18950,
      takeProfit: 19100,
    });
  });

  it("maps NASDAQ signals to US100", () => {
    expect(parseSignal("NASDAQ SELL\nENTRY: 19000\nSL: 19050\nTP: 18800")).toMatchObject({
      pair: "US100",
      side: "sell",
      orderType: "market",
      entry: 19000,
      stopLoss: 19050,
      takeProfit: 18800,
    });
  });

  it.each(["BUY", "SELL", "LONG", "SHORT"])("preserves the short YM alias on a separate %s line", (direction) => {
    for (const header of [`YM\n${direction}`, `${direction}\nYM`, `${direction} LIMIT\nYM`, `YM\n${direction} LIMIT`]) {
      expect(parseSignal(`${header}\nENTRY 80\nSL 78\nTP 84`)).toMatchObject({
        pair: "US30",
        side: /BUY|LONG/.test(direction) ? "buy" : "sell",
        orderType: header.includes("LIMIT") ? "limit" : "market",
      });
    }
  });

  it("maps GOLD signals to XAUUSD", () => {
    expect(parseSignal("GOLD BUY\nENTRY: 2020.50\nSL: 2019.50\nTP: 2022.50")).toMatchObject({
      pair: "XAUUSD",
      side: "buy",
      orderType: "market",
      entry: 2020.5,
      stopLoss: 2019.5,
      takeProfit: 2022.5,
    });
  });

  it("maps SILVER signals to XAGUSD", () => {
    expect(parseSignal("SILVER SELL\nENTRY: 30.250\nSL: 30.350\nTP: 30.050")).toMatchObject({
      pair: "XAGUSD",
      side: "sell",
      orderType: "market",
      entry: 30.25,
      stopLoss: 30.35,
      takeProfit: 30.05,
    });
  });

  it("parses lowercase slash forex pairs", () => {
    expect(parseSignal("aud/nzd buy\nentry: 1.08200\nsl: 1.07900\ntp: 1.08800")).toMatchObject({
      pair: "AUDNZD",
      side: "buy",
      orderType: "market",
      entry: 1.082,
      stopLoss: 1.079,
      takeProfit: 1.088,
    });
  });

  it("ignores non-pair words before a valid forex symbol", () => {
    expect(parseSignal("FOREX SIGNAL - USDTRY SELL\nENTRY: 32.100\nSL: 32.250\nTP: 31.800")).toMatchObject({
      pair: "USDTRY",
      side: "sell",
      orderType: "market",
      entry: 32.1,
      stopLoss: 32.25,
      takeProfit: 31.8,
    });
  });

  it("parses signals that use Greek homoglyphs in labels", () => {
    expect(
      parseSignal(`ΡΑIR: ΟCHFJPY

ΤΥΡΕ: SELL NΟW

ΕΝTRY: 202.904

SL: 203.500 (60 pips)

ΤΡ: 201.600

R:R~1: 2.19

RISK: 1% ανά trade

STATUS: Placed`),
    ).toMatchObject({
      pair: "CHFJPY",
      side: "sell",
      orderType: "market",
      entry: 202.904,
      stopLoss: 203.5,
      takeProfit: 201.6,
    });
  });

  it("preserves trailing zeros from parsed price text", () => {
    expect(parseSignal("CHFJPY SELL\nENTRY: 202.904\nSL: 203.500 (60 pips)\nTP: 201.600")).toMatchObject({
      entry: 202.904,
      stopLoss: 203.5,
      takeProfit: 201.6,
      priceText: {
        entry: "202.904",
        stopLoss: "203.500",
        takeProfit: "201.600",
      },
    });
  });

  it("ignores point notes on index stop loss and take profit lines", () => {
    expect(
      parseSignal(`INSTRUMENT: US30

ΤΥΡΕ: SELL NOW

ENTRY: 50702.80

SL: 51200.00 (497 points)

TP: 49650.00 (1053 points)

R:R ~1: 2.12

RISK: 1% avá trade

STATUS: Placed`),
    ).toMatchObject({
      pair: "US30",
      side: "sell",
      orderType: "market",
      entry: 50702.8,
      stopLoss: 51200,
      takeProfit: 49650,
      priceText: {
        entry: "50702.80",
        stopLoss: "51200.00",
        takeProfit: "49650.00",
      },
    });
  });

  it("ignores chat and chart numbers before the signal entry in OCR text", () => {
    expect(
      parseSignal(`ApexHub
14
ApexHub
11:49
SIGNALS
Pinned message
166 messages
ApexHub SIGNALS - lúç Aeitoupyei Eõw Ba aveßai...
1 TradingVlew
M FOREX sIGÍAerdzDCA
SELL NOW
S PAIR: NZDCAD
TYPE: SELL NOW
ENTRY: 0.81263
SL: 0.81780 (52 pips)
S TP: 0.80160
AL R:R~1:2.13
RISK: 1% avå trade
STATUS: PlacedX
() 4G+AA87%
<H TɛLapxia oto TÀáVO ɛivaL auTó
Kilitidisioannis created with Tradingview.com, Jun 10, 2026 02:49 UTC+3
Owner edited 18:44
Dow Jones industrial Average Index 1h- Capital.com 050,704.6 H50,722.4 L50,668.9 C50,699.0 -4.7 (-0.01%)
EMA 50/no0 50,884.9
The topic is closed
USD
52.000.0
51,800.0
51,600.0
51,400.0`),
    ).toMatchObject({
      pair: "NZDCAD",
      side: "sell",
      orderType: "market",
      entry: 0.81263,
      stopLoss: 0.8178,
      takeProfit: 0.8016,
      priceText: {
        entry: "0.81263",
        stopLoss: "0.81780",
        takeProfit: "0.80160",
      },
    });
  });
});

describe("commodity instrument declarations", () => {
  it.each(["WTI BUY", "BUY WTI", "SYMBOL: WTI\nTYPE BUY", "PAIR: USOIL.cash\nTYPE BUY", "INSTRUMENT: WTI\nTYPE BUY"])(
    "uses %s ahead of incidental commodity names",
    (header) => {
      expect(
        parseSignal(`Natural gas is volatile today\n${header}\nENTRY 80\nSL 78\nTP 84\nHeating oil outlook`).pair,
      ).toBe("USOIL.cash");
    },
  );

  it("does not let a preceding commodity line override an instrument beside the direction", () => {
    expect(parseSignal("Natural gas\nBUY WTI\nENTRY 80\nSL 78\nTP 84").pair).toBe("USOIL.cash");
  });

  it("does not promote a commodity name inside prose before a separate direction", () => {
    expect(() => parseSignal("Outlook for Natural gas\nBUY\nENTRY 80\nSL 78\nTP 84")).toThrow();
  });

  it("keeps unsupported declarations blocking multiline fallback", () => {
    expect(() => parseSignal("SYMBOL: OILFAKE\nENTRY 80\nYM\nBUY\nSL 78\nTP 84")).toThrow();
  });

  it("prefers an explicit symbol over another direction-adjacent mention", () => {
    expect(parseSignal("Natural gas BUY outlook\nSYMBOL: WTI\nTYPE BUY\nENTRY 80\nSL 78\nTP 84").pair).toBe(
      "USOIL.cash",
    );
  });

  it.each([
    ["Natural gas.pro", "NATGAS.cash"],
    ["Heating oil.raw", "HEATOIL.c"],
    ["West Texas Intermediate_std", "USOIL.cash"],
  ])("recognizes decorated %s in signal context", (alias, instrument) => {
    for (const header of [`${alias} BUY`, `BUY ${alias}`, `SYMBOL: ${alias}\nTYPE BUY`]) {
      expect(parseSignal(`${header}\nENTRY 80\nSL 78\nTP 84`).pair).toBe(instrument);
    }
  });

  it.each(["Natural gas.FAKE", "Heating oil_FAKE", "West Texas Intermediate.pro.FAKE"])(
    "rejects unsupported decoration %s",
    (alias) => expect(() => parseSignal(`${alias} BUY\nENTRY 80\nSL 78\nTP 84`)).toThrow(),
  );

  it("does not treat incidental commodity prose as an instrument declaration", () => {
    expect(() => parseSignal("Natural gas is volatile today\nTYPE BUY\nENTRY 80\nSL 78\nTP 84")).toThrow();
  });
});

describe("instrument occurrence context", () => {
  it.each([
    ["BUY\nEURUSD", "EURUSD"],
    ["EURUSD\nSELL LIMIT", "EURUSD"],
    ["SYMBOL: ΟCHFJPY\nTYPE BUY", "CHFJPY"],
    ["EURUSD prose\nBUY GBPUSD", "GBPUSD"],
    ["SYMBOL: GBPUSD\nEURUSD BUY", "GBPUSD"],
  ])("keeps local direction and declaration precedence for %s", (header, instrument) => {
    expect(parseSignal(`${header}\nENTRY 200\nSL 195\nTP 210`).pair).toBe(instrument);
  });
  it("blocks incidental fallback when the declared full symbol is unsupported", () => {
    expect(() => parseSignal("SYMBOL: EURUSD-FAKE\nBUY GBPUSD\nENTRY 200\nSL 195\nTP 210")).toThrow();
  });
});
