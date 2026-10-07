import { calculatePosition } from "./calculate-position";
import { formatPrice, getDecimalPlaces } from "./format";
import { getInstrumentSpec } from "./pairs";
import { validateParsedSignal } from "./validate-signal";
import type { PositionInput, PositionResult } from "./types";

export type AdjustmentRejectionReason =
  | "disabled"
  | "risk"
  | "rr"
  | "price-structure"
  | "unchanged"
  | "no-valid-candidate"
  | null;
export type RiskAdjustmentBufferMode = "plus" | "minus" | "both";
export type PriceAdjustmentMode = "fixed" | "signal-relative";
export type PriceAdjustmentStrength = "subtle" | "normal" | "strong";
export type PriceAdjustmentProfile = "shift" | "keep-risk" | "keep-rr";

export type PriceAdjustmentOptions = {
  enabled: boolean;
  mode?: PriceAdjustmentMode;
  fixedPips?: number;
  strength?: PriceAdjustmentStrength;
  profile?: PriceAdjustmentProfile;
  riskBuffer?: number;
  riskBufferMode?: RiskAdjustmentBufferMode;
};

export type AdjustedPosition = {
  original: PositionResult;
  adjusted: PositionResult | null;
  active: PositionResult;
  changed: boolean;
  originalActualRiskPercent: number;
  adjustedActualRiskPercent: number | null;
  rejectionReason: AdjustmentRejectionReason;
};

function getPriceDecimals(input: PositionInput, pipSize: number) {
  return Math.max(
    getDecimalPlaces(pipSize),
    pipSize < 1 ? getDecimalPlaces(pipSize) + 1 : 0,
    getDecimalPlaces(input.priceText?.entry ?? input.entry),
    getDecimalPlaces(input.priceText?.stopLoss ?? input.stopLoss),
    getDecimalPlaces(input.priceText?.takeProfit ?? input.takeProfit),
  );
}

function roundPrice(value: number, decimals: number) {
  return Number(value.toFixed(decimals));
}

