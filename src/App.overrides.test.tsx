import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
  },
}));
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: { write: vi.fn(), read: vi.fn().mockResolvedValue({ value: "" }) },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { get: vi.fn().mockRejectedValue(new Error("offline")) },
}));
vi.mock("@/lib/ocr", () => ({ recognizeTextFromImageFile: vi.fn() }));
import App from "./App";
import { Clipboard } from "@capacitor/clipboard";
import { clearExchangeRateCache } from "@/lib/fx-rates";

async function manualTrade() {
  await screen.findByRole("button", { name: "Adjust prices" });
  fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08450" } });
  fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: "1.08050" } });
  fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: "1.09250" } });
  await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
}

beforeEach(() => {
  store.clear();
  clearExchangeRateCache();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});

afterEach(() => vi.unstubAllGlobals());
async function settings() {
  await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
}
async function closeSettings() {
  await userEvent.click(screen.getByRole("button", { name: "Close settings panel" }));
}
function change(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  if (label === "Instrument" && input.getAttribute("role") === "combobox") {
    fireEvent.keyDown(input, { key: "Enter" });
  }
}
async function copyLot(value: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Copy Lot size" }));
  expect(Clipboard.write).toHaveBeenLastCalledWith({ string: value });
}
describe("instrument specification Settings", () => {
  it.each([
    ["WTI", "USOIL.cash", "80.000", "78.000", "84.000", "1.25", "80.002"],
    ["BTC/USD", "BTCUSD", "60000", "58800", "62400", "0.002", "60042"],
    ["brk.b", "BRK.B", "200.00", "195.00", "210.00", "0.50", "200.10"],
  ])(
    "shares canonical picker Settings and effective adjusted copies for %s",
    async (query, symbol, entry, stopLoss, takeProfit, lot, adjustedEntry) => {
      store.set(
        "fxcalc.settings",
        JSON.stringify({
          accountBalance: 10000,
          riskPercent: 1,
          instrumentOverrides: { XAUUSD: { contractSize: 10 } },
        }),
      );
      render(<App />);
      await screen.findByRole("button", { name: "Calculate" });
      await userEvent.click(screen.getByRole("combobox", { name: "Instrument" }));
      change("Instrument", query);
      expect(screen.getByRole("combobox", { name: "Instrument" })).toHaveValue(symbol);
      change("Entry", entry);
      change("Stop loss", stopLoss);
      change("Take profit", takeProfit);
      await settings();
      change(`${symbol} lot step`, "0.001");
      change(`${symbol} minimum lot`, "0.001");
      change(`${symbol} contract size`, "20");
      change(`${symbol} movement unit`, "0.1");
      change(`${symbol} manual pip value`, "4");
      await userEvent.click(screen.getByRole("button", { name: "Signal-relative" }));
      await userEvent.click(screen.getByRole("button", { name: "Shift setup" }));
      await closeSettings();
      await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
      await copyLot(lot);
      await userEvent.click(screen.getByRole("combobox", { name: "Instrument" }));
      change("Instrument", query);
      expect(screen.getByLabelText("Entry")).toHaveValue(entry);
      expect(screen.getByRole("button", { name: "Copy Lot size" })).toBeEnabled();
      await settings();
      expect(screen.getByLabelText(`${symbol} movement unit`)).toHaveValue(0.1);
      await closeSettings();
      await copyLot(lot);
      await userEvent.click(screen.getByRole("button", { name: "Adjust prices" }));
      await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
      await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: adjustedEntry });
      await copyLot(lot);
      await settings();
      await userEvent.click(screen.getByRole("button", { name: `Reset ${symbol} specifications` }));
      expect(JSON.parse(store.get("fxcalc.settings") ?? "{}").instrumentOverrides).toEqual({
        XAUUSD: { contractSize: 10 },
      });
    },
  );
  it("retains global lot fallbacks for partial specifications on dynamic forex selected by the picker", async () => {
    store.set("fxcalc.settings", JSON.stringify({ lotStep: 0.1, minLot: 0.2 }));
    render(<App />);
    await screen.findByRole("button", { name: "Calculate" });
    change("Instrument", "aed/usd");
    change("Entry", "0.27000");
    change("Stop loss", "0.26000");
    change("Take profit", "0.29000");
    await settings();
    change("AEDUSD contract size", "10000");
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("0.20");
    expect(JSON.parse(store.get("fxcalc.settings") ?? "{}").instrumentOverrides).toEqual({
      AEDUSD: { contractSize: 10000 },
    });
  });
  it.each(["manual", "imported"] as const)("preserves fine lots in %s copy, history, and remount", async (mode) => {
    const view = render(<App />);
    await manualTrade();
    if (mode === "imported") {
      await userEvent.click(screen.getByRole("button", { name: "Import signal" }));
    }
    await settings();
    change("EURUSD lot step", "0.001");
    change("EURUSD minimum lot", "0.001");
    await closeSettings();
    if (mode === "manual") {
      expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    }
    // $10 risk / (40 pips * $10 per pip per lot) = 0.025 lots.
    expect(screen.getByText("0.025")).toBeInTheDocument();
    expect(screen.getByText(/EURUSD step 0.001 min 0.001/)).toBeInTheDocument();
    await copyLot("0.025");
    await userEvent.click(screen.getByRole("button", { name: "Copy trade" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: expect.stringContaining("Lot size: 0.025\n") });
    const historyButton = screen.getByRole("button", { name: "Open EURUSD LONG history signal" });
    expect(within(historyButton).getByText(/Lot 0.025/)).toBeInTheDocument();
    await waitFor(() =>
      expect(JSON.parse(store.get("fxcalc.signalHistory.v1") ?? "[]")[0]).toMatchObject({
        origin: mode,
        original: { lotSize: 0.025, actualRiskAmount: expect.closeTo(10, 8) },
      }),
    );
    view.unmount();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Open EURUSD LONG history signal" }));
    const dialog = screen.getByRole("dialog", { name: "History signal EURUSD LONG" });
    expect(within(dialog).getByText("0.025")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy Lot size" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.025" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy trade" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: expect.stringContaining("Lot size: 0.025\n") });
  });

  it("applies all active overrides on Manual Calculate and persists them across reopening", async () => {
    const view = render(<App />);
    await manualTrade();
    await settings();
    change("EURUSD lot step", "0.1");
    change("EURUSD minimum lot", "0.3");
    change("EURUSD contract size", "10000");
    change("EURUSD movement unit", "0.001");
    change("EURUSD manual pip value", "2");
    await closeSettings();
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("1.20");
    await waitFor(() =>
      expect(JSON.parse(store.get("fxcalc.settings") ?? "{}").instrumentOverrides.EURUSD).toEqual({
        lotStep: 0.1,
        minLot: 0.3,
        contractSize: 10000,
        movementUnit: 0.001,
        manualPipValuePerLot: 2,
      }),
    );
    view.unmount();
    render(<App />);
    await screen.findByRole("button", { name: "Calculate" });
    await settings();
    expect(screen.getByLabelText("EURUSD contract size")).toHaveValue(10000);
    expect(screen.getByLabelText("EURUSD movement unit")).toHaveValue(0.001);
    expect(screen.getByLabelText("EURUSD manual pip value")).toHaveValue(2);
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("1.20");
  });
  it("updates Import immediately and resets only the active instrument", async () => {
    store.set(
      "fxcalc.settings",
      JSON.stringify({ riskPercent: 2, instrumentOverrides: { XAUUSD: { contractSize: 10 } } }),
    );
    render(<App />);
    await screen.findByRole("button", { name: "Calculate" });
    await userEvent.click(screen.getByRole("button", { name: "Import signal" }));
    await settings();
    change("EURUSD contract size", "10000");
    await closeSettings();
    await copyLot("0.50");
    await settings();
    await userEvent.click(screen.getByRole("button", { name: "Reset EURUSD specifications" }));
    expect(screen.getByLabelText("Risk percent")).toHaveValue(2);
    await closeSettings();
    await copyLot("0.05");
    const persisted = JSON.parse(store.get("fxcalc.settings") ?? "{}");
    expect(persisted.instrumentOverrides).toEqual({ XAUUSD: { contractSize: 10 } });
    expect(persisted.riskPercent).toBe(2);
  });
  it("migrates lot-only aliases and exposes one canonical record", async () => {
    store.set(
      "fxcalc.settings",
      JSON.stringify({
        accountBalance: 5000,
        lotStep: 0.05,
        manualPipValuePerLot: 7,
        instrumentOverrides: { GOLD: { lotStep: 0.1 }, XAUUSD: { minLot: 0.2 } },
      }),
    );
    render(<App />);
    await screen.findByRole("button", { name: "Calculate" });
    change("Instrument", "GOLD");
    await settings();
    expect(screen.getByLabelText("XAUUSD lot step")).toHaveValue(0.1);
    expect(screen.getByLabelText("XAUUSD minimum lot")).toHaveValue(0.2);
    change("XAUUSD contract size", "10");
    await closeSettings();
    change("Instrument", "XAUUSD");
    await settings();
    expect(screen.getByLabelText("XAUUSD contract size")).toHaveValue(10);
    const persisted = JSON.parse(store.get("fxcalc.settings") ?? "{}");
    expect(persisted.instrumentOverrides).toEqual({ XAUUSD: { lotStep: 0.1, minLot: 0.2, contractSize: 10 } });
    expect(persisted.accountBalance).toBe(5000);
    expect(persisted.lotStep).toBe(0.05);
    expect(persisted.manualPipValuePerLot).toBe(7);
  });
  it("keeps valid numeric overrides through invalid edits and lets optional blank restore defaults", async () => {
    render(<App />);
    await manualTrade();
    await settings();
    change("EURUSD contract size", "10000");
    change("EURUSD contract size", "0");
    change("EURUSD movement unit", "-1");
    change("Account balance", "");
    expect(JSON.parse(store.get("fxcalc.settings") ?? "{}").accountBalance).toBe(1000);
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("0.25");
    await settings();
    change("EURUSD contract size", "");
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("0.02");
  });
  it("keeps global forex lot fallbacks when only valuation specifications are overridden", async () => {
    store.set("fxcalc.settings", JSON.stringify({ lotStep: 0.1, minLot: 0.2 }));
    render(<App />);
    await manualTrade();
    await settings();
    change("EURUSD contract size", "10000");
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("0.20");
    await settings();
    change("EURUSD contract size", "100000");
    await closeSettings();
    await settings();
    change("EURUSD contract size", "10000");
    await closeSettings();
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
  });
  it("adjusts Import with the configured movement unit and preserves adjusted display precision", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Calculate" });
    await userEvent.click(screen.getByRole("button", { name: "Import signal" }));
    await settings();
    change("EURUSD movement unit", "0.001");
    await userEvent.click(screen.getByRole("button", { name: "Shift setup" }));
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Adjust prices" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08550" });
    expect(screen.getByText("Adjusted values")).toBeInTheDocument();
  });
  it("uses instrument manual value with unavailable conversions and blocks after clearing it", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "Calculate" });
    change("Instrument", "AUDCAD");
    change("Entry", "1.1");
    change("Stop loss", "1.09");
    change("Take profit", "1.12");
    await settings();
    change("AUDCAD manual pip value", "2");
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await copyLot("0.05");
    await settings();
    change("AUDCAD manual pip value", "");
    await closeSettings();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await waitFor(() => expect(screen.getByText(/Reliable pip value unavailable/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Copy Lot size" })).not.toBeInTheDocument();
  });
});
