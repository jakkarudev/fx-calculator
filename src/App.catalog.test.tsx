import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const preferencesStore = vi.hoisted(() => new Map<string, string>());
const recognizeTextFromImageFile = vi.hoisted(() => vi.fn());
const capacitorHttpGet = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: vi.fn(),
    read: vi.fn().mockResolvedValue({ value: "" }),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: preferencesStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
  },
  CapacitorHttp: {
    get: capacitorHttpGet,
  },
}));

vi.mock("@/lib/ocr", () => ({
  recognizeTextFromImageFile,
}));

import { Clipboard } from "@capacitor/clipboard";
import App from "./App";
import { clearExchangeRateCache } from "@/lib/fx-rates";
import { signalHistoryPreferenceKey } from "@/features/calculator/signal-history";

describe("FTMO catalog imports", () => {
  beforeEach(() => {
    preferencesStore.clear();
    vi.clearAllMocks();
    clearExchangeRateCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it.each([
    ["XPT/USD", "XPTUSD", "1000.00", "990.00", "1020.00", "0.01"],
    ["DAX", "GER40.cash", "20000.20", "19950.20", "20100.20", "0.10"],
    ["EUR/CZK", "EURCZK", "25.0000", "24.9000", "25.2000", "0.02"],
  ])("imports %s through calculated price and lot copying", async (alias, canonical, entry, sl, tp, lot) => {
    if (canonical === "GER40.cash") preferencesStore.set("fxcalc.settings", JSON.stringify({ eurUsdRate: 1.16 }));
    if (canonical === "EURCZK") preferencesStore.set("fxcalc.settings", JSON.stringify({ manualPipValuePerLot: 5 }));
    const user = userEvent.setup();
    render(<App />);
    const importTab = screen.queryByRole("button", { name: "Import signal" });
    if (importTab) await user.click(importTab);
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: `${alias} BUY\nENTRY ${entry}\nSL ${sl}\nTP ${tp}` },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByDisplayValue(canonical)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: entry });
    await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: lot });
    expect(JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0].original.pair).toBe(canonical);
  });

  it("imports a multiline short index alias into current copies and saved history", async () => {
    preferencesStore.set("fxcalc.settings", JSON.stringify({ accountBalance: 10000, riskPercent: 1 }));
    const rawSignal = "YM\nBUY\nENTRY 80\nSL 78\nTP 84";
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), { target: { value: rawSignal } });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByDisplayValue("US30")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "80" });
    await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "50.00" });
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].original).toMatchObject({ pair: "US30", side: "buy", entry: 80, stopLoss: 78, takeProfit: 84 });
    expect(saved[0].rawSignal).toBe(rawSignal);
  });

  it("copies fractional adjusted index prices from a whole-number import", async () => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({
        accountCurrency: "EUR",
        accountBalance: 10000,
        priceAdjustmentEnabled: true,
        priceAdjustmentPips: 0.1,
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    const importTab = screen.queryByRole("button", { name: "Import signal" });
    if (importTab) await user.click(importTab);
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: "GER40.cash BUY\nENTRY 20000\nSL 19950\nTP 20100" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    await screen.findByDisplayValue("GER40.cash");
    for (const [name, value] of [
      ["Entry", "20000.1"],
      ["Stop loss", "19949.9"],
      ["Take profit", "20100.1"],
    ]) {
      await user.click(screen.getByRole("button", { name: `Copy ${name}` }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
    }
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
    expect(saved.original.priceText.entry).toBe("20000");
    expect(saved.adjusted.priceText.entry).toBe("20000.1");
  });

  it.each(["EURUS", "", "UNSUPPORTED"])(
    "keeps an invalid instrument %s editable and recovers after correction",
    async (pair) => {
      const user = userEvent.setup();
      render(<App />);
      const importTab = screen.queryByRole("button", { name: "Import signal" });
      if (importTab) await user.click(importTab);
      const instrument = await screen.findByDisplayValue("EURUSD");
      fireEvent.change(instrument, { target: { value: pair } });
      expect(instrument).toHaveValue(pair);
      expect(screen.getByLabelText("Entry")).toHaveValue("");
      const fillPrices = () => {
        fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08450" } });
        fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.08050" } });
        fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "1.09250" } });
      };
      fillPrices();
      expect(screen.getByText(pair ? /Unsupported instrument/ : /Pair is required/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy Entry" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Open settings" }));
      expect(screen.getByText("Select a supported instrument to edit its lot rules.")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close settings" }));
      fireEvent.change(instrument, { target: { value: "EURUSD" } });
      fillPrices();
      await user.click(await screen.findByRole("button", { name: "Copy Entry" }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
    },
  );

  it("reads platinum from a screenshot and copies the sourced price precision", async () => {
    const user = userEvent.setup();
    recognizeTextFromImageFile.mockResolvedValue("XPT/USD BUY\nENTRY 1000.00\nSL 990.00\nTP 1020.00");
    render(<App />);
    const importTab = screen.queryByRole("button", { name: "Import signal" });
    if (importTab) await user.click(importTab);
    const file = new File(["image"], "platinum.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText("Signal screenshot image"), file);
    expect(await screen.findByDisplayValue("XPTUSD")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1000.00" });
    await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.01" });
  });
});
