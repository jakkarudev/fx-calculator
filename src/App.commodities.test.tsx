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

describe("commodity imports", () => {
  beforeEach(() => {
    preferencesStore.clear();
    vi.clearAllMocks();
    clearExchangeRateCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
    preferencesStore.set("fxcalc.settings", JSON.stringify({ accountBalance: 10000, riskPercent: 1 }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it.each([
    ["WTI", "USOIL.cash", "80.000", "78.000", "84.000", "0.50"],
    ["Brent", "UKOIL.cash", "85.000", "83.000", "89.000", "0.50"],
    ["Coffee", "COFFEE.c", "300.00", "295.00", "310.00", "20.00"],
  ])("imports %s into current copies and saved source text", async (alias, instrument, entry, sl, tp, lot) => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: `${alias} BUY\nENTRY ${entry}\nSL ${sl}\nTP ${tp}` },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByDisplayValue(instrument)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: entry });
    await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: lot });
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
    expect(saved.original.pair).toBe(instrument);
    expect(saved.rawSignal).toContain(`${alias} BUY`);
    fireEvent.change(screen.getByLabelText("Instrument"), { target: { value: "OILFAKE" } });
    expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
  });
  it.each(["WTI BUY", "SYMBOL: WTI\nTYPE BUY", "PAIR: USOIL.cash\nTYPE BUY"])(
    "copies the declared WTI contract for %s with incidental gas prose",
    async (header) => {
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "Import signal" }));
      fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
        target: { value: `${header}\nENTRY 80.000\nSL 78.000\nTP 84.000\nNatural gas is volatile today` },
      });
      await user.click(screen.getByRole("button", { name: "Parse signal" }));
      expect(await screen.findByDisplayValue("USOIL.cash")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.50" });
      expect(JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0].original.pair).toBe("USOIL.cash");
    },
  );
  it("recognizes natural gas OCR and copies EUR sizing", async () => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({ accountCurrency: "EUR", accountBalance: 10000, riskPercent: 1, eurUsdRate: 1.25 }),
    );
    recognizeTextFromImageFile.mockResolvedValue("Natural gas.pro BUY\nENTRY 3.000\nSL 2.900\nTP 3.200");
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    await user.upload(
      await screen.findByLabelText("Signal screenshot image"),
      new File(["image"], "gas.png", { type: "image/png" }),
    );
    expect(await screen.findByDisplayValue("NATGAS.cash")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.25" });
  });
  it("shows original and adjusted commodity prices and copies the precise current result", async () => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({
        accountBalance: 10000,
        riskPercent: 1,
        priceAdjustmentEnabled: true,
        priceAdjustmentMode: "signal-relative",
        priceAdjustmentStrength: "normal",
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
      target: { value: "NATGAS.cash BUY\nENTRY 3\nSL 2.9\nTP 3.2" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    await screen.findByDisplayValue("NATGAS.cash");
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "3.002" });
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
    expect(saved.original.entry).toBe(3);
    expect(saved.adjusted.entry).toBe(3.002);
    expect(screen.getByText("Adjusted values")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show original values" }));
    expect(screen.getByText("Original values")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "3" });
    await user.click(screen.getByRole("button", { name: "Show adjusted values" }));
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "3.002" });
    expect(JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")).toHaveLength(1);
  });
});
