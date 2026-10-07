import { getDefaultLotStep, getDefaultMinLot, getInstrumentSpec, normalizePair } from "./pairs";

export type InstrumentLotOverride = {
  lotStep?: number;
  minLot?: number;
  contractSize?: number;
  movementUnit?: number;
  manualPipValuePerLot?: number;
};

export type InstrumentLotRules = {
  symbol: string;
  lotStep: number;
  minLot: number;
  source: "default" | "override";
};

export function sanitizeInstrumentLotOverrides(value: unknown): Record<string, InstrumentLotOverride> {
  if (!value || typeof value !== "object") return {};

  const overrides: Record<string, InstrumentLotOverride> = {};
  for (const [rawSymbol, rawOverride] of Object.entries(value)) {
    if (!rawOverride || typeof rawOverride !== "object") continue;

    const symbol = normalizePair(rawSymbol);
    if (!symbol) continue;

    const record = rawOverride as Record<string, unknown>;
    const next: InstrumentLotOverride = {};
    for (const field of ["lotStep", "minLot", "contractSize", "movementUnit", "manualPipValuePerLot"] as const) {
      const value = record[field];
      if (typeof value !== "number" && typeof value !== "string") continue;
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) next[field] = number;
    }
    if (Object.keys(next).length) overrides[symbol] = { ...overrides[symbol], ...next };
  }

  return overrides;
}

export function resolveInstrumentLotRules(
  pair: string,
  overrides: Record<string, InstrumentLotOverride> = {},
): InstrumentLotRules {
  const symbol = normalizePair(pair);
  const override = overrides[symbol];
  const defaultLotStep = getDefaultLotStep(symbol);
  const defaultMinLot = getDefaultMinLot(symbol);

  return {
    symbol,
    lotStep: override?.lotStep ?? defaultLotStep,
    minLot: override?.minLot ?? defaultMinLot,
    source: override ? "override" : "default",
  };
}

/** Effective broker specifications shared by sizing, conversions and price adjustments. */
export function resolveInstrumentSpecification(pair: string, overrides: Record<string, InstrumentLotOverride> = {}) {
  const instrument = getInstrumentSpec(pair);
  const override = sanitizeInstrumentLotOverrides(overrides)[instrument.symbol];
  return {
    ...instrument,
    contractSize: override?.contractSize ?? instrument.contractSize,
    pipSize: override?.movementUnit ?? instrument.pipSize,
    defaultLotStep: override?.lotStep ?? instrument.defaultLotStep,
    defaultMinLot: override?.minLot ?? instrument.defaultMinLot,
    manualPipValuePerLot: override?.manualPipValuePerLot,
  };
}
