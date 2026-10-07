import { useEffect, useState } from "react";
import { getPreference, setPreference } from "@/lib/preferences";
import { fetchEurUsdRate } from "@/lib/fx-rates";
import type {
  PriceAdjustmentMode,
  PriceAdjustmentProfile,
  PriceAdjustmentStrength,
  RiskAdjustmentBufferMode,
} from "@/domain/fx/adjust-signal";
import { sanitizeInstrumentLotOverrides, type InstrumentLotOverride } from "@/domain/fx/instrument-rules";

export const supportedAccountCurrencies = ["USD", "EUR"] as const;
export type AccountCurrency = (typeof supportedAccountCurrencies)[number];

export type CalculatorSettings = {
  accountBalance: number;
  riskPercent: number;
  accountCurrency: AccountCurrency;
  lotStep: number;
  minLot: number;
  manualPipValuePerLot: number | null;
  eurUsdRate: number;
  /** The initial example is unavailable until fetched or explicitly supplied by the user. */
  eurUsdRateConfirmed: boolean;
  eurUsdRateDate: string | null;
  eurUsdRateFetchedAt: number | null;
  eurUsdRateSource: "manual" | "Frankfurter";
  instrumentOverrides: Record<string, InstrumentLotOverride>;
  /** Existing persisted flag belongs to the Import workflow. */
  priceAdjustmentEnabled: boolean;
  manualPriceAdjustmentEnabled: boolean;
  priceAdjustmentMode: PriceAdjustmentMode;
  priceAdjustmentStrength: PriceAdjustmentStrength;
  priceAdjustmentProfile: PriceAdjustmentProfile;
  priceAdjustmentPips: number;
  priceAdjustmentRiskBuffer: number;
  priceAdjustmentRiskBufferMode: RiskAdjustmentBufferMode;
};

const defaultSettings: CalculatorSettings = {
  accountBalance: 1000,
  riskPercent: 1,
  accountCurrency: "USD",
  lotStep: 0.01,
  minLot: 0.01,
  manualPipValuePerLot: null,
  eurUsdRate: 1.16,
  eurUsdRateConfirmed: false,
  eurUsdRateDate: null,
  eurUsdRateFetchedAt: null,
  eurUsdRateSource: "manual",
  instrumentOverrides: {},
  priceAdjustmentEnabled: false,
  manualPriceAdjustmentEnabled: false,
  priceAdjustmentMode: "fixed",
  priceAdjustmentStrength: "normal",
  priceAdjustmentProfile: "keep-risk",
  priceAdjustmentPips: 1,
  priceAdjustmentRiskBuffer: 0.2,
  priceAdjustmentRiskBufferMode: "plus",
};

