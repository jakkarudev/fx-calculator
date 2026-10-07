import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLot, formatPrice } from "@/domain/fx/format";
import type { PositionResult } from "@/domain/fx/types";
import { signalHistoryPageSize, tradeOriginLabel, type SignalHistoryEntry } from "./signal-history";

type Props = {
  history: SignalHistoryEntry[];
  onSelect?: (entry: SignalHistoryEntry) => void;
};

function directionLabel(result: PositionResult) {
  return result.side === "buy" ? "LONG" : "SHORT";
}

function orderTypeLabel(result: PositionResult) {
  return result.orderType === "limit" ? " LIMIT" : "";
}

function ValueLines({ label, result, muted = false }: { label: string; result: PositionResult; muted?: boolean }) {
  const className = muted ? "text-xs text-[rgb(var(--muted-foreground))]" : "text-sm font-medium";

  return (
    <div className={className}>
      <p>
        {label} entry {formatPrice(result.entry, result.priceText?.entry)}
      </p>
      <p>
        SL {formatPrice(result.stopLoss, result.priceText?.stopLoss)} · TP{" "}
        {formatPrice(result.takeProfit, result.priceText?.takeProfit)} · Lot {formatLot(result.lotSize)}
      </p>
    </div>
  );
}

export function SignalHistoryCard({ history, onSelect }: Props) {
  const [pageIndex, setPageIndex] = useState(0);
  const totalPages = Math.max(1, Math.ceil(history.length / signalHistoryPageSize));
  const currentPageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = currentPageIndex * signalHistoryPageSize;
  const pageEnd = Math.min(pageStart + signalHistoryPageSize, history.length);
  const visibleHistory = useMemo(() => history.slice(pageStart, pageEnd), [history, pageEnd, pageStart]);
  const hasMultiplePages = history.length > signalHistoryPageSize;
  const latestHistoryId = history[0]?.id ?? null;

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    setPageIndex(0);
  }, [latestHistoryId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Signal history</CardTitle>
            <CardDescription>Signals appear here after you copy a calculated value.</CardDescription>
          </div>
          {history.length > 0 ? (
            <p className="shrink-0 text-xs text-[rgb(var(--muted-foreground))]">
              Showing {pageStart + 1}-{pageEnd} of {history.length}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.length === 0 ? (
          <p className="rounded-xl bg-[rgb(var(--muted))] px-3 py-2 text-sm text-[rgb(var(--muted-foreground))]">
            No copied signals yet.
          </p>
        ) : (
          <>
            {visibleHistory.map((entry) => {
              const primary = entry.adjusted ?? entry.original;

              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={`Open ${primary.pair} ${directionLabel(primary)} history signal`}
                  className="w-full rounded-xl border border-[rgb(var(--border))] px-3 py-2 text-left transition-colors hover:bg-[rgb(var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))]"
                  onClick={() => onSelect?.(entry)}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {primary.pair} {directionLabel(primary)}
                    </p>
                    <Badge variant="outline">
                      {directionLabel(primary)}
                      {orderTypeLabel(primary)}
                    </Badge>
                    <Badge variant="outline">{tradeOriginLabel(entry)}</Badge>
                    {entry.adjusted ? <Badge>Adjusted</Badge> : null}
                  </div>
                  {entry.adjusted ? <ValueLines label="Adjusted" result={entry.adjusted} /> : null}
                  <ValueLines label="Original" result={entry.original} muted />
                </button>
              );
            })}
            {hasMultiplePages ? (
              <div className="flex items-center justify-between gap-3 pt-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous history page"
                  disabled={currentPageIndex === 0}
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-sm text-[rgb(var(--muted-foreground))]">
                  Page {currentPageIndex + 1} of {totalPages}
                </p>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next history page"
                  disabled={currentPageIndex >= totalPages - 1}
                  onClick={() => setPageIndex((current) => Math.min(totalPages - 1, current + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
