import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workflow price adjustments", () => {
  it("defaults off in both modes and keeps remembered choices and drafts independent across remounts", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await manualTrade();
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByLabelText("Entry"), { target: { value: "1.08550" } });
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByLabelText("Entry")).toHaveValue("1.08450");
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(JSON.parse(store.get("fxcalc.settings") ?? "{}").manualPriceAdjustmentEnabled).toBe(true),
    );
    view.unmount();
    render(<App />);
    expect(await screen.findByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Entry")).toHaveValue("1.08550");
  });

  it("remembers enabled Import and disabled Manual after reopening, including Settings toggles", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await manualTrade();
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await user.click(screen.getByRole("button", { name: "Enable price adjustment" }));
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    expect(screen.getByText("Adjusted values")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(store.get("fxcalc.settings") ?? "{}").priceAdjustmentEnabled).toBe(true));
    view.unmount();
    render(<App />);
    expect(await screen.findByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Adjusted values")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "false");
  });

  it.each([true, false])("migrates legacy enabled=%s into Import while Manual remains off", async (enabled) => {
    store.set("fxcalc.settings", JSON.stringify({ priceAdjustmentEnabled: enabled, priceAdjustmentPips: 2 }));
    render(<App />);
    expect(await screen.findByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Import signal" }));
    expect(screen.getByRole("button", { name: "Adjust prices" })).toHaveAttribute("aria-pressed", String(enabled));
    if (enabled) expect(screen.getByText("1.08470")).toBeInTheDocument();
  });

  it("invalidates Manual on toggles, including toggling back, and copies original or adjusted current results", async () => {
    const user = userEvent.setup();
    render(<App />);
    await manualTrade();
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy Entry" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08460" });
    await user.click(screen.getByRole("button", { name: "Show original values" }));
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
  });

  it("recalculates Import toggles immediately without invalidating the other mode's result", async () => {
    const user = userEvent.setup();
    render(<App />);
    await manualTrade();
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    expect(screen.getByText("Adjusted values")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08460" });
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.queryByText(/Result outdated/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08450" });
  });

  it("keeps detailed settings in Settings and waits for Manual Calculate while updating Import immediately", async () => {
    const user = userEvent.setup();
    render(<App />);
    await manualTrade();
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.queryByLabelText("Adjustment pips")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.change(screen.getByLabelText("Adjustment pips"), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    expect(screen.getByText(/Result outdated/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Calculate" }));
    expect(screen.getByText("1.08470")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Import signal" }));
    await user.click(screen.getByRole("button", { name: "Adjust prices" }));
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.change(screen.getByLabelText("Adjustment pips"), { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "Close settings panel" }));
    await user.click(screen.getByRole("button", { name: "Copy Entry" }));
    expect(Clipboard.write).toHaveBeenLastCalledWith({ string: "1.08460" });
    expect(screen.queryByText(/Result outdated/)).not.toBeInTheDocument();
  });
});
