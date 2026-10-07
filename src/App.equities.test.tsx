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

describe("equity import to copy", () => {
  beforeEach(() => {
    preferencesStore.clear();
    clearExchangeRateCache();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ date: "2026-10-07", rate: 1.25 }) }),
    );
    vi.clearAllMocks();
    recognizeTextFromImageFile.mockReset();
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({ accountBalance: 10000, riskPercent: 1, eurUsdRate: 1.25, priceAdjustmentEnabled: false }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openImport() {
    const view = render(<App />);
    const importTab = screen.queryByRole("button", { name: "Import signal" });
    if (importTab) await userEvent.click(importTab);
    await screen.findByPlaceholderText(/EURUSD BUY/i);
    return view;
  }

  it.each([
    ["brk.b.pro", "BRK.B", "USD", "20.00"],
    ["BUY $T.raw", "T", "USD", "20.00"],
    ["#fb", "META", "EUR", "25.00"],
    ["TTE", "TTE", "USD", "16.00"],
    ["V", "V", "USD", "20.00"],
  ])("imports %s, displays and copies its %s contract result", async (header, canonical, currency, lot) => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({
        accountBalance: 10000,
        accountCurrency: currency,
        riskPercent: 1,
        eurUsdRate: 1.25,
        priceAdjustmentEnabled: false,
      }),
    );
    const user = userEvent.setup();
    await openImport();
    const rawSignal = `${header} BUY\nENTRY 200.00\nSL 195.00\nTP 210.00`;
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/i), { target: { value: rawSignal } });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByDisplayValue(canonical)).toBeInTheDocument();
    expect(await screen.findByText(lot)).toBeInTheDocument();
    expect(screen.getByText(`${currency} 10000.00 risk 1.00%`)).toBeInTheDocument();
    for (const [name, value] of [
      ["Entry", "200.00"],
      ["Stop loss", "195.00"],
      ["Take profit", "210.00"],
      ["Lot size", lot],
    ]) {
      await user.click(screen.getByRole("button", { name: `Copy ${name}` }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
    }
    const history = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
    expect(history).toHaveLength(1);
    expect(history[0].origin).toBe("imported");
    expect(history[0].original).toMatchObject({
      pair: canonical,
      lotSize: Number(lot),
      actualRiskAmount: 100,
      rewardAmount: 200,
      priceText: { entry: "200.00" },
    });
    expect(history[0].rawSignal).toBe(rawSignal);
  });

  it.each(["T noted; BUY T.FAKE", "BRK.B mentioned; BUY BRK.B.fake", "SYMBOL: T-FAKE BUY"])(
    "rejects unsupported full symbols without exposing copy results: %s",
    async (header) => {
      await openImport();
      fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/i), {
        target: { value: `${header}\nENTRY 200\nSL 195\nTP 210` },
      });
      await userEvent.click(screen.getByRole("button", { name: "Parse signal" }));
      expect(await screen.findByText(/Could not parse signal/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
      expect(Clipboard.write).not.toHaveBeenCalled();
      expect(preferencesStore.has(signalHistoryPreferenceKey)).toBe(false);
    },
  );

  it("corrects a short dotted OCR trade and saves only valid current results", async () => {
    recognizeTextFromImageFile.mockResolvedValue("#brk.b.std SELL\nENTRY 200.00\nSL 205.00\nTP 190.00");
    const user = userEvent.setup();
    await openImport();
    await user.upload(
      screen.getByLabelText("Signal screenshot image"),
      new File(["image"], "equity.png", { type: "image/png" }),
    );
    expect(await screen.findByDisplayValue("BRK.B")).toBeInTheDocument();
    expect(screen.getByText("SHORT")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "206.00" } });
    expect(await screen.findByText("16.66")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Stop loss" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "206.00" });
    await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "16.66" });
    const history = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
    expect(history).toHaveLength(1);
    expect(history[0].origin).toBe("imported");
    expect(history[0].original).toMatchObject({ pair: "BRK.B", side: "sell", stopLoss: 206 });
    expect(history[0].original.actualRiskAmount).toBeCloseTo(99.96);
    expect(history[0].rawSignal).toContain("SL 205.00");
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "199.00" } });
    expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
    expect(JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")).toHaveLength(1);
  });

  it("preserves SAN original precision alongside safely adjusted copied prices", async () => {
    preferencesStore.set(
      "fxcalc.settings",
      JSON.stringify({
        accountBalance: 10000,
        accountCurrency: "EUR",
        priceAdjustmentEnabled: true,
        priceAdjustmentMode: "signal-relative",
        priceAdjustmentProfile: "shift",
      }),
    );
    const user = userEvent.setup();
    await openImport();
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/i), {
      target: { value: "SAN BUY\nENTRY 4.0000\nSL 3.0000\nTP 6.0000" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    await screen.findByDisplayValue("SAN");
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "4.0010" });
    const saved = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")[0];
    expect(saved.original.priceText.entry).toBe("4.0000");
    expect(saved.adjusted.priceText.entry).toBe("4.0010");
    expect(saved.adjusted.lotSize).toBe(100);
    expect(saved.adjusted.actualRiskAmount).toBeCloseTo(100);
    expect(saved.adjusted.rr).toBeCloseTo(2);
    expect(screen.getByText("Original entry 4.0000")).toBeInTheDocument();
    expect(screen.getByText("Adjusted entry 4.0010")).toBeInTheDocument();
  });
});
