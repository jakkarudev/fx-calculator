import { Check, Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLot, formatNumber, formatPrice } from "@/domain/fx/format";
import type { PositionResult } from "@/domain/fx/types";
import { copyText } from "@/lib/clipboard";
import { formatTradeClipboardText, tradeOriginLabel, type SignalHistoryEntry } from "./signal-history";

type Props = {
  entry: SignalHistoryEntry | null;
  onClose: () => void;
};

function directionLabel(result: PositionResult) {
  return result.side === "buy" ? "LONG" : "SHORT";
}

function orderTypeLabel(result: PositionResult) {
  return result.orderType === "limit" ? " LIMIT" : "";
}

function getCopyButtonClassName(label: string) {
  switch (label) {
    case "Stop loss":
      return "h-12 w-12 shrink-0 border border-red-500 bg-red-500/15 text-red-400 shadow-sm shadow-red-950/20 backdrop-blur-md hover:bg-red-500/25";
    case "Take profit":
      return "h-12 w-12 shrink-0 border border-green-500 bg-green-500/15 text-green-400 shadow-sm shadow-green-950/20 backdrop-blur-md hover:bg-green-500/25";
    case "Lot size":
      return "h-12 w-12 shrink-0 border border-yellow-400 bg-yellow-400/15 text-yellow-300 shadow-sm shadow-yellow-950/20 backdrop-blur-md hover:bg-yellow-400/25";
    case "Entry":
    default:
      return "h-12 w-12 shrink-0 border border-white bg-white/15 text-white shadow-sm shadow-black/20 backdrop-blur-md hover:bg-white/25";
  }
}

export function SignalHistoryFloatingPanel({ entry, onClose }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    setCopied(null);
    setShowOriginal(false);
  }, [entry?.id]);

  if (!entry) return null;

  const hasAdjustedValues = Boolean(entry.adjusted);
  const visibleResult = hasAdjustedValues && !showOriginal && entry.adjusted ? entry.adjusted : entry.original;
  const modeLabel = hasAdjustedValues ? (showOriginal ? "Original values" : "Adjusted values") : "Original values";
  const rows = [
    {
      label: "Entry",
      value: formatPrice(visibleResult.entry, visibleResult.priceText?.entry),
      originalValue: formatPrice(entry.original.entry, entry.original.priceText?.entry),
      adjustedValue: entry.adjusted ? formatPrice(entry.adjusted.entry, entry.adjusted.priceText?.entry) : null,
    },
    {
      label: "Stop loss",
      value: formatPrice(visibleResult.stopLoss, visibleResult.priceText?.stopLoss),
      originalValue: formatPrice(entry.original.stopLoss, entry.original.priceText?.stopLoss),
      adjustedValue: entry.adjusted ? formatPrice(entry.adjusted.stopLoss, entry.adjusted.priceText?.stopLoss) : null,
    },
    {
      label: "Take profit",
      value: formatPrice(visibleResult.takeProfit, visibleResult.priceText?.takeProfit),
      originalValue: formatPrice(entry.original.takeProfit, entry.original.priceText?.takeProfit),
      adjustedValue: entry.adjusted
        ? formatPrice(entry.adjusted.takeProfit, entry.adjusted.priceText?.takeProfit)
        : null,
    },
    {
      label: "Lot size",
      value: formatLot(visibleResult.lotSize),
      originalValue: formatLot(entry.original.lotSize),
      adjustedValue: entry.adjusted ? formatLot(entry.adjusted.lotSize) : null,
    },
  ];
  const pipModeLabel =
    visibleResult.pipValueMode === "converted"
      ? " converted"
      : visibleResult.pipValueMode === "estimated"
        ? " estimated"
        : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close history signal"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`History signal ${visibleResult.pair} ${directionLabel(visibleResult)}`}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] text-[rgb(var(--card-foreground))] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--border))] p-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">{visibleResult.pair}</h2>
              <Badge variant="outline">
                {directionLabel(visibleResult)}
                {orderTypeLabel(visibleResult)}
              </Badge>
              <Badge variant="outline">{tradeOriginLabel(entry)}</Badge>
              <Badge>{modeLabel}</Badge>
            </div>
            <p className="mt-1 text-sm text-[rgb(var(--muted-foreground))]">
              RR {formatNumber(visibleResult.rr, 2)} · Target risk {formatNumber(visibleResult.riskAmount, 2)} · Actual
              risk {formatNumber(visibleResult.actualRiskAmount, 2)} ({formatNumber(visibleResult.actualRiskPercent, 2)}
              %) · Pip/point {formatNumber(visibleResult.pipValuePerLot, 2)}
              {pipModeLabel}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          {copied ? <Badge>{copied} copied</Badge> : null}
          {hasAdjustedValues ? (
            <Button variant="outline" className="w-full" onClick={() => setShowOriginal((current) => !current)}>
              {showOriginal ? "Show adjusted values" : "Show original values"}
            </Button>
          ) : null}
          {visibleResult.actualRiskExceedsTarget ? (
            <p className="rounded-xl bg-[rgb(var(--destructive))]/10 px-3 py-2 text-sm text-[rgb(var(--destructive))]">
              Actual risk is above your target because the minimum lot size is larger than the calculated safe lot.
            </p>
          ) : null}
          <Button
            variant="outline"
            className="w-full border border-[rgb(var(--primary))] bg-[rgb(var(--primary))]/15 text-[rgb(var(--primary))] shadow-sm shadow-black/20 backdrop-blur-md hover:bg-[rgb(var(--primary))]/25"
            aria-label="Copy trade"
            onClick={async () => {
              if (!(await copyText(formatTradeClipboardText(visibleResult)))) return;
              setCopied("Trade");
              window.setTimeout(() => setCopied(null), 1200);
            }}
          >
            {copied === "Trade" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            Copy trade
          </Button>
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--border))] px-3 py-2"
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-[rgb(var(--muted-foreground))]">{row.label}</p>
                <p className="text-lg font-semibold">{row.value}</p>
                {hasAdjustedValues ? (
                  <p className="text-xs text-[rgb(var(--muted-foreground))]">
                    Original {row.originalValue} · Adjusted {row.adjustedValue}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={getCopyButtonClassName(row.label)}
                aria-label={`Copy ${row.label}`}
                onClick={async () => {
                  if (!(await copyText(row.value))) return;
                  setCopied(row.label);
                  window.setTimeout(() => setCopied(null), 1200);
                }}
              >
                {copied === row.label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
