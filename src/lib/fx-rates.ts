import { Capacitor, CapacitorHttp, type HttpResponse } from "@capacitor/core";

const FRANKFURTER_RATE_URL = "https://api.frankfurter.dev/v2/rate";

export type EurUsdRate = {
  rate: number;
  date: string;
  source: "Frankfurter";
  fetchedAt: number;
  stale: boolean;
};

export type ExchangeRate = EurUsdRate & {
  base: string;
  quote: string;
};

type Fetcher = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}>;

export type RateFetchOptions = {
  fetcher?: Fetcher;
  timeoutMs?: number;
  maxAgeMs?: number;
  now?: () => number;
};

const defaultRateFetchOptions = {
  timeoutMs: 8_000,
  maxAgeMs: 15 * 60_000,
};

const rateCache = new Map<string, ExchangeRate>();

function isRateResponse(value: unknown): value is { date: string; rate: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "date" in value &&
    "rate" in value &&
    typeof (value as { date: unknown }).date === "string" &&
    typeof (value as { rate: unknown }).rate === "number" &&
    Number.isFinite((value as { rate: number }).rate) &&
    (value as { rate: number }).rate > 0
  );
}

function normalizeCurrency(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function normalizeOptions(fetcherOrOptions?: Fetcher | RateFetchOptions): Required<RateFetchOptions> {
  if (typeof fetcherOrOptions === "function") {
    return {
      fetcher: fetcherOrOptions,
      timeoutMs: defaultRateFetchOptions.timeoutMs,
      maxAgeMs: defaultRateFetchOptions.maxAgeMs,
      now: Date.now,
    };
  }

  return {
    fetcher: fetcherOrOptions?.fetcher ?? ((input, init) => globalThis.fetch(input, init)),
    timeoutMs: fetcherOrOptions?.timeoutMs ?? defaultRateFetchOptions.timeoutMs,
    maxAgeMs: fetcherOrOptions?.maxAgeMs ?? defaultRateFetchOptions.maxAgeMs,
    now: fetcherOrOptions?.now ?? Date.now,
  };
}

function cacheKey(base: string, quote: string) {
  return `${base}/${quote}`;
}

async function fetchWithTimeout(url: string, options: Required<RateFetchOptions>) {
  const controller = new AbortController();
  const timeout = options.timeoutMs > 0 ? globalThis.setTimeout(() => controller.abort(), options.timeoutMs) : null;

  try {
    return await options.fetcher(url, { signal: controller.signal });
  } catch (error) {
    if (Capacitor.isNativePlatform()) {
      return fetchWithNativeHttp(url, options);
    }

    throw error;
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

function toFetcherResponse(response: HttpResponse): Awaited<ReturnType<Fetcher>> {
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => (typeof response.data === "string" ? JSON.parse(response.data) : response.data),
  };
}

async function fetchWithNativeHttp(url: string, options: Required<RateFetchOptions>) {
  const response = await CapacitorHttp.get({
    url,
    connectTimeout: options.timeoutMs,
    readTimeout: options.timeoutMs,
    responseType: "json",
  });

  return toFetcherResponse(response);
}

export function clearExchangeRateCache() {
  rateCache.clear();
}

export async function fetchExchangeRate(
  baseCurrency: string,
  quoteCurrency: string,
  fetcherOrOptions?: Fetcher | RateFetchOptions,
): Promise<ExchangeRate> {
  const base = normalizeCurrency(baseCurrency);
  const quote = normalizeCurrency(quoteCurrency);
  const options = normalizeOptions(fetcherOrOptions);
  const key = cacheKey(base, quote);
  const cached = rateCache.get(key);
  const now = options.now();

  if (cached && now - cached.fetchedAt <= options.maxAgeMs) {
    return cached;
  }

  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetchWithTimeout(`${FRANKFURTER_RATE_URL}/${base}/${quote}`, options);
    if (!response.ok) {
      throw new Error(`${base}/${quote} rate request failed with status ${response.status ?? "unknown"}.`);
    }
  } catch (error) {
    if (cached) {
      return { ...cached, stale: true };
    }

    throw error;
  }

  const payload = await response.json();
  if (!isRateResponse(payload)) {
    throw new Error(`Invalid ${base}/${quote} rate response.`);
  }

  const latest: ExchangeRate = {
    base,
    quote,
    rate: payload.rate,
    date: payload.date,
    source: "Frankfurter",
    fetchedAt: now,
    stale: false,
  };

  rateCache.set(key, latest);
  return latest;
}

export async function fetchEurUsdRate(fetcherOrOptions?: Fetcher | RateFetchOptions): Promise<EurUsdRate> {
  const latest = await fetchExchangeRate("EUR", "USD", fetcherOrOptions);

  return {
    rate: latest.rate,
    date: latest.date,
    source: latest.source,
    fetchedAt: latest.fetchedAt,
    stale: latest.stale,
  };
}
