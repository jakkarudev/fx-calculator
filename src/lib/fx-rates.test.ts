import { beforeEach, describe, expect, it, vi } from "vitest";

const capacitorCore = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  nativeGet: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: capacitorCore.isNativePlatform,
  },
  CapacitorHttp: {
    get: capacitorCore.nativeGet,
  },
}));

import { clearExchangeRateCache, fetchEurUsdRate, fetchExchangeRate } from "./fx-rates";

beforeEach(() => {
  clearExchangeRateCache();
  capacitorCore.isNativePlatform.mockReset();
  capacitorCore.isNativePlatform.mockReturnValue(false);
  capacitorCore.nativeGet.mockReset();
});

describe("fetchEurUsdRate", () => {
  it("reads the latest EUR/USD rate from Frankfurter", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: "2026-06-04",
        base: "EUR",
        quote: "USD",
        rate: 1.1629,
      }),
    });

    await expect(fetchEurUsdRate(fetcher)).resolves.toEqual({
      date: "2026-06-04",
      rate: 1.1629,
      source: "Frankfurter",
      fetchedAt: expect.any(Number),
      stale: false,
    });
    expect(fetcher).toHaveBeenCalledWith("https://api.frankfurter.dev/v2/rate/EUR/USD", expect.any(Object));
  });

  it("rejects invalid rate responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rate: 0 }),
    });

    await expect(fetchEurUsdRate(fetcher)).rejects.toThrow("Invalid EUR/USD rate response.");
  });
});

describe("fetchExchangeRate", () => {
  it("reads a pair-specific conversion rate from Frankfurter", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: "2026-06-04",
        base: "JPY",
        quote: "USD",
        rate: 0.00694,
      }),
    });

    await expect(fetchExchangeRate("jpy", "usd", fetcher)).resolves.toEqual({
      base: "JPY",
      quote: "USD",
      date: "2026-06-04",
      rate: 0.00694,
      source: "Frankfurter",
      fetchedAt: expect.any(Number),
      stale: false,
    });
    expect(fetcher).toHaveBeenCalledWith("https://api.frankfurter.dev/v2/rate/JPY/USD", expect.any(Object));
  });

  it("calls the default browser fetch with the global binding intact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(function (this: unknown) {
        if (this !== globalThis) {
          throw new Error("Illegal invocation");
        }

        return Promise.resolve({
          ok: true,
          json: async () => ({ date: "2026-06-15", rate: 0.00624 }),
        });
      }),
    );

    await expect(fetchExchangeRate("JPY", "USD")).resolves.toMatchObject({
      base: "JPY",
      quote: "USD",
      rate: 0.00624,
    });
  });

  it("reuses a fresh cached rate", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: "2026-06-04", rate: 0.00694 }),
    });

    const first = await fetchExchangeRate("JPY", "USD", { fetcher, now: () => 1000, maxAgeMs: 60_000 });
    const second = await fetchExchangeRate("JPY", "USD", { fetcher, now: () => 2000, maxAgeMs: 60_000 });

    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falls back to a stale cached rate when refresh fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ date: "2026-06-04", rate: 0.00694 }),
      })
      .mockRejectedValueOnce(new Error("offline"));

    await fetchExchangeRate("JPY", "USD", { fetcher, now: () => 1000, maxAgeMs: 10 });

    await expect(fetchExchangeRate("JPY", "USD", { fetcher, now: () => 2000, maxAgeMs: 10 })).resolves.toMatchObject({
      base: "JPY",
      quote: "USD",
      rate: 0.00694,
      stale: true,
    });
  });

  it("uses native Capacitor HTTP when browser fetch fails on native platforms", async () => {
    capacitorCore.isNativePlatform.mockReturnValue(true);
    const fetcher = vi.fn().mockRejectedValue(new Error("webview fetch failed"));
    capacitorCore.nativeGet.mockResolvedValue({
      status: 200,
      data: { date: "2026-06-15", rate: 0.00624 },
      headers: {},
      url: "https://api.frankfurter.dev/v2/rate/JPY/USD",
    });

    await expect(fetchExchangeRate("JPY", "USD", { fetcher })).resolves.toMatchObject({
      base: "JPY",
      quote: "USD",
      date: "2026-06-15",
      rate: 0.00624,
      stale: false,
    });
    expect(capacitorCore.nativeGet).toHaveBeenCalledWith({
      url: "https://api.frankfurter.dev/v2/rate/JPY/USD",
      connectTimeout: 8000,
      readTimeout: 8000,
      responseType: "json",
    });
  });

  it("aborts slow rate requests", async () => {
    const fetcher = vi.fn(
      (_input: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(fetchExchangeRate("JPY", "USD", { fetcher, timeoutMs: 1, maxAgeMs: 0 })).rejects.toThrow("aborted");
  });
});