function normalizeSettings(value: Partial<CalculatorSettings>): CalculatorSettings {
  const accountBalance = Number(value.accountBalance);
  const riskPercent = Number(value.riskPercent);
  const lotStep = Number(value.lotStep);
  const minLot = Number(value.minLot);
  const eurUsdRate = Number(value.eurUsdRate);
  const priceAdjustmentPips = Number(value.priceAdjustmentPips);
  const priceAdjustmentRiskBuffer = Number(value.priceAdjustmentRiskBuffer);
  const priceAdjustmentMode =
    value.priceAdjustmentMode === "signal-relative" ? value.priceAdjustmentMode : defaultSettings.priceAdjustmentMode;
  const priceAdjustmentStrength =
    value.priceAdjustmentStrength === "subtle" || value.priceAdjustmentStrength === "strong"
      ? value.priceAdjustmentStrength
      : defaultSettings.priceAdjustmentStrength;
  const priceAdjustmentProfile =
    value.priceAdjustmentProfile === "shift" || value.priceAdjustmentProfile === "keep-rr"
      ? value.priceAdjustmentProfile
      : defaultSettings.priceAdjustmentProfile;
  const priceAdjustmentRiskBufferMode =
    value.priceAdjustmentRiskBufferMode === "minus" || value.priceAdjustmentRiskBufferMode === "both"
      ? value.priceAdjustmentRiskBufferMode
      : defaultSettings.priceAdjustmentRiskBufferMode;
  const manualPipValuePerLot = value.manualPipValuePerLot;
  const eurUsdRateDate =
    typeof value.eurUsdRateDate === "string" && value.eurUsdRateDate.length > 0 ? value.eurUsdRateDate : null;
  const eurUsdRateFetchedAt = Number(value.eurUsdRateFetchedAt);
  const eurUsdRateSource = value.eurUsdRateSource === "Frankfurter" ? "Frankfurter" : "manual";
  const currencyCandidate =
    typeof value.accountCurrency === "string" ? value.accountCurrency.trim().toUpperCase().slice(0, 3) : "";
  const accountCurrency = supportedAccountCurrencies.includes(currencyCandidate as AccountCurrency)
    ? (currencyCandidate as AccountCurrency)
    : defaultSettings.accountCurrency;

  return {
    accountBalance:
      Number.isFinite(accountBalance) && accountBalance > 0 ? accountBalance : defaultSettings.accountBalance,
    riskPercent: Number.isFinite(riskPercent) && riskPercent > 0 ? riskPercent : defaultSettings.riskPercent,
    accountCurrency,
    lotStep: Number.isFinite(lotStep) && lotStep > 0 ? lotStep : defaultSettings.lotStep,
    minLot: Number.isFinite(minLot) && minLot > 0 ? minLot : defaultSettings.minLot,
    eurUsdRate: Number.isFinite(eurUsdRate) && eurUsdRate > 0 ? eurUsdRate : defaultSettings.eurUsdRate,
    eurUsdRateConfirmed:
      Number.isFinite(eurUsdRate) &&
      eurUsdRate > 0 &&
      (value.eurUsdRateConfirmed === undefined || value.eurUsdRateConfirmed === true),
    eurUsdRateDate,
    eurUsdRateFetchedAt: Number.isFinite(eurUsdRateFetchedAt) && eurUsdRateFetchedAt > 0 ? eurUsdRateFetchedAt : null,
    eurUsdRateSource,
    instrumentOverrides: sanitizeInstrumentLotOverrides(value.instrumentOverrides),
    priceAdjustmentEnabled: value.priceAdjustmentEnabled === true,
    manualPriceAdjustmentEnabled: value.manualPriceAdjustmentEnabled === true,
    priceAdjustmentMode,
    priceAdjustmentStrength,
    priceAdjustmentProfile,
    priceAdjustmentPips:
      Number.isFinite(priceAdjustmentPips) && priceAdjustmentPips > 0
        ? priceAdjustmentPips
        : defaultSettings.priceAdjustmentPips,
    priceAdjustmentRiskBuffer:
      Number.isFinite(priceAdjustmentRiskBuffer) && priceAdjustmentRiskBuffer >= 0
        ? priceAdjustmentRiskBuffer
        : defaultSettings.priceAdjustmentRiskBuffer,
    priceAdjustmentRiskBufferMode,
    manualPipValuePerLot:
      typeof manualPipValuePerLot === "number" && Number.isFinite(manualPipValuePerLot) && manualPipValuePerLot > 0
        ? manualPipValuePerLot
        : null,
  };
}

export function useCalculatorState() {
  const [settings, setSettings] = useState<CalculatorSettings>(defaultSettings);
  const [rateStatus, setRateStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const applyEurUsdRate = (latest: { rate: number; date: string; source: "Frankfurter"; fetchedAt: number }) => {
    setSettings((current) => {
      const next = normalizeSettings({
        ...current,
        eurUsdRate: latest.rate,
        eurUsdRateConfirmed: true,
        eurUsdRateDate: latest.date,
        eurUsdRateFetchedAt: latest.fetchedAt,
        eurUsdRateSource: latest.source,
      });
      void setPreference("fxcalc.settings", JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    void (async () => {
      const stored = await getPreference("fxcalc.settings");
      if (stored) {
        try {
          const loadedSettings = normalizeSettings(JSON.parse(stored) as Partial<CalculatorSettings>);
          setSettings(loadedSettings);
        } catch {
          setSettings(defaultSettings);
        }
      }

      setRateStatus("loading");
      try {
        const latest = await fetchEurUsdRate();
        applyEurUsdRate(latest);
        setRateStatus("ready");
      } catch {
        setRateStatus("error");
      }
    })();
  }, []);

  const updateSettings = (next: CalculatorSettings) => {
    const normalized = normalizeSettings(next);
    setSettings(normalized);
    void setPreference("fxcalc.settings", JSON.stringify(normalized));
  };

  const refreshEurUsdRate = async () => {
    setRateStatus("loading");
    try {
      const latest = await fetchEurUsdRate();
      applyEurUsdRate(latest);
      setRateStatus("ready");
    } catch {
      setRateStatus("error");
    }
  };

  return { settings, updateSettings, refreshEurUsdRate, rateStatus };
}
