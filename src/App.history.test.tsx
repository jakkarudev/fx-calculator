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

import { Clipboard } from "@capacitor/clipboard";
import App from "./App";
import { clearExchangeRateCache } from "@/lib/fx-rates";
import { signalHistoryPreferenceKey } from "@/features/calculator/signal-history";

const source = "EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250";
function history() {
  return JSON.parse(preferencesStore.get(signalHistoryPreferenceKey) ?? "[]");
}
async function enterManual() {
  await screen.findByLabelText("Entry");
  for (const [label, value] of [
    ["Entry", "1.08450"],
    ["Stop loss", "1.08050"],
    ["Take profit", "1.09250"],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  await userEvent.click(screen.getByRole("button", { name: "Calculate" }));
}
async function openHistory() {
  await userEvent.click((await screen.findAllByRole("button", { name: "Open EURUSD LONG history signal" }))[0]);
  return screen.findByRole("dialog", { name: "History signal EURUSD LONG" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saved trade origin", () => {
  beforeEach(() => {
    preferencesStore.clear();
    capacitorHttpGet.mockReset();
    capacitorHttpGet.mockRejectedValue(new Error("native http unavailable"));
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    clearExchangeRateCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
  });

  it("saves a current manual result only on successful copy and restores its badge and values", async () => {
    const view = render(<App />);
    await enterManual();
    expect(history()).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Lot size" }));
    expect(history()).toHaveLength(1);
    expect(history()[0]).toMatchObject({
      origin: "manual",
      rawSignal: "",
      original: { entry: 1.0845, stopLoss: 1.0805, takeProfit: 1.0925 },
    });
    expect(
      within(screen.getByRole("button", { name: "Open EURUSD LONG history signal" })).getByText("Manual"),
    ).toBeInTheDocument();
    view.unmount();
    render(<App />);
    const dialog = await openHistory();
    expect(within(dialog).getByText("Manual")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
    expect(history()).toHaveLength(1);
  });

  it("keeps corrected imports Imported and retains the parsed source across text edits and remount", async () => {
    const view = render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Import signal" }));
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/i), { target: { value: source } });
    await userEvent.click(screen.getByRole("button", { name: "Parse signal" }));
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08500" } });
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/i), { target: { value: "unrelated unparsed text" } });
    view.unmount();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Copy Entry" }));
    expect(history()[0]).toMatchObject({
      origin: "imported",
      rawSignal: source,
      original: { entry: 1.085, stopLoss: 1.0805, takeProfit: 1.0925 },
    });
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(within(await openHistory()).getByText("Imported")).toBeInTheDocument();
  });

  it("keeps identical calculated trades of different origins distinct without saving on mode switching", async () => {
    render(<App />);
    await enterManual();
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    await userEvent.click(screen.getByRole("button", { name: "Import signal" }));
    expect(history()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(history()).toHaveLength(2);
    expect(history().map((entry: { origin: string }) => entry.origin)).toEqual(["imported", "manual"]);
  });

  it("saves both original and adjusted imported values and opens either variant", async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Import signal" }));
    await userEvent.click(screen.getByLabelText("Open settings"));
    await userEvent.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await userEvent.click(screen.getByRole("button", { name: "Close settings panel" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(history()[0]).toMatchObject({
      origin: "imported",
      original: { entry: 1.0845 },
      adjusted: { entry: 1.0846 },
    });
    const dialog = await openHistory();
    expect(within(dialog).getByText("Imported")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08460" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Show original values" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
    expect(history()).toHaveLength(1);
  });

  it("does not save an obsolete import after another source with the same prices is parsed during copying", async () => {
    let finishCopy!: () => void;
    vi.mocked(Clipboard.write).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Import signal" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    fireEvent.change(screen.getByPlaceholderText(/EURUSD BUY/i), {
      target: { value: source + "\nReplacement source" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Parse signal" }));
    finishCopy();
    await waitFor(() => expect(screen.getByText("Entry copied")).toBeInTheDocument());
    expect(history()).toHaveLength(0);
  });

  it("labels legacy stored values Earlier trade and leaves them usable", async () => {
    const view = render(<App />);
    await enterManual();
    await userEvent.click(screen.getByRole("button", { name: "Copy Entry" }));
    const legacy = history()[0];
    delete legacy.origin;
    legacy.rawSignal = "legacy source";
    preferencesStore.set(signalHistoryPreferenceKey, JSON.stringify([legacy]));
    view.unmount();
    render(<App />);
    expect(await screen.findByText("Earlier trade")).toBeInTheDocument();
    const dialog = await openHistory();
    expect(within(dialog).getByText("Earlier trade")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy trade" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: expect.stringContaining("Entry: 1.08450") });
    expect(history()).toEqual([legacy]);
  });
});