function normalizeAdjustmentPips(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

const signalRelativeRatios: Record<PriceAdjustmentStrength, number> = {
  subtle: 0.02,
  normal: 0.035,
  strong: 0.05,
};

const signalRelativeCaps: Record<"forex" | "metal" | "index", Record<PriceAdjustmentStrength, number>> = {
  forex: {
    subtle: 1,
    normal: 2,
    strong: 3,
  },
  metal: {
    subtle: 20,
    normal: 35,
    strong: 50,
  },
  index: {
    subtle: 2,
    normal: 4,
    strong: 8,
  },
};

function normalizeAdjustmentMode(value: PriceAdjustmentMode | undefined): PriceAdjustmentMode {
  return value === "signal-relative" ? "signal-relative" : "fixed";
}

function normalizeAdjustmentStrength(value: PriceAdjustmentStrength | undefined): PriceAdjustmentStrength {
  return value === "subtle" || value === "strong" ? value : "normal";
}

function normalizeAdjustmentProfile(value: PriceAdjustmentProfile | undefined): PriceAdjustmentProfile {
  return value === "shift" || value === "keep-rr" ? value : "keep-risk";
}

function hasChangedPrices(original: PositionResult, candidate: PositionResult) {
  return (
    original.entry !== candidate.entry ||
    original.stopLoss !== candidate.stopLoss ||
    original.takeProfit !== candidate.takeProfit
  );
}

function normalizeRiskBuffer(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0.2;
}

function normalizeRiskBufferMode(value: RiskAdjustmentBufferMode | undefined): RiskAdjustmentBufferMode {
  return value === "minus" || value === "both" ? value : "plus";
}

function normalizeAdjustmentOptions(
  enabledOrOptions: boolean | PriceAdjustmentOptions,
  adjustmentPips?: number,
  riskBuffer?: number,
  riskBufferMode?: RiskAdjustmentBufferMode,
): Required<PriceAdjustmentOptions> {
  if (typeof enabledOrOptions === "boolean") {
    return {
      enabled: enabledOrOptions,
      mode: "fixed",
      fixedPips: normalizeAdjustmentPips(adjustmentPips),
      strength: "normal",
      profile: "keep-risk",
      riskBuffer: normalizeRiskBuffer(riskBuffer),
      riskBufferMode: normalizeRiskBufferMode(riskBufferMode),
    };
  }

  return {
    enabled: enabledOrOptions.enabled,
    mode: normalizeAdjustmentMode(enabledOrOptions.mode),
    fixedPips: normalizeAdjustmentPips(enabledOrOptions.fixedPips),
    strength: normalizeAdjustmentStrength(enabledOrOptions.strength),
    profile: normalizeAdjustmentProfile(enabledOrOptions.profile),
    riskBuffer: normalizeRiskBuffer(enabledOrOptions.riskBuffer),
    riskBufferMode: normalizeRiskBufferMode(enabledOrOptions.riskBufferMode),
  };
}

function resolveRequestedAdjustmentPips(original: PositionResult, options: Required<PriceAdjustmentOptions>) {
  const instrument = getInstrumentSpec(original.pair);
  if (instrument.kind === "crypto") {
    // Application policy, not a broker specification: fixed movement is an upper
    // bound. Cap both modes by stop distance and entry, then floor to price precision
    // so rounding cannot exceed the cap on low-price contracts.
    const entryRatios = { subtle: 0.0005, normal: 0.001, strong: 0.002 };
    const safeDistance = Math.min(
      Math.abs(original.entry - original.stopLoss) * signalRelativeRatios[options.strength],
      original.entry * entryRatios[options.strength],
    );
    const distance =
      options.mode === "fixed" ? Math.min(options.fixedPips * original.pipSize, safeDistance) : safeDistance;
    const tick = 10 ** -instrument.priceDigits;
    return Number(((Math.floor(distance / tick + 1e-9) * tick) / original.pipSize).toFixed(instrument.priceDigits));
  }
  if (options.mode === "fixed") return options.fixedPips;

  const ratio = signalRelativeRatios[options.strength];
  // Commodity cap is application policy in quoted precision units, not a sourced execution tick.
  const commodityPrecisionUnits = { subtle: 1, normal: 2, strong: 3 };
  const cap =
    instrument.kind === "commodity"
      ? (commodityPrecisionUnits[options.strength] * 10 ** -instrument.priceDigits) / original.pipSize
      : (signalRelativeCaps[instrument.kind as keyof typeof signalRelativeCaps] ?? signalRelativeCaps.index)[
          options.strength
        ];
  // Equity movement units are whole currency units, not their displayed price precision.
  // Limit the default shift to 5/10/20 displayed increments instead of index points.
  const equityIncrements = { subtle: 5, normal: 10, strong: 20 };
  const instrumentCap =
    instrument.kind === "equity"
      ? (equityIncrements[options.strength] * 10 ** -instrument.priceDigits) / original.pipSize
      : cap;
  const requestedPips = original.stopPips * ratio;

  return Number(Math.min(requestedPips, instrumentCap).toFixed(6));
}

function isRiskAllowed(
  actualRiskPercent: number,
  input: PositionInput,
  riskBuffer: number,
  mode: RiskAdjustmentBufferMode,
) {
  const lowerLimit = Math.max(0, input.riskPercent - riskBuffer);
  const upperLimit = input.riskPercent + riskBuffer;

  if (mode === "both") {
    return actualRiskPercent >= lowerLimit && actualRiskPercent <= upperLimit;
  }

  if (mode === "minus") {
    return actualRiskPercent >= lowerLimit && actualRiskPercent <= input.riskPercent;
  }

  return actualRiskPercent <= upperLimit;
}

function isRrAllowed(candidate: PositionResult, original: PositionResult, profile: PriceAdjustmentProfile) {
  if (profile === "keep-risk") {
    return candidate.rr >= original.rr - 0.2;
  }

  return Math.abs(candidate.rr - original.rr) <= 0.01;
}

function getCandidateAdjustmentPips(requestedPips: number) {
  const factors = [1, 0.75, 0.5, 0.25, 0.1];
  const candidates = factors.map((factor) => requestedPips * factor);

  return Array.from(new Set(candidates.map((value) => Number(value.toFixed(6)))));
}

type CandidateFailure = Exclude<AdjustmentRejectionReason, "disabled" | "unchanged" | "no-valid-candidate" | null>;

function chooseFailureReason(
  failures: CandidateFailure[],
  sawUnchanged: boolean,
): Exclude<AdjustmentRejectionReason, "disabled" | null> {
  if (failures.includes("risk")) return "risk";
  if (failures.includes("rr")) return "rr";
  if (failures.includes("price-structure")) return "price-structure";
  if (sawUnchanged) return "unchanged";
  return "no-valid-candidate";
}

function formatAdjustedPrice(value: number, sourceText: string | undefined, decimals: number) {
  const formatted = formatPrice(value, sourceText);
  return Number(formatted) === value ? formatted : value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

function createCandidate(
  input: PositionInput,
  original: PositionResult,
  adjustmentPips: number,
  profile: PriceAdjustmentProfile,
): PositionInput {
  const pip = original.pipSize;
  const decimals = Math.max(getPriceDecimals(input, pip), getInstrumentSpec(input.pair).adjustmentDigits);
  const distance = pip * adjustmentPips;
  const direction = input.side === "buy" ? 1 : -1;
  const entry = roundPrice(input.entry + distance * direction, decimals);
  let stopLoss: number;
  let takeProfit: number;

  if (profile === "shift") {
    stopLoss = roundPrice(input.stopLoss + distance * direction, decimals);
    takeProfit = roundPrice(input.takeProfit + distance * direction, decimals);
  } else {
    stopLoss = roundPrice(input.stopLoss - distance * direction, decimals);

    if (profile === "keep-rr") {
      const stopDistance = Math.abs(entry - stopLoss);
      const rewardDistance = stopDistance * original.rr;
      takeProfit = roundPrice(entry + rewardDistance * direction, decimals);
    } else {
      takeProfit = roundPrice(input.takeProfit + distance * direction, decimals);
    }
  }

  return {
    ...input,
    entry,
    stopLoss,
    takeProfit,
    priceText: {
      entry: formatAdjustedPrice(entry, input.priceText?.entry, decimals),
      stopLoss: formatAdjustedPrice(stopLoss, input.priceText?.stopLoss, decimals),
      takeProfit: formatAdjustedPrice(takeProfit, input.priceText?.takeProfit, decimals),
    },
  };
}

export function createAdjustedPosition(
  input: PositionInput,
  enabledOrOptions: boolean | PriceAdjustmentOptions,
  adjustmentPips?: number,
  riskBuffer?: number,
  riskBufferMode?: RiskAdjustmentBufferMode,
): AdjustedPosition {
  const original = calculatePosition(input);
  const originalActualRiskPercent = original.actualRiskPercent;
  const options = normalizeAdjustmentOptions(enabledOrOptions, adjustmentPips, riskBuffer, riskBufferMode);

  if (!options.enabled) {
    return {
      original,
      adjusted: null,
      active: original,
      changed: false,
      originalActualRiskPercent,
      adjustedActualRiskPercent: null,
      rejectionReason: "disabled",
    };
  }

  const requestedPips = resolveRequestedAdjustmentPips(original, options);
  const candidatePips = getCandidateAdjustmentPips(requestedPips);
  const failures: CandidateFailure[] = [];
  let sawUnchanged = false;

  for (const pips of candidatePips) {
    const candidateInput = createCandidate(input, original, pips, options.profile);
    // A rejected adjustment must not discard a valid original. Check generated
    // prices before calculation so smaller candidates can still be considered.
    if (!validateParsedSignal(candidateInput).ok) {
      failures.push("price-structure");
      continue;
    }
    const candidate = calculatePosition(candidateInput);
    const candidateActualRiskPercent = candidate.actualRiskPercent;
    const rrAllowed = isRrAllowed(candidate, original, options.profile);
    const riskAllowed = isRiskAllowed(candidateActualRiskPercent, input, options.riskBuffer, options.riskBufferMode);
    const changedPrices = hasChangedPrices(original, candidate);

    if (!changedPrices) {
      sawUnchanged = true;
      continue;
    }

    if (!riskAllowed) {
      failures.push("risk");
      continue;
    }

    if (!rrAllowed) {
      failures.push("rr");
      continue;
    }

    return {
      original,
      adjusted: candidate,
      active: candidate,
      changed: true,
      originalActualRiskPercent,
      adjustedActualRiskPercent: candidateActualRiskPercent,
      rejectionReason: null,
    };
  }

  return {
    original,
    adjusted: null,
    active: original,
    changed: false,
    originalActualRiskPercent,
    adjustedActualRiskPercent: null,
    rejectionReason: chooseFailureReason(failures, sawUnchanged),
  };
}
