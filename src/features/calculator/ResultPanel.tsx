import { Check, Copy, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { copyText } from "@/lib/clipboard";
import { formatLot, formatNumber, formatPrice } from "@/domain/fx/format";
import type { AdjustmentRejectionReason } from "@/domain/fx/adjust-signal";
import type { PositionResult } from "@/domain/fx/types";
import { useEffect, useState } from "react";
import { formatTradeClipboardText } from "./signal-history";

type Props = {
  result: PositionResult | null;
  error?: string | null;
  originalResult?: PositionResult | null;
  adjustedResult?: PositionResult | null;
  adjustmentEnabled?: boolean;
  adjustmentChanged?: boolean;
  adjustmentRejectionReason?: AdjustmentRejectionReason;
  onCopyValue?: () => void;
};

function getAdjustmentUnavailableMessage(reason: AdjustmentRejectionReason) {
  switch (reason) {
    case "risk":
      return "Price adjustment skipped because the adjusted lot size would exceed your risk limit.";
    case "rr":
      return "Price adjustment skipped because RR would fall too much.";
    case "price-structure":
      return "Price adjustment skipped because entry, stop loss, or take profit would overlap or cross.";
    case "unchanged":
      return "Price adjustment skipped because the requested movement rounds back to the original prices.";
    case "no-valid-candidate":
      return "Price adjustment skipped because no safe adjusted price set was found.";
    case "disabled":
    case null:
    default:
      return "Price adjustment unavailable for this setup; original values are shown.";
  }
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

export function ResultPanel({
  result,
  error,
  originalResult = null,
  adjustedResult = null,
  adjustmentEnabled = false,
  adjustmentChanged = false,
  adjustmentRejectionReason = null,
  onCopyValue,
}: Props) {
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const hasAdjustedValues = adjustmentEnabled && adjustmentChanged && originalResult && adjustedResult;

  useEffect(() => {
    setShowOriginal(false);
  }, [adjustedResult?.entry, adjustedResult?.stopLoss, adjustedResult?.takeProfit]);

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Calculation issue</CardTitle>
          <CardDescription>Review the trade inputs and calculate again.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-2 text-sm text-red-500">
          <TriangleAlert className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Calculate a manual trade or import a signal to see results.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const visibleResult = hasAdjustedValues && showOriginal ? originalResult : result;
  const modeLabel = hasAdjustedValues ? (showOriginal ? "Original values" : "Adjusted values") : null;
  const directionLabel = visibleResult.side === "buy" ? "LONG" : "SHORT";
  const rows = [
    {
      label: "Entry",
      value: formatPrice(visibleResult.entry, visibleResult.priceText?.entry),
      originalValue: originalResult ? formatPrice(originalResult.entry, originalResult.priceText?.entry) : null,
      adjustedValue: adjustedResult ? formatPrice(adjustedResult.entry, adjustedResult.priceText?.entry) : null,
    },
    {
      label: "Stop loss",
      value: formatPrice(visibleResult.stopLoss, visibleResult.priceText?.stopLoss),
      originalValue: originalResult ? formatPrice(originalResult.stopLoss, originalResult.priceText?.stopLoss) : null,
      adjustedValue: adjustedResult ? formatPrice(adjustedResult.stopLoss, adjustedResult.priceText?.stopLoss) : null,
    },
    {
      label: "Take profit",
      value: formatPrice(visibleResult.takeProfit, visibleResult.priceText?.takeProfit),
      originalValue: originalResult
        ? formatPrice(originalResult.takeProfit, originalResult.priceText?.takeProfit)
        : null,
      adjustedValue: adjustedResult
        ? formatPrice(adjustedResult.takeProfit, adjustedResult.priceText?.takeProfit)
        : null,
      helpText: `Reward ${formatNumber(visibleResult.rewardAmount, 2)} ${visibleResult.accountCurrency}`,
    },
    {
      label: "Lot size",
      value: formatLot(visibleResult.lotSize),
      originalValue: originalResult ? formatLot(originalResult.lotSize) : null,
      adjustedValue: adjustedResult ? formatLot(adjustedResult.lotSize) : null,
    },
  ];
  const pipModeLabel =
    visibleResult.pipValueMode === "converted"
      ? " converted"
      : visibleResult.pipValueMode === "estimated"
        ? " estimated"
        : "";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {visibleResult.pair}
              <Badge variant="outline">
                {directionLabel}
                {visibleResult.orderType === "limit" ? " LIMIT" : ""}
              </Badge>
              {modeLabel ? <Badge>{modeLabel}</Badge> : null}
            </CardTitle>
            <CardDescription>
              RR {formatNumber(visibleResult.rr, 2)} · Target risk {formatNumber(visibleResult.riskAmount, 2)} · Actual
              risk {formatNumber(visibleResult.actualRiskAmount, 2)} ({formatNumber(visibleResult.actualRiskPercent, 2)}
              %) · Pip/point {formatNumber(visibleResult.pipValuePerLot, 2)}
              {pipModeLabel}
            </CardDescription>
          </div>
          {copied ? <Badge>{copied} copied</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {copyError && (
          <p role="alert" className="text-sm text-red-500">
            {copyError}
          </p>
        )}
        {hasAdjustedValues ? (
          <Button variant="outline" className="w-full" onClick={() => setShowOriginal((current) => !current)}>
            {showOriginal ? "Show adjusted values" : "Show original values"}
          </Button>
        ) : adjustmentEnabled ? (
          <p className="rounded-xl bg-[rgb(var(--muted))] px-3 py-2 text-sm text-[rgb(var(--muted-foreground))]">
            {getAdjustmentUnavailableMessage(adjustmentRejectionReason)}
          </p>
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
            if (!(await copyText(formatTradeClipboardText(visibleResult)))) {
              setCopyError("Unable to copy. Try again.");
              return;
            }
            setCopyError(null);
            onCopyValue?.();
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
              {"helpText" in row && row.helpText ? (
                <p className="text-xs text-[rgb(var(--muted-foreground))]">{row.helpText}</p>
              ) : null}
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
                if (!(await copyText(row.value))) {
                  setCopyError("Unable to copy. Try again.");
                  return;
                }
                setCopyError(null);
                onCopyValue?.();
                setCopied(row.label);
                window.setTimeout(() => setCopied(null), 1200);
              }}
            >
              {copied === row.label ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
