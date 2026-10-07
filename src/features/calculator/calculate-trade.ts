import { createAdjustedPosition, type AdjustedPosition } from "@/domain/fx/adjust-signal";
import { resolveInstrumentLotRules } from "@/domain/fx/instrument-rules";
import { getInstrumentSpec } from "@/domain/fx/pairs";
import { validateParsedSignal } from "@/domain/fx/validate-signal";
import type { ParsedSignal } from "@/domain/fx/types";
import type { CalculatorSettings } from "./use-calculator-state";

export type TradeCalculation =
  | { validatedTrade: ParsedSignal; position: AdjustedPosition; error: null }
  | { validatedTrade: ParsedSignal | null; position: null; error: string };

export function resolveTradeLotRules(pair: string, settings: CalculatorSettings) {
  const rules = resolveInstrumentLotRules(pair, settings.instrumentOverrides);
  const instrument = getInstrumentSpec(rules.symbol);
  const override = settings.instrumentOverrides[rules.symbol];
  return instrument.kind === "forex"
    ? { ...rules, lotStep: override?.lotStep ?? settings.lotStep, minLot: override?.minLot ?? settings.minLot }
    : rules;
}

/** Shared sizing boundary for corrected imports and future manual trades. */
export function calculateTrade(
  signal: ParsedSignal,
  settings: CalculatorSettings,
  rates: { quoteToAccountRate?: number; baseToAccountRate?: number } = {},
): TradeCalculation {
  const validation = validateParsedSignal(signal);
  if (!validation.ok) return { validatedTrade: null, position: null, error: validation.message };

  try {
    const rules = resolveTradeLotRules(signal.pair, settings);
    const position = createAdjustedPosition(
      {
        ...signal,
        accountBalance: settings.accountBalance,
        riskPercent: settings.riskPercent,
        accountCurrency: settings.accountCurrency,
        instrumentOverrides: settings.instrumentOverrides,
        lotStep: rules.lotStep,
        minLot: rules.minLot,
        manualPipValuePerLot: settings.manualPipValuePerLot ?? undefined,
        eurUsdRate: settings.eurUsdRateConfirmed ? settings.eurUsdRate : undefined,
        ...rates,
        requireReliablePipValue: true,
      },
      {
        enabled: settings.priceAdjustmentEnabled,
        mode: settings.priceAdjustmentMode,
        fixedPips: settings.priceAdjustmentPips,
        strength: settings.priceAdjustmentStrength,
        profile: settings.priceAdjustmentProfile,
        riskBuffer: settings.priceAdjustmentRiskBuffer,
        riskBufferMode: settings.priceAdjustmentRiskBufferMode,
      },
    );
    return { validatedTrade: signal, position, error: null };
  } catch (error) {
    return {
      validatedTrade: signal,
      position: null,
      error: error instanceof Error ? error.message : "Unable to calculate position.",
    };
  }
}
