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
import { getInstrumentCatalog } from "@/domain/fx";
import { Clipboard } from "@capacitor/clipboard";
import { clearExchangeRateCache } from "@/lib/fx-rates";

beforeEach(() => {
  store.clear();
  clearExchangeRateCache();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});
afterEach(() => vi.unstubAllGlobals());
async function picker() {
  return screen.findByRole("combobox", { name: "Instrument" });
}
function prices(entry = "2400", stopLoss = "2390", takeProfit = "2420") {
  fireEvent.change(screen.getByLabelText("Entry"), { target: { value: entry } });
  fireEvent.change(screen.getByLabelText("Stop loss"), { target: { value: stopLoss } });
  fireEvent.change(screen.getByLabelText("Take profit"), { target: { value: takeProfit } });
}
async function search(value: string) {
  const input = await picker();
  await userEvent.click(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("Manual instrument picker", () => {
  it("groups every activated catalog instrument by asset category", async () => {
    render(<App />);
    await userEvent.click(await picker());
    const list = screen.getByRole("listbox", { name: "Instruments" });
    expect(
      within(list)
        .getAllByRole("group")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["Forex", "Metals", "Indices", "Commodities", "Crypto", "Equities"]);
    for (const spec of getInstrumentCatalog()) {
      const category = {
        forex: "Forex",
        metal: "Metals",
        index: "Indices",
        commodity: "Commodities",
        crypto: "Crypto",
        equity: "Equities",
      }[spec.kind];
      const group = within(list).getByRole("group", { name: category });
      expect(
        within(group).getByRole("option", {
          name: new RegExp(`^${spec.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} —`),
        }),
      ).toBeInTheDocument();
    }
    expect(within(list).getAllByRole("option")).toHaveLength(getInstrumentCatalog().length);
  });

  it.each([
    ["gold", "XAUUSD"],
    ["NASDAQ", "US100"],
    ["eur/usd", "EURUSD"],
    ["platinum", "XPTUSD"],
  ])("searches %s and selects canonical %s", async (query, symbol) => {
    render(<App />);
    const input = await search(query);
    await userEvent.click(screen.getByRole("option", { name: new RegExp(`^${symbol} —`) }));
    expect(input).toHaveValue(symbol);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves through results with Down and Up, selects with Enter, and dismisses with Escape", async () => {
    const user = userEvent.setup();
    render(<App />);
    const input = await search("usd");
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    const symbol = options[0].textContent!.split(" — ")[0];
    await user.keyboard("{Enter}");
    expect(input).toHaveValue(symbol);
    prices();
    await user.click(input);
    await user.type(input, "unknown");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue(symbol);
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Entry")).toHaveValue("2400");
  });

  it("rejects arbitrary unknown searches without changing the selection or prices", async () => {
    render(<App />);
    prices();
    const input = await search("NOTREAL");
    expect(screen.getByRole("status")).toHaveTextContent("No matching instruments");
    expect(within(screen.getByRole("listbox")).queryByRole("option")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}{Tab}");
    expect(input).toHaveValue("EURUSD");
    expect(screen.getByLabelText("Entry")).toHaveValue("2400");
  });

  it("selects valid noncatalog forex through search and calculates using shared valuation", async () => {
    render(<App />);
    expect(getInstrumentCatalog().some((spec) => spec.symbol === "AEDUSD")).toBe(false);
    const input = await search("aed/usd");
    const forex = within(screen.getByRole("listbox")).getByRole("group", { name: "Forex" });
    await userEvent.click(within(forex).getByRole("option", { name: /^AEDUSD —/ }));
    expect(input).toHaveValue("AEDUSD");
    expect(screen.getByLabelText("Entry")).toHaveValue("");
    prices("0.27000", "0.26000", "0.29000");
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy Lot size" }));
    await waitFor(() => expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.01" }));
  });

  it.each([
    ["WTI", "USOIL.cash", "commodity", "Commodities", "80.000", "78.000", "84.000", "0.50", 100],
    ["BTCUSD", "BTCUSD", "crypto", "Crypto", "60000", "58800", "62400", "0.08", 96],
    ["AAPL", "AAPL", "equity", "Equities", "200.00", "195.00", "210.00", "20.00", 100],
  ])(
    "selects activated %s and calculates its contract through the picker",
    async (query, symbol, kind, category, entry, sl, tp, lot, risk) => {
      store.set("fxcalc.settings", JSON.stringify({ accountBalance: 10000, riskPercent: 1, accountCurrency: "USD" }));
      expect(getInstrumentCatalog().find((spec) => spec.symbol === symbol)?.kind).toBe(kind);
      render(<App />);
      const input = await search(query);
      const group = within(screen.getByRole("listbox")).getByRole("group", { name: category });
      await userEvent.click(
        within(group).getByRole("option", { name: new RegExp(`^${symbol.replaceAll(".", "\\.")} —`) }),
      );
      expect(input).toHaveValue(symbol);
      prices(entry, sl, tp);
      await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
      expect(await screen.findByText("LONG", { selector: "div" })).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`Actual risk ${risk.toFixed(2)}`))).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Copy Lot size" }));
      await waitFor(() => expect(Clipboard.write).toHaveBeenLastCalledWith({ string: lot }));
      await search(query);
      await userEvent.keyboard("{Enter}");
      expect(input).toHaveValue(symbol);
      expect(screen.getByLabelText("Entry")).toHaveValue(entry);
      expect(screen.getByRole("button", { name: "Copy Lot size" })).toBeEnabled();
    },
  );

  it.each(["USOIL.CASH", "WTI"])(
    "restores a pre-picker %s draft without treating its canonical selection as a change",
    async (instrument) => {
      store.set("fxcalc.settings", JSON.stringify({ accountBalance: 10000, riskPercent: 1 }));
      store.set(
        "fxcalc.draft",
        JSON.stringify({
          version: 2,
          mode: "manual",
          rawSignal: "",
          importDraft: null,
          manualDraft: {
            pair: instrument,
            side: "buy",
            orderType: "limit",
            entry: "80.000",
            stopLoss: "78.000",
            takeProfit: "84.000",
            priceText: { entry: "80.000", stopLoss: "78.000", takeProfit: "84.000" },
          },
        }),
      );
      render(<App />);
      expect(await picker()).toHaveValue("USOIL.cash");
      expect(screen.getByLabelText("Entry")).toHaveValue("80.000");
      expect(screen.getByLabelText("Stop loss")).toHaveValue("78.000");
      expect(screen.getByLabelText("Take profit")).toHaveValue("84.000");
      expect(screen.getByLabelText("Direction")).toHaveValue("buy");
      expect(screen.getByLabelText("Order type")).toHaveValue("limit");
      await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
      await search("WTI");
      await userEvent.keyboard("{Enter}");
      expect(screen.getByLabelText("Entry")).toHaveValue("80.000");
      await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "80.000" });
      await userEvent.click(screen.getByRole("button", { name: "Copy Lot size" }));
      expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.50" });
    },
  );

  it("clears prices and invalidates a result only when a different selection is committed", async () => {
    render(<App />);
    await picker();
    prices("1.10000", "1.09000", "1.12000");
    await userEvent.selectOptions(screen.getByLabelText("Direction"), "buy");
    await userEvent.selectOptions(screen.getByLabelText("Order type"), "limit");
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await search("eurusd");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    expect(screen.getByRole("button", { name: "Copy trade" })).toBeEnabled();
    await search("Gold");
    expect(screen.getByLabelText("Entry")).toHaveValue("1.10000");
    await userEvent.keyboard("{Enter}");
    for (const label of ["Entry", "Stop loss", "Take profit"]) expect(screen.getByLabelText(label)).toHaveValue("");
    expect(screen.getByLabelText("Direction")).toHaveValue("buy");
    expect(screen.getByLabelText("Order type")).toHaveValue("limit");
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    prices();
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Lot size" }));
    await waitFor(() => expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.01" }));
  });

  it("preserves selected instrument and complete prices across mode switching and remount", async () => {
    const view = render(<App />);
    await search("NASDAQ");
    await userEvent.keyboard("{Enter}");
    prices("20000", "19900", "20200");
    await userEvent.click(screen.getByRole("button", { name: "Import signal" }));
    expect(screen.getByRole("textbox", { name: "Instrument" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Manual" }));
    expect(await picker()).toHaveValue("US100");
    expect(screen.getByLabelText("Entry")).toHaveValue("20000");
    await waitFor(() => expect(JSON.parse(store.get("fxcalc.draft") ?? "{}").manualDraft.pair).toBe("US100"));
    view.unmount();
    render(<App />);
    expect(await picker()).toHaveValue("US100");
    expect(screen.getByLabelText("Entry")).toHaveValue("20000");
    expect(screen.getByLabelText("Stop loss")).toHaveValue("19900");
    expect(screen.getByLabelText("Take profit")).toHaveValue("20200");
    await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Lot size" }));
    await waitFor(() => expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "0.10" }));
  });
});
