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

describe("crypto signal imports", () => {
  beforeEach(() => {
    preferencesStore.clear();
    vi.clearAllMocks();
    clearExchangeRateCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({ accountBalance: 10000, riskPercent: 1, accountCurrency: "USD" }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["BTC/USD.pro", "BTCUSD", "60000.00", "58800.00", "62400.00", "0.08"],
    ["ETH/USD", "ETHUSD", "3000.00", "2920.00", "3160.00", "0.12"],
    ["GALAUSD", "GALUSD", "0.02500", "0.02100", "0.03300", "0.02"],
  ])("imports and successfully copies %s using its contract", async (alias, canonical, entry, sl, tp, lot) => {
    const user = userEvent.setup();
    render(<App />);
    const tab = screen.queryByRole("button", { name: "Import signal" });
    if (tab) await user.click(tab);
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: `${alias} BUY\nENTRY ${entry}\nSL ${sl}\nTP ${tp}` },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByDisplayValue(canonical)).toBeInTheDocument();
    for (const [name, value] of [
      ["Entry", entry],
      ["Stop loss", sl],
      ["Take profit", tp],
      ["Lot size", lot],
    ]) {
      await user.click(screen.getByRole("button", { name: `Copy ${name}` }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
    }
    expect(JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0].original.pair).toBe(canonical);
    fireEvent.change(screen.getByLabelText("Entry"), {
      target: { value: canonical === "GALUSD" ? "0.02600" : canonical === "ETHUSD" ? "3100.00" : "61000.00" },
    });
    await user.click(await screen.findByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({
      string: canonical === "GALUSD" ? "0.02600" : canonical === "ETHUSD" ? "3100.00" : "61000.00",
    });
  });

  it.each([
    ["BTCUSD", "60000.00", "58800.00", "62400.00", "60001.00", "58799.00", "62401.00", "0.10"],
    ["GALUSD", "0.02500", "0.02100", "0.03300", "0.02502", "0.02098", "0.03302", "0.03"],
  ])(
    "copies precise adjusted %s and preserves original prices in history",
    async (instrument, entry, sl, tp, adjustedEntry, adjustedSl, adjustedTp, lot) => {
      preferencesStore.set(
        "fxcalc.settings",
        JSON.stringify({
          accountBalance: 10000,
          riskPercent: 1,
          accountCurrency: "EUR",
          eurUsdRate: 1.25,
          priceAdjustmentEnabled: true,
        }),
      );
      const user = userEvent.setup();
      render(<App />);
      const tab = screen.queryByRole("button", { name: "Import signal" });
      if (tab) await user.click(tab);
      fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
        target: { value: `${instrument} BUY\nENTRY ${entry}\nSL ${sl}\nTP ${tp}` },
      });
      await user.click(screen.getByRole("button", { name: "Parse signal" }));
      await screen.findByDisplayValue(instrument);
      for (const [name, value] of [
        ["Entry", adjustedEntry],
        ["Stop loss", adjustedSl],
        ["Take profit", adjustedTp],
        ["Lot size", lot],
      ]) {
        await user.click(await screen.findByRole("button", { name: `Copy ${name}` }));
        expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
      }
      const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
      expect(saved.original.priceText.entry).toBe(entry);
      expect(saved.adjusted.priceText.entry).toBe(adjustedEntry);
    },
  );

  it.each(["fixed", "signal-relative"])("copies a safe reduced wide-stop trade in %s mode", async (mode) => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({
        accountBalance: 20000,
        riskPercent: 1,
        accountCurrency: "USD",
        priceAdjustmentEnabled: true,
        priceAdjustmentMode: mode,
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    const tab = screen.queryByRole("button", { name: "Import signal" });
    if (tab) await user.click(tab);
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: "DOGEUSD BUY\nENTRY 0.15000\nSL 0.00010\nTP 0.45000" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    await screen.findByDisplayValue("DOGEUSD");
    for (const [name, value] of [
      ["Entry", "0.15007"],
      ["Stop loss", "0.00003"],
      ["Take profit", "0.45008"],
      ["Lot size", "0.01"],
    ]) {
      expect(await screen.findByText(value, { selector: "p.text-lg" })).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: `Copy ${name}` }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
    }
    expect(screen.getByText(/Actual risk 150.04/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show original values" }));
    expect(screen.getByText(/Actual risk 149.90/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Stop loss" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.00010" });
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
    expect(saved.original.priceText).toEqual({ entry: "0.15000", stopLoss: "0.00010", takeProfit: "0.45000" });
    expect(saved.original.actualRiskAmount).toBeCloseTo(149.9);
    expect(saved.adjusted.actualRiskAmount).toBeCloseTo(150.04);
  });

  it("displays and copies the original when every candidate crosses zero", async () => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({
        accountBalance: 20000,
        riskPercent: 1,
        accountCurrency: "USD",
        priceAdjustmentEnabled: true,
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    const tab = screen.queryByRole("button", { name: "Import signal" });
    if (tab) await user.click(tab);
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: "DOGEUSD BUY\nENTRY 0.15000\nSL 0.000001\nTP 0.45000" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    await screen.findByDisplayValue("DOGEUSD");
    expect(await screen.findByText(/Actual risk 150.00/)).toBeInTheDocument();
    for (const [name, value] of [
      ["Entry", "0.15000"],
      ["Stop loss", "0.000001"],
      ["Take profit", "0.45000"],
      ["Lot size", "0.01"],
    ]) {
      expect(screen.getByText(value, { selector: "p.text-lg" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: `Copy ${name}` }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
    }
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
    expect(saved.original.priceText.stopLoss).toBe("0.000001");
    expect(saved.adjusted).toBeNull();
  });

  it("recognizes a low-price screenshot then copies an editable correction", async () => {
    recognizeTextFromImageFile.mockResolvedValue("DOGEUSD BUY\nENTRY 0.15000\nSL 0.14300\nTP 0.16400");
    const user = userEvent.setup();
    render(<App />);
    const tab = screen.queryByRole("button", { name: "Import signal" });
    if (tab) await user.click(tab);
    await user.upload(
      await screen.findByLabelText("Signal screenshot image"),
      new File(["image"], "crypto.png", { type: "image/png" }),
    );
    expect(await screen.findByDisplayValue("DOGEUSD")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "0.15100" } });
    await user.click(await screen.findByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.12" });
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.15100" });
  });
});
