import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { calculatePosition } from "@/domain/fx/calculate-position";

const store = vi.hoisted(() => new Map<string, string>());
const fetchEurUsdRate = vi.hoisted(() => vi.fn());
const fetchExchangeRate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/preferences", () => ({
  getPreference: vi.fn(async (key: string) => store.get(key) ?? null),
  setPreference: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));
vi.mock("@/lib/fx-rates", () => ({
  fetchEurUsdRate,
  fetchExchangeRate,
}));
import App from "./App";

const trade = {
  pair: "GER40.cash",
  side: "buy" as const,
  orderType: "market" as const,
  entry: 20000,
  stopLoss: 19900,
  takeProfit: 20200,
  accountCurrency: "USD",
  accountBalance: 1000,
  riskPercent: 1,
};
async function enterTrade(mode: string, symbol = "GER40", prices = ["20000", "19900", "20200"]) {
  const user = userEvent.setup();
  if (mode === "import") {
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/), {
      target: { value: "GER40 BUY\nENTRY 20000\nSL 19900\nTP 20200" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
  } else {
    await user.click(await screen.findByRole("combobox", { name: "Instrument" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Instrument" }), { target: { value: symbol } });
    await user.keyboard("{Enter}");
    for (const [label, value] of [
      ["Entry", prices[0]],
      ["Stop loss", prices[1]],
      ["Take profit", prices[2]],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await user.click(screen.getByRole("button", { name: "Calculate" }));
  }
  return user;
}

describe("confirmed EUR/USD conversion", () => {
  beforeEach(() => {
    store.clear();
    fetchExchangeRate.mockReset().mockRejectedValue(new Error("offline"));
    fetchEurUsdRate.mockReset().mockRejectedValue(new Error("offline"));
  });
  it("rejects missing reliable rates while preserving permissive public sizing and bypasses", () => {
    for (const eurUsdRate of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => calculatePosition({ ...trade, eurUsdRate, requireReliablePipValue: true })).toThrow(/Reliable/);
    expect(calculatePosition(trade).pipValuePerLot).toBe(1.16);
    expect(calculatePosition({ ...trade, accountCurrency: "EUR", requireReliablePipValue: true }).pipValueMode).toBe(
      "exact",
    );
    expect(calculatePosition({ ...trade, manualPipValuePerLot: 2, requireReliablePipValue: true }).pipValueMode).toBe(
      "manual",
    );
  });
  it.each(["manual", "import"])(
    "blocks fresh %s conversion after failure, then accepts explicit current-value confirmation",
    async (mode) => {
      const view = render(<App />);
      const user = await enterTrade(mode);
      expect(await screen.findByText(/Reliable pip value unavailable/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
      await user.click(screen.getByLabelText("Open settings"));
      expect(screen.getByText(/No confirmed EUR\/USD rate/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Risk percent"), { target: { value: "2" } });
      expect(JSON.parse(store.get("fxcalc.settings")!).eurUsdRateConfirmed).toBe(false);
      view.unmount();
      render(<App />);
      await waitFor(() => expect(screen.getByLabelText("Entry")).toHaveValue("20000"));
      if (mode === "manual") await user.click(screen.getByRole("button", { name: "Calculate" }));
      expect(await screen.findByText(/Reliable pip value unavailable/)).toBeInTheDocument();
      await user.click(screen.getByLabelText("Open settings"));
      await user.click(screen.getByRole("button", { name: "Use manual EUR/USD rate" }));
      await user.click(screen.getByRole("button", { name: "Close settings panel" }));
      if (mode === "manual") await user.click(screen.getByRole("button", { name: "Calculate" }));
      expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
      expect(JSON.parse(store.get("fxcalc.settings")!).eurUsdRateConfirmed).toBe(true);
    },
  );
  it("blocks the inverse USD-profit/EUR-account route until a live rate arrives", async () => {
    store.set("fxcalc.settings", JSON.stringify({ accountCurrency: "EUR" }));
    let resolve!: (value: { rate: number; date: string; source: "Frankfurter"; fetchedAt: number }) => void;
    fetchEurUsdRate.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/), {
      target: { value: "BTCUSD BUY\nENTRY 60000\nSL 58800\nTP 62400" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(screen.getByText("Loading live rate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await act(async () => resolve({ rate: 1.25, date: "2026-10-07", source: "Frankfurter", fetchedAt: 100 }));
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    expect(screen.getByText(/Pip\/point 0.80 converted/)).toBeInTheDocument();
  });
  it("blocks USD-profit sizing in a EUR account after provider failure", async () => {
    store.set("fxcalc.settings", JSON.stringify({ accountCurrency: "EUR" }));
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/), {
      target: { value: "BTCUSD BUY\nENTRY 60000\nSL 58800\nTP 62400" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByText(/Reliable pip value unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
  });
  it("blocks the EUR base conversion fallback without a confirmed rate", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/), {
      target: { value: "EURJPY BUY\nENTRY 160\nSL 159\nTP 162" },
    });
    await user.click(screen.getByRole("button", { name: "Parse signal" }));
    expect(await screen.findByText(/Reliable pip value unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
  });
  it("keeps explicit legacy rates usable when refresh fails", async () => {
    store.set("fxcalc.settings", JSON.stringify({ eurUsdRate: 1.25 }));
    render(<App />);
    await enterTrade("import");
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    expect(screen.getByText(/Pip\/point 1.25 converted/)).toBeInTheDocument();
    expect(fetchExchangeRate).not.toHaveBeenCalled();
  });
  it("completes an unchanged pending Manual calculation when its required live rate arrives", async () => {
    let resolve!: (value: { rate: number; date: string; source: "Frankfurter"; fetchedAt: number }) => void;
    fetchEurUsdRate.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<App />);
    await enterTrade("manual");
    expect(screen.getByText("Loading live rate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await act(async () => resolve({ rate: 1.25, date: "2026-10-07", source: "Frankfurter", fetchedAt: 100 }));
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    expect(screen.queryByText(/Result outdated/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pip\/point 1.25 converted/)).toBeInTheDocument();
    expect(JSON.parse(store.get("fxcalc.settings")!).eurUsdRateConfirmed).toBe(true);
  });
});

it.each(["quote", "base"])("uses reliable alternate %s conversion after EUR/USD fails", async (route) => {
  store.clear();
  fetchEurUsdRate.mockReset().mockRejectedValue(new Error("offline"));
  fetchExchangeRate.mockReset().mockImplementation(async (base: string, quote: string) => {
    if (route === "base" && base === "JPY") throw new Error("JPY unavailable");
    return {
      base,
      quote,
      rate: base === "JPY" ? 0.00625 : 1.25,
      date: "2026-10-07",
      source: "Frankfurter",
      fetchedAt: 100,
      stale: false,
    };
  });
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Import signal" }));
  fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/), {
    target: { value: "EURJPY BUY\nENTRY 160\nSL 159\nTP 162" },
  });
  await user.click(screen.getByRole("button", { name: "Parse signal" }));
  expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
  expect(fetchExchangeRate).toHaveBeenCalledWith("JPY", "USD");
  expect(
    screen.getByText(route === "quote" ? /Pip\/point 6.25 converted/ : /Pip\/point 7.81 converted/),
  ).toBeInTheDocument();
});

describe("pending Manual conversion snapshots", () => {
  beforeEach(() => {
    store.clear();
    fetchEurUsdRate.mockReset().mockRejectedValue(new Error("offline"));
    fetchExchangeRate.mockReset().mockRejectedValue(new Error("offline"));
  });
  it.each(["price reverted", "risk reverted", "adjustment reverted", "mode switched", "instrument changed"])(
    "requires Calculate after %s while the shared rate is pending",
    async (edit) => {
      let resolve!: (value: { rate: number; date: string; source: "Frankfurter"; fetchedAt: number }) => void;
      fetchEurUsdRate.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
      render(<App />);
      const user = await enterTrade("manual");
      if (edit === "price reverted") {
        fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "20001" } });
        fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "20000" } });
      } else if (edit === "risk reverted") {
        await user.click(screen.getByLabelText("Open settings"));
        fireEvent.change(screen.getByLabelText("Risk percent"), { target: { value: "2" } });
        fireEvent.change(screen.getByLabelText("Risk percent"), { target: { value: "1" } });
        await user.click(screen.getByRole("button", { name: "Close settings panel" }));
      } else if (edit === "adjustment reverted") {
        await user.click(screen.getByRole("button", { name: "Adjust prices" }));
        await user.click(screen.getByRole("button", { name: "Adjust prices" }));
      } else if (edit === "mode switched") {
        await user.click(screen.getByRole("button", { name: "Import signal" }));
        await user.click(screen.getByRole("button", { name: "Manual" }));
      } else {
        await user.click(screen.getByRole("combobox", { name: "Instrument" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Instrument" }), { target: { value: "BTCUSD" } });
        await user.keyboard("{Enter}");
      }
      await act(async () => resolve({ rate: 1.25, date: "2026-10-07", source: "Frankfurter", fetchedAt: 100 }));
      expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
      if (edit !== "instrument changed") {
        await user.click(screen.getByRole("button", { name: "Calculate" }));
        expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
      }
    },
  );
  it("completes a delayed alternate quote rate without another Calculate", async () => {
    let resolve!: (value: {
      base: string;
      quote: string;
      rate: number;
      date: string;
      source: "Frankfurter";
      fetchedAt: number;
      stale: boolean;
    }) => void;
    fetchExchangeRate.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<App />);
    await enterTrade("manual", "EURJPY", ["160", "159", "162"]);
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await act(async () =>
      resolve({
        base: "JPY",
        quote: "USD",
        rate: 0.00625,
        date: "2026-10-07",
        source: "Frankfurter",
        fetchedAt: 100,
        stale: false,
      }),
    );
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    expect(screen.getByText(/Pip\/point 6.25 converted/)).toBeInTheDocument();
  });
  it("waits for a new alternate request after an earlier conversion error", async () => {
    render(<App />);
    const user = await enterTrade("manual", "EURJPY", ["160", "159", "162"]);
    expect(await screen.findByText(/Reliable pip value unavailable/)).toBeInTheDocument();
    let rejectShared!: (reason: Error) => void;
    let resolveQuote!: (value: {
      base: string;
      quote: string;
      rate: number;
      date: string;
      source: "Frankfurter";
      fetchedAt: number;
      stale: boolean;
    }) => void;
    fetchEurUsdRate.mockReturnValue(
      new Promise((_done, reject) => {
        rejectShared = reject;
      }),
    );
    fetchExchangeRate.mockReturnValue(
      new Promise((done) => {
        resolveQuote = done;
      }),
    );
    await user.click(screen.getByLabelText("Open settings"));
    await user.click(screen.getByLabelText("Refresh EUR/USD rate"));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await act(async () => rejectShared(new Error("still unavailable")));
    expect(screen.getByText("Loading live rate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await act(async () =>
      resolveQuote({
        base: "JPY",
        quote: "USD",
        rate: 0.00625,
        date: "2026-10-07",
        source: "Frankfurter",
        fetchedAt: 100,
        stale: false,
      }),
    );
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    expect(screen.getByText(/Pip\/point 6.25 converted/)).toBeInTheDocument();
  });
  it("invalidates a completed Manual result when an independent live refresh arrives", async () => {
    fetchEurUsdRate.mockResolvedValueOnce({ rate: 1.25, date: "2026-10-07", source: "Frankfurter", fetchedAt: 100 });
    render(<App />);
    const user = await enterTrade("manual");
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    let resolve!: (value: { rate: number; date: string; source: "Frankfurter"; fetchedAt: number }) => void;
    fetchEurUsdRate.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await user.click(screen.getByLabelText("Open settings"));
    await user.click(screen.getByLabelText("Refresh EUR/USD rate"));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    await act(async () => resolve({ rate: 1.5, date: "2026-10-08", source: "Frankfurter", fetchedAt: 200 }));
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy trade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByRole("button", { name: "Copy trade" })).toBeEnabled();
    expect(screen.getByText(/Pip\/point 1.50 converted/)).toBeInTheDocument();
  });
});
