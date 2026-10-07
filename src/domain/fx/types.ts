import type { InstrumentLotOverride } from "./instrument-rules";

export type SignalSide = "buy" | "sell";
export type OrderType = "market" | "limit";

export type PriceText = {
  entry?: string;
  stopLoss?: string;
  takeProfit?: string;
};

export type ParsedSignal = {
  pair: string;
  side: SignalSide;
  orderType: OrderType;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  priceText?: PriceText;
};

export type PositionInput = ParsedSignal & {
  accountBalance: number;
  riskPercent: number;
  accountCurrency: string;
  lotStep?: number;
  minLot?: number;
  maxLot?: number;
  instrumentOverrides?: Record<string, InstrumentLotOverride>;
  manualPipValuePerLot?: number;
  eurUsdRate?: number;
  quoteToAccountRate?: number;
  baseToAccountRate?: number;
  requireReliablePipValue?: boolean;
};

export type PositionResult = ParsedSignal & {
  pipSize: number;
  stopPips: number;
  rewardPips: number;
  rr: number;
  riskAmount: number;
  rewardAmount: number;
  pipValuePerLot: number;
  pipValueMode: "exact" | "converted" | "manual" | "estimated";
  rawLotSize: number;
  lotSize: number;
  actualRiskAmount: number;
  actualRiskPercent: number;
  actualRiskExceedsTarget: boolean;
  accountCurrency: string;
};
