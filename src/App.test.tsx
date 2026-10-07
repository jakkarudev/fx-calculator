import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

import { clearExchangeRateCache } from "@/lib/fx-rates";
import { Clipboard } from "@capacitor/clipboard";
import App from "./App";
import type { PositionResult } from "@/domain/fx/types";
import { createSignalHistoryEntry, signalHistoryPreferenceKey } from "@/features/calculator/signal-history";

const historyOriginalResult: PositionResult = {
  pair: "EURUSD",
  side: "buy",
  orderType: "market",
  entry: 1.0845,
  stopLoss: 1.0805,
  takeProfit: 1.0925,
  priceText: {
    entry: "1.08450",
    stopLoss: "1.08050",
    takeProfit: "1.09250",
  },
  pipSize: 0.0001,
  stopPips: 40,
  rewardPips: 80,
  rr: 2,
  riskAmount: 10,
  rewardAmount: 24,
  pipValuePerLot: 10,
  pipValueMode: "exact",
  rawLotSize: 0.025,
  lotSize: 0.03,
  actualRiskAmount: 12,
  actualRiskPercent: 1.2,
  actualRiskExceedsTarget: true,
  accountCurrency: "USD",
};

async function renderImportApp() {
  const view = render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "Import signal" }));
  return view;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  beforeEach(() => {
    preferencesStore.clear();
    recognizeTextFromImageFile.mockReset();
    capacitorHttpGet.mockReset();
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearExchangeRateCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
  });

  it.each([
    ["EUR/USD", "EURUSD", "1.08450", "1.08050", "1.09250", "0.02"],
    ["GOLD", "XAUUSD", "2020.50", "2019.50", "2022.50", "0.10"],
    ["SILVER", "XAGUSD", "25.00", "24.80", "25.40", "0.01"],
    ["NAS100", "US100", "19000", "18950", "19100", "0.20"],
    ["DOW", "US30", "40000", "39900", "40200", "0.10"],
  ])(
    "imports %s and copies its calculated lot using instrument defaults",
    async (alias, symbol, entry, sl, tp, lot) => {
      const user = userEvent.setup();
      await renderImportApp();
      fireEvent.change(await screen.findByPlaceholderText(/EURUSD BUY/i), {
        target: { value: `${alias} BUY\nEntry: ${entry}\nSL: ${sl}\nTP: ${tp}` },
      });
      await user.click(screen.getByRole("button", { name: "Parse signal" }));
      expect(await screen.findByDisplayValue(symbol)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Copy Lot size" }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: lot });
      const history = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
      expect(history[0].original.pair).toBe(symbol);
      expect(history[0].original.lotSize).toBe(Number(lot));
    },
  );

  it("restores corrected prices independently from source text and recalculates edits automatically", async () => {
    preferencesStore.set(
      "fxcalc.draft",
      JSON.stringify({
        rawSignal: "original source text",
        parsed: {
          pair: "EURUSD",
          side: "buy",
          orderType: "market",
          entry: 1.1,
          stopLoss: 1.09,
          takeProfit: 1.12,
          priceText: { entry: "1.10000", stopLoss: "1.09000", takeProfit: "1.12000" },
        },
      }),
    );
    const user = userEvent.setup();
    await renderImportApp();
    expect(await screen.findByDisplayValue("1.10000")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.10500" } });
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.10500" });
    expect(screen.getByPlaceholderText(/EURUSD BUY/i)).toHaveValue("original source text");
    expect(JSON.parse(preferencesStore.get("fxcalc.draft") ?? "{}").parsed.entry).toBe(1.105);
  });

  it("renders the calculator title", async () => {
    await renderImportApp();
    expect(await screen.findByText("Position size")).toBeInTheDocument();
  });

  it("lets the user switch account currency to EUR", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "EUR" }));

    expect(await screen.findByText("EUR 1000.00 risk 1.00%")).toBeInTheDocument();
  });

  it("lets the user clear and replace a numeric settings value", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));

    const riskInput = screen.getByLabelText("Risk percent");
    await user.clear(riskInput);
    expect(riskInput).toHaveValue(null);

    await user.type(riskInput, "0.2");
    expect(riskInput).toHaveValue(0.2);

    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    expect(await screen.findByText("USD 1000.00 risk 0.20%")).toBeInTheDocument();
  });

  it("shows adjusted and original values when price adjustment is enabled", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(await screen.findByText("Adjusted values")).toBeInTheDocument();
    expect(screen.getByText("1.08460")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show original values" }));

    expect(screen.getByText("Original values")).toBeInTheDocument();
    expect(screen.getByText("1.08450")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show adjusted values" })).toBeInTheDocument();
  });

  it("lets the user configure fixed-pip keep-risk price adjustment", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    const adjustmentInput = screen.getByLabelText("Adjustment pips");
    fireEvent.change(adjustmentInput, { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(await screen.findByText("Adjusted values")).toBeInTheDocument();
    expect(screen.getByText("1.08470")).toBeInTheDocument();
  });

  it("lets the user use signal-relative shift price adjustment", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await user.click(screen.getByRole("button", { name: "Signal-relative" }));
    await user.click(screen.getByRole("button", { name: "Shift setup" }));
    expect(screen.queryByLabelText("Adjustment pips")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Shift setup" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(await screen.findByText("Adjusted values")).toBeInTheDocument();
    expect(screen.getByText("1.08464")).toBeInTheDocument();
    expect(screen.getByText("1.08064")).toBeInTheDocument();
    expect(screen.getByText("1.09264")).toBeInTheDocument();
  });

  it("lets the user preserve RR with the keep-RR adjustment profile", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await user.click(screen.getByRole("button", { name: "Signal-relative" }));
    await user.click(screen.getByRole("button", { name: "Keep RR" }));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(await screen.findByText("Adjusted values")).toBeInTheDocument();
    expect(screen.getByText("1.08464")).toBeInTheDocument();
    expect(screen.getByText("1.08036")).toBeInTheDocument();
    expect(screen.getByText("1.09320")).toBeInTheDocument();
    expect(screen.getByText(/RR 2.00/)).toBeInTheDocument();
  });

  it("shows actual risk when lot rounding changes exposure", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    fireEvent.change(screen.getByLabelText("Account balance"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Default minimum lot"), { target: { value: "0.1" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(await screen.findByText(/Actual risk 40.00/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Actual risk is above your target because the minimum lot size is larger than the calculated safe lot.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the take profit reward amount for the rounded lot size", async () => {
    await renderImportApp();

    expect(await screen.findByText("Reward 16.00 USD")).toBeInTheDocument();
  });

  it("uses instrument lot defaults and allows active-symbol overrides", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    fireEvent.change(await screen.findByLabelText("Instrument"), { target: { value: "NAS100" } });
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "19000" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "18950" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "19100" } });

    expect(await screen.findByText("US100 step 0.10 min 0.10")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Open settings"));
    fireEvent.change(screen.getByLabelText("US100 lot step"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("US100 minimum lot"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(await screen.findByText("US100 step 1.00 min 2.00")).toBeInTheDocument();
    expect(screen.getByText("Using manual instrument override")).toBeInTheDocument();
  });

  it("labels manual parsed value inputs and closes settings with Escape", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    expect(await screen.findByLabelText("Instrument")).toBeInTheDocument();
    expect(screen.queryByLabelText("Direction")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Order type")).toBeInTheDocument();
    expect(screen.getByLabelText("Entry")).toBeInTheDocument();
    expect(screen.getByLabelText("Stop loss")).toBeInTheDocument();
    expect(screen.getByLabelText("Take profit")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Open settings"));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("blocks lot calculation when pip value would only be estimated", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await renderImportApp();
    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    fireEvent.change(signalInput, {
      target: { value: "GBPJPY SELL\nENTRY: 190.000\nSL: 191.000\nTP: 188.000" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));

    expect(
      await screen.findByText("Reliable pip value unavailable. Add a live conversion rate or manual pip value."),
    ).toBeInTheDocument();
  });

  it("waits for live pair conversion before calculating a CHFJPY signal", async () => {
    const user = userEvent.setup();
    let resolveJpyRate: (value: { ok: true; json: () => Promise<{ date: string; rate: number }> }) => void = () => {};
    const jpyRate = new Promise<{ ok: true; json: () => Promise<{ date: string; rate: number }> }>((resolve) => {
      resolveJpyRate = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/JPY/USD")) return jpyRate;

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ date: "2026-06-15", rate: 1.1587 }),
        });
      }),
    );

    await renderImportApp();
    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    fireEvent.change(signalInput, {
      target: { value: "chfjpy buy\nentry: 201.438\nsl: 200.746\ntp: 202.944" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));

    expect(await screen.findByText("Loading live rate")).toBeInTheDocument();
    expect(
      screen.queryByText("Reliable pip value unavailable. Add a live conversion rate or manual pip value."),
    ).not.toBeInTheDocument();

    resolveJpyRate({
      ok: true,
      json: () => Promise.resolve({ date: "2026-06-15", rate: 0.00624 }),
    });

    expect(await screen.findByText("CHFJPY")).toBeInTheDocument();
    expect(screen.getByText("202.944")).toBeInTheDocument();
  });

  it("falls back to base-currency conversion when quote conversion is unavailable", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (input.endsWith("/BGN/USD")) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
          });
        }

        if (input.endsWith("/GBP/USD")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ date: "2026-06-15", rate: 1.27 }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ date: "2026-06-15", rate: 1.16 }),
        });
      }),
    );

    await renderImportApp();
    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    fireEvent.change(signalInput, {
      target: { value: "GBPBGN SELL\nENTRY: 2.2500\nSL: 2.2550\nTP: 2.2400" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));

    expect(await screen.findByText("GBPBGN")).toBeInTheDocument();
    expect(screen.getByText("GBP/USD 1.270000")).toBeInTheDocument();
    expect(
      screen.queryByText("Reliable pip value unavailable. Add a live conversion rate or manual pip value."),
    ).not.toBeInTheDocument();
  });

  it("explains when price adjustment is skipped because prices would not change", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    fireEvent.change(await screen.findByPlaceholderText("EURUSD"), { target: { value: "US100" } });
    fireEvent.change(screen.getByPlaceholderText("1.08450"), { target: { value: "19000" } });
    fireEvent.change(screen.getByPlaceholderText("1.08050"), { target: { value: "18950" } });
    fireEvent.change(screen.getByPlaceholderText("1.09250"), { target: { value: "19100" } });
    await user.click(screen.getByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    fireEvent.change(screen.getByLabelText("Adjustment pips"), { target: { value: "0.1" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    expect(
      await screen.findByText(
        "Price adjustment skipped because the requested movement rounds back to the original prices.",
      ),
    ).toBeInTheDocument();
  });

  it("stores settings and restores them after the app remounts", async () => {
    const user = userEvent.setup();

    const firstRender = await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "EUR" }));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    fireEvent.change(screen.getByLabelText("Adjustment pips"), { target: { value: "2.5" } });
    await user.click(screen.getByRole("button", { name: "Signal-relative" }));
    await user.click(screen.getByRole("button", { name: "Strong" }));
    await user.click(screen.getByRole("button", { name: "Keep RR" }));
    fireEvent.change(screen.getByLabelText("Risk adjustment buffer"), { target: { value: "0.4" } });
    await user.click(screen.getByRole("button", { name: "Both ways" }));

    expect(screen.getByText("Choose a preset based on the original stop distance.")).toBeInTheDocument();
    expect(screen.getByText("More separation.")).toBeInTheDocument();
    expect(screen.getByText("Recalculates TP to keep RR close; risk may drift inside the buffer.")).toBeInTheDocument();
    expect(screen.getByText("Risk buffer amount, in percentage points.")).toBeInTheDocument();
    expect(
      screen.getByText("Choose whether adjusted risk may drift above, below, or both around your target."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Fallback lot increment used by forex pairs unless an instrument override exists."),
    ).toBeInTheDocument();

    await waitFor(() => {
      const settings = JSON.parse(preferencesStore.get("fxcalc.settings") ?? "{}");
      expect(settings.accountCurrency).toBe("EUR");
      expect(settings.priceAdjustmentEnabled).toBe(true);
      expect(settings.priceAdjustmentMode).toBe("signal-relative");
      expect(settings.priceAdjustmentStrength).toBe("strong");
      expect(settings.priceAdjustmentProfile).toBe("keep-rr");
      expect(settings.priceAdjustmentPips).toBe(2.5);
      expect(settings.priceAdjustmentRiskBuffer).toBe(0.4);
      expect(settings.priceAdjustmentRiskBufferMode).toBe("both");
    });

    firstRender.unmount();
    await renderImportApp();

    expect(await screen.findByText("EUR 1000.00 risk 1.00%")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Open settings"));
    expect(screen.getByLabelText("Enable price adjustment")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Signal-relative" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Strong" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Keep RR" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Adjustment pips")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Risk adjustment buffer")).toHaveValue(0.4);
    expect(screen.getByRole("button", { name: "Both ways" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows trade direction as LONG or SHORT", async () => {
    await renderImportApp();

    expect(await screen.findByText("LONG", { selector: "div" })).toBeInTheDocument();
  });

  it("restores the saved signal draft after reload", async () => {
    preferencesStore.set(
      "fxcalc.draft",
      JSON.stringify({
        rawSignal: "GOLD LONG\nENTRY: 2020.50\nSL: 2019.50\nTP: 2022.50",
        parsed: {
          pair: "XAUUSD",
          side: "buy",
          orderType: "market",
          entry: 2020.5,
          stopLoss: 2019.5,
          takeProfit: 2022.5,
        },
      }),
    );

    await renderImportApp();

    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    expect(signalInput).toHaveValue("GOLD LONG\nENTRY: 2020.50\nSL: 2019.50\nTP: 2022.50");
    expect(await screen.findByDisplayValue("XAUUSD")).toBeInTheDocument();
    expect(screen.getByText("LONG")).toBeInTheDocument();
  });

  it("persists manual parsed value edits", async () => {
    await renderImportApp();

    const pairInput = await screen.findByPlaceholderText("EURUSD");
    fireEvent.change(pairInput, { target: { value: "XAGUSD" } });

    await waitFor(() => {
      const draft = JSON.parse(preferencesStore.get("fxcalc.draft") ?? "{}");
      expect(draft.parsed.pair).toBe("XAGUSD");
    });
  });

  it("persists raw pasted text before parsing", async () => {
    await renderImportApp();

    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    fireEvent.change(signalInput, { target: { value: "US100 SHORT\nENTRY: 19000\nSL: 19050\nTP: 18900" } });

    await waitFor(() => {
      const draft = JSON.parse(preferencesStore.get("fxcalc.draft") ?? "{}");
      expect(draft.rawSignal).toBe("US100 SHORT\nENTRY: 19000\nSL: 19050\nTP: 18900");
    });
  });

  it("keeps trailing zeros from parsed prices in results and copy values", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ date: "2026-06-12", rate: 0.0065 }),
      }),
    );

    await renderImportApp();

    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    fireEvent.change(signalInput, {
      target: { value: "CHFJPY SELL\nENTRY: 202.904\nSL: 203.500 (60 pips)\nTP: 201.600" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));

    expect(await screen.findByText("203.500")).toBeInTheDocument();
    expect(screen.getByText("201.600")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy Stop loss" }));

    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "203.500" });
  });

  it("copies the complete visible trade from the result panel", async () => {
    const user = userEvent.setup();

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Copy trade" }));

    expect(Clipboard.write).toHaveBeenLastCalledWith({
      string: [
        "EURUSD LONG",
        "Order: Market",
        "Entry: 1.08450",
        "Stop loss: 1.08050",
        "Take profit: 1.09250",
        "Lot size: 0.02",
        "RR: 2.00",
        "Target risk: 10.00 USD",
        "Actual risk: 8.00 USD (0.80%)",
        "Reward: 16.00 USD",
        "Pip/point: 10.00 exact",
      ].join("\n"),
    });
  });

  it("keeps trailing zeros in the parsed value inputs", async () => {
    const user = userEvent.setup();

    await renderImportApp();

    const signalInput = await screen.findByPlaceholderText(/EURUSD BUY/i);
    fireEvent.change(signalInput, {
      target: { value: "CHFJPY SELL\nENTRY: 202.904\nSL: 203.500 (60 pips)\nTP: 201.600" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));

    expect(await screen.findByDisplayValue("202.904")).toBeInTheDocument();
    expect(screen.getByDisplayValue("203.500")).toBeInTheDocument();
    expect(screen.getByDisplayValue("201.600")).toBeInTheDocument();
  });

  it("reads a signal screenshot and parses the recognized text", async () => {
    const user = userEvent.setup();
    recognizeTextFromImageFile.mockResolvedValue("GOLD SELL\nENTRY: 2020.50\nSL: 2022.50\nTP: 2018.00");

    await renderImportApp();

    const imageInput = await screen.findByLabelText("Signal screenshot image");
    const imageFile = new File(["fake image"], "signal.png", { type: "image/png" });
    await user.upload(imageInput, imageFile);

    expect(recognizeTextFromImageFile).toHaveBeenCalledWith(imageFile);
    expect(await screen.findByPlaceholderText(/EURUSD BUY/i)).toHaveValue(
      "GOLD SELL\nENTRY: 2020.50\nSL: 2022.50\nTP: 2018.00",
    );
    expect(screen.getByDisplayValue("XAUUSD")).toBeInTheDocument();
    expect(screen.getByText("SHORT")).toBeInTheDocument();
  });

  it("saves a signal to persistent history after a result value is copied", async () => {
    const user = userEvent.setup();

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Copy Entry" }));

    await waitFor(() => {
      const history = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
      expect(history).toHaveLength(1);
      expect(history[0].rawSignal).toBe("EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250");
      expect(history[0].original.entry).toBe(1.0845);
      expect(history[0].adjusted).toBeNull();
    });
    expect(await screen.findByText("Signal history")).toBeInTheDocument();
    expect(screen.getByText("EURUSD LONG")).toBeInTheDocument();
  });

  it("does not store duplicate history entries when multiple values are copied from the same signal", async () => {
    const user = userEvent.setup();

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Copy Entry" }));
    await user.click(screen.getByRole("button", { name: "Copy Stop loss" }));

    await waitFor(() => {
      const history = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
      expect(history).toHaveLength(1);
    });
  });

  it("stores adjusted values in history when price adjustment is active", async () => {
    const user = userEvent.setup();

    await renderImportApp();
    await user.click(await screen.findByLabelText("Open settings"));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));

    await user.click(await screen.findByRole("button", { name: "Copy Entry" }));

    await waitFor(() => {
      const history = JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
      expect(history).toHaveLength(1);
      expect(history[0].original.entry).toBe(1.0845);
      expect(history[0].adjusted.entry).toBe(1.0846);
    });
    expect(screen.getByText("Adjusted entry 1.08460")).toBeInTheDocument();
  });

  it("restores saved signal history after the app remounts", async () => {
    const entry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: historyOriginalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([entry]));

    await renderImportApp();

    expect(await screen.findByText("Signal history")).toBeInTheDocument();
    expect(screen.getByText("EURUSD LONG")).toBeInTheDocument();
    expect(screen.getByText("Original entry 1.08450")).toBeInTheDocument();
  });

  it("pages long saved signal history by 20 entries", async () => {
    const user = userEvent.setup();
    const entries = Array.from({ length: 21 }, (_, index) => {
      const result: PositionResult = {
        ...historyOriginalResult,
        pair: `TST${String(index + 1).padStart(2, "0")}`,
        entry: historyOriginalResult.entry + index * 0.0001,
        priceText: {
          ...historyOriginalResult.priceText,
          entry: (historyOriginalResult.entry + index * 0.0001).toFixed(5),
        },
      };

      return createSignalHistoryEntry({
        rawSignal: `${result.pair} BUY`,
        original: result,
        adjusted: null,
        now: new Date(Date.UTC(2026, 5, 11, 10, index, 0)),
      });
    }).reverse();
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify(entries));

    await renderImportApp();

    expect(await screen.findByText("Showing 1-20 of 21")).toBeInTheDocument();
    expect(screen.getByText("TST21 LONG")).toBeInTheDocument();
    expect(screen.getByText("TST02 LONG")).toBeInTheDocument();
    expect(screen.queryByText("TST01 LONG")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous history page" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next history page" }));

    expect(screen.getByText("Showing 21-21 of 21")).toBeInTheDocument();
    expect(screen.getByText("TST01 LONG")).toBeInTheDocument();
    expect(screen.queryByText("TST21 LONG")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next history page" })).toBeDisabled();
  });

  it("opens a floating copy panel when a history signal is tapped", async () => {
    const user = userEvent.setup();
    const entry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: historyOriginalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([entry]));

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Open EURUSD LONG history signal" }));

    const panel = await screen.findByRole("dialog", { name: "History signal EURUSD LONG" });
    expect(within(panel).getByText("Original values")).toBeInTheDocument();
    expect(within(panel).getByText("1.08450")).toBeInTheDocument();
  });

  it("copies the displayed value from the history floating panel", async () => {
    const user = userEvent.setup();
    const entry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: historyOriginalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([entry]));

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Open EURUSD LONG history signal" }));
    const panel = await screen.findByRole("dialog", { name: "History signal EURUSD LONG" });
    await user.click(within(panel).getByRole("button", { name: "Copy Entry" }));

    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
  });

  it("switches between adjusted and original values in the history floating panel", async () => {
    const user = userEvent.setup();
    const adjustedResult: PositionResult = {
      ...historyOriginalResult,
      entry: 1.0846,
      stopLoss: 1.0804,
      takeProfit: 1.0926,
      priceText: {
        entry: "1.08460",
        stopLoss: "1.08040",
        takeProfit: "1.09260",
      },
    };
    const entry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: historyOriginalResult,
      adjusted: adjustedResult,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([entry]));

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Open EURUSD LONG history signal" }));
    const panel = await screen.findByRole("dialog", { name: "History signal EURUSD LONG" });
    expect(within(panel).getByRole("button", { name: "Show original values" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08460" });

    await user.click(within(panel).getByRole("button", { name: "Show original values" }));
    expect(within(panel).getByRole("button", { name: "Show adjusted values" })).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Copy Entry" }));

    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
  });

  it("replaces the open history panel when another history signal is tapped", async () => {
    const user = userEvent.setup();
    const eurusdEntry = createSignalHistoryEntry({
      rawSignal: "EURUSD BUY",
      original: historyOriginalResult,
      adjusted: null,
      now: new Date("2026-06-11T10:00:00.000Z"),
    });
    const goldResult: PositionResult = {
      ...historyOriginalResult,
      pair: "XAUUSD",
      side: "sell",
      entry: 2020.5,
      stopLoss: 2022.5,
      takeProfit: 2018,
      priceText: {
        entry: "2020.50",
        stopLoss: "2022.50",
        takeProfit: "2018.00",
      },
    };
    const goldEntry = createSignalHistoryEntry({
      rawSignal: "GOLD SELL",
      original: goldResult,
      adjusted: null,
      now: new Date("2026-06-11T10:05:00.000Z"),
    });
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([goldEntry, eurusdEntry]));

    await renderImportApp();

    await user.click(await screen.findByRole("button", { name: "Open EURUSD LONG history signal" }));
    expect(await screen.findByRole("dialog", { name: "History signal EURUSD LONG" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open XAUUSD SHORT history signal" }));

    expect(screen.queryByRole("dialog", { name: "History signal EURUSD LONG" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "History signal XAUUSD SHORT" })).toBeInTheDocument();
  });
});

describe("manual workflow", () => {
  beforeEach(() => {
    preferencesStore.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearExchangeRateCache();
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
  });

  it("starts blank and calculates AUTO only on request, then guards outdated copies", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("button", { name: "Manual" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Entry")).toHaveValue("");
    expect(screen.getByLabelText("Direction")).toHaveValue("auto");
    expect(screen.getByLabelText("Order type")).toHaveValue("market");
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.10000" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.09000" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "1.12000" } });
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText("LONG", { selector: "div" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.10000" });
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.10500" } });
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recalculate" }));
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.10500" });
  });

  it("validates fields and preserves separate drafts and last mode across reopening", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByLabelText("Entry")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1." } });
    await user.selectOptions(screen.getByLabelText("Direction"), "sell");
    await user.selectOptions(screen.getByLabelText("Order type"), "limit");
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    expect(screen.queryByLabelText("Direction")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08600" } });
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByLabelText("Entry")).toHaveValue("1.");
    view.unmount();
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Entry")).toHaveValue("1."));
    expect(screen.getByLabelText("Direction")).toHaveValue("sell");
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    expect(screen.getByLabelText("Entry")).toHaveValue("1.08600");
    fireEvent.change(screen.getByLabelText("Instrument"), { target: { value: "USDJPY" } });
    expect(screen.getByLabelText("Entry")).toHaveValue("");
  });
  it.each([
    ["auto", "1.1", "1.09", "1.12", "LONG"],
    ["auto", "1.1", "1.12", "1.09", "SHORT"],
    ["buy", "1.1", "1.09", "1.12", "LONG"],
    ["sell", "1.1", "1.12", "1.09", "SHORT"],
  ])("calculates %s direction and preserves Limit order", async (side, entry, sl, tp, resolved) => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    await user.selectOptions(screen.getByLabelText("Direction"), side);
    await user.selectOptions(screen.getByLabelText("Order type"), "limit");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: entry } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: sl } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: tp } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText(`${resolved} LIMIT`)).toBeInTheDocument();
    expect(preferencesStore.get(signalHistoryPreferenceKey)).toBeUndefined();
  });

  it.each([
    ["", "1.09", "1.12", "Entry"],
    ["Infinity", "1.09", "1.12", "Entry"],
    ["1e", "1.09", "1.12", "Entry"],
    ["0", "1.09", "1.12", "Entry"],
    ["1.1", "-1", "1.12", "Stop loss"],
    ["1.1", "1.1", "1.12", "Stop loss"],
    ["1.1", "1.09", "1.1", "Take profit"],
    ["1.1", "1.09", "1.08", "Take profit"],
    ["1.1", "1.12", "1.13", "Take profit"],
  ])("rejects invalid AUTO prices %s/%s/%s with field errors", async (entry, sl, tp, field) => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: entry } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: sl } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: tp } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByLabelText(field)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
  });

  it("keeps manual calculations outdated after edits are reverted and settings change", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.1" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.09" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "1.12" } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByRole("button", { name: "Copy trade" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.105" } });
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.1" } });
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await user.click(screen.getByLabelText("Open settings"));
    fireEvent.change(screen.getByLabelText("Risk percent"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recalculate" }));
    expect(await screen.findByText(/Target risk 20.00/)).toBeInTheDocument();
  });

  it("retains imported direction and corrected values when refreshing", async () => {
    const user = userEvent.setup();
    await renderImportApp();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08500" } });
    await user.click(screen.getByRole("button", { name: "Recalculate" }));
    expect(screen.getByLabelText("Entry")).toHaveValue("1.08500");
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.09" } });
    expect(screen.getByLabelText("Stop loss")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Direction")).not.toBeInTheDocument();
  });

  it("waits for conversion without exposing an edited pending draft", async () => {
    const user = userEvent.setup();
    let resolveRate!: (value: { ok: boolean; json: () => Promise<{ date: string; rate: number }> }) => void;
    const rate = new Promise<{ ok: boolean; json: () => Promise<{ date: string; rate: number }> }>((resolve) => {
      resolveRate = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => (url.endsWith("/JPY/USD") ? rate : Promise.reject(new Error("unavailable")))),
    );
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    await user.click(screen.getByRole("combobox", { name: "Instrument" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Instrument" }), { target: { value: "CHFJPY" } });
    await user.keyboard("{Enter}");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "200.000" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "199.000" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "202.000" } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByText("Loading live rate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "200.500" } });
    resolveRate({ ok: true, json: async () => ({ date: "2026-06-15", rate: 0.00624 }) });
    await screen.findByText(/JPY\/USD 0.006240/);
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "200.500" });
  });

  it("ignores an older instrument conversion response after a newer calculation", async () => {
    const user = userEvent.setup();
    let resolveRate!: (value: { ok: boolean; json: () => Promise<{ date: string; rate: number }> }) => void;
    const rate = new Promise<{ ok: boolean; json: () => Promise<{ date: string; rate: number }> }>((resolve) => {
      resolveRate = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => (url.endsWith("/JPY/USD") ? rate : Promise.reject(new Error("unavailable")))),
    );
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    await user.click(screen.getByRole("combobox", { name: "Instrument" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Instrument" }), { target: { value: "CHFJPY" } });
    await user.keyboard("{Enter}");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "199" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "202" } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    resolveRate({ ok: true, json: async () => ({ date: "2026-06-15", rate: 0.00624 }) });
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
    expect(screen.queryByText(/JPY\/USD/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByLabelText("Entry")).toHaveValue("200");
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
  });

  it("blocks unavailable manual conversion until a manual pip value is supplied", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    await user.click(screen.getByRole("combobox", { name: "Instrument" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Instrument" }), { target: { value: "CHFJPY" } });
    await user.keyboard("{Enter}");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "199" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "202" } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText(/Reliable pip value unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Open settings"));
    fireEvent.change(screen.getByLabelText("Manual pip value"), { target: { value: "6.24" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
  });

  it("does not save history when all clipboard methods fail", async () => {
    const user = userEvent.setup();
    await renderImportApp();
    vi.mocked(Clipboard.write).mockRejectedValueOnce(new Error("copy denied"));
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("copy denied"));
    const originalExecCommand = document.execCommand;
    document.execCommand = vi.fn(() => false);
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(preferencesStore.get(signalHistoryPreferenceKey)).toBeUndefined();
    expect(screen.getByText(/Unable to copy/)).toBeInTheDocument();
    document.execCommand = originalExecCommand;
  });

  it("does not save an obsolete result when clipboard completion follows a draft edit", async () => {
    const user = userEvent.setup();
    let finishCopy!: () => void;
    vi.mocked(Clipboard.write).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    );
    await renderImportApp();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08600" } });
    finishCopy();
    await waitFor(() => expect(screen.getByText("Entry copied")).toBeInTheDocument());
    expect(preferencesStore.get(signalHistoryPreferenceKey)).toBeUndefined();
  });
  it("clears only prices when a manual instrument changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Manual" });
    await user.selectOptions(screen.getByLabelText("Direction"), "sell");
    await user.selectOptions(screen.getByLabelText("Order type"), "limit");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.10000" } });
    fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.12000" } });
    fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "1.09000" } });
    await user.click(screen.getByRole("combobox", { name: "Instrument" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Instrument" }), { target: { value: "XAUUSD" } });
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Entry")).toHaveValue("");
    expect(screen.getByLabelText("Stop loss")).toHaveValue("");
    expect(screen.getByLabelText("Take profit")).toHaveValue("");
    expect(screen.getByLabelText("Direction")).toHaveValue("sell");
    expect(screen.getByLabelText("Order type")).toHaveValue("limit");
  });

  it("migrates the earlier draft directly into Import with settings and history intact", async () => {
    preferencesStore.set(
      "fxcalc.draft",
      JSON.stringify({
        rawSignal: "old signal",
        parsed: {
          pair: "EURUSD",
          side: "sell",
          orderType: "limit",
          entry: 1.1,
          stopLoss: 1.12,
          takeProfit: 1.09,
          priceText: { entry: "1.10000", stopLoss: "1.12000", takeProfit: "1.09000" },
        },
      }),
    );
    preferencesStore.set("fxcalc.settings", JSON.stringify({ accountBalance: 2000, riskPercent: 2 }));
    const entry = createSignalHistoryEntry({
      rawSignal: "earlier signal",
      original: historyOriginalResult,
      adjusted: null,
    });
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([entry]));
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Import signal" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    expect(screen.getByLabelText("Stop loss")).toHaveValue("1.12000");
    expect(screen.getByLabelText("Order type")).toHaveValue("limit");
    expect(screen.queryByLabelText("Direction")).not.toBeInTheDocument();
    expect(screen.getByText("USD 2000.00 risk 2.00%")).toBeInTheDocument();
    expect(screen.getByText("EURUSD LONG")).toBeInTheDocument();
    expect(JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]")).toHaveLength(1);
  });
});
