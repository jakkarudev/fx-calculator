import { RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SignalPasteCard } from "./SignalPasteCard";
import { ManualInputForm } from "./ManualInputForm";
import { ResultPanel } from "./ResultPanel";
import { SignalHistoryCard } from "./SignalHistoryCard";
import { SignalHistoryFloatingPanel } from "./SignalHistoryFloatingPanel";
import { SettingsSheet } from "./SettingsSheet";
import { useCalculatorState } from "./use-calculator-state";
import { calculateTrade, resolveTradeLotRules } from "./calculate-trade";
import {
  createTradeDraft,
  draftToSignal,
  editTradeDraft,
  emptyTradeDraft,
  restoreDraft,
  serializeDraft,
  type TradeDraft,
} from "./trade-draft";
import { getPipValueConversionPlan, type PipValueRateCandidate } from "@/domain/fx/conversion-rules";
import { formatLot } from "@/domain/fx/format";
import { normalizePair } from "@/domain/fx";
import { parseSignal } from "@/domain/fx/parse-signal";
import { readText } from "@/lib/clipboard";
import { fetchExchangeRate, type ExchangeRate } from "@/lib/fx-rates";
import { recognizeTextFromImageFile } from "@/lib/ocr";
import { getPreference, setPreference } from "@/lib/preferences";
import {
  createSignalHistoryEntry,
  parseSignalHistory,
  serializeSignalHistory,
  signalHistoryPreferenceKey,
  upsertSignalHistoryEntry,
  type SignalHistoryEntry,
} from "./signal-history";

const draftPreferenceKey = "fxcalc.draft";
const liveRateSettingKeys = new Set([
  "eurUsdRate",
  "eurUsdRateConfirmed",
  "eurUsdRateDate",
  "eurUsdRateFetchedAt",
  "eurUsdRateSource",
]);
const defaultRawSignal = "EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250";

type PipValueExchangeRate = ExchangeRate & {
  useAs: PipValueRateCandidate["useAs"];
};

export function CalculatorScreen() {
  const { settings, updateSettings, refreshEurUsdRate, rateStatus } = useCalculatorState();
  const [rawSignal, setRawSignal] = useState(defaultRawSignal);
  const [importedSource, setImportedSource] = useState(defaultRawSignal);
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [manualDraft, setManualDraft] = useState<TradeDraft>({ ...emptyTradeDraft, side: "auto" });
  const [importDraft, setImportDraft] = useState<TradeDraft | null>(() =>
    createTradeDraft(parseSignal(defaultRawSignal)),
  );
  const tradeDraft = mode === "manual" ? manualDraft : importDraft;
  const setTradeDraft = mode === "manual" ? setManualDraft : setImportDraft;
  const [manualCalculationKey, setManualCalculationKey] = useState<string | null>(null);
  const [manualRevision, setManualRevision] = useState(0);
  const [pendingManualInputKey, setPendingManualInputKey] = useState<string | null>(null);
  const effectiveSettings = {
    ...settings,
    priceAdjustmentEnabled: mode === "manual" ? settings.manualPriceAdjustmentEnabled : settings.priceAdjustmentEnabled,
  };
  const setAdjustmentEnabled = (enabled: boolean) => {
    if (mode === "manual") {
      setManualRevision((revision) => revision + 1);
      updateSettings({ ...settings, manualPriceAdjustmentEnabled: enabled });
    } else {
      updateSettings({ ...settings, priceAdjustmentEnabled: enabled });
    }
  };
  const parsed = useMemo(() => {
    if (!tradeDraft) return null;
    const resolvedDraft =
      tradeDraft.side === "auto"
        ? { ...tradeDraft, side: Number(tradeDraft.stopLoss) < Number(tradeDraft.entry) ? "buy" : "sell" }
        : tradeDraft;
    return draftToSignal(resolvedDraft);
  }, [tradeDraft]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [imageReadStatus, setImageReadStatus] = useState<"idle" | "reading">("idle");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quoteRate, setQuoteRate] = useState<PipValueExchangeRate | null>(null);
  const [quoteRateRequestKey, setQuoteRateRequestKey] = useState<string | null>(null);
  const [quoteRateStatus, setQuoteRateStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [signalHistory, setSignalHistory] = useState<SignalHistoryEntry[]>([]);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<SignalHistoryEntry | null>(null);
  const parsedPair = parsed?.pair ?? null;
  const activeLotRules = (() => {
    try {
      return resolveTradeLotRules(parsedPair ?? emptyTradeDraft.pair, settings);
    } catch {
      return resolveTradeLotRules(emptyTradeDraft.pair, settings);
    }
  })();
  const hasManualPipValue = settings.manualPipValuePerLot !== null && settings.manualPipValuePerLot > 0;
  const preferEurUsdRate = settings.eurUsdRateConfirmed || rateStatus !== "error";
  const conversionPlan = useMemo(() => {
    try {
      return parsedPair
        ? getPipValueConversionPlan(
            parsedPair,
            settings.accountCurrency,
            hasManualPipValue,
            settings.instrumentOverrides,
            preferEurUsdRate,
          )
        : { usesEurUsd: false, candidates: [] };
    } catch {
      return { usesEurUsd: false, candidates: [] };
    }
  }, [hasManualPipValue, parsedPair, settings.accountCurrency, settings.instrumentOverrides, preferEurUsdRate]);
  const pipValueRateCandidates = conversionPlan.candidates;
  const requiredRateKey = JSON.stringify({ parsedPair, pipValueRateCandidates });

  const applyParsedSignal = useCallback((value: string) => {
    try {
      const next = parseSignal(value);
      setImportDraft(createTradeDraft(next));
      setImportedSource(value);
      setParseError(null);
    } catch (error) {
      setImportDraft(null);
      setParseError(error instanceof Error ? error.message : "Unable to parse signal.");
    }
  }, []);

  const handleSignalImage = useCallback(
    async (file: File) => {
      setImageReadStatus("reading");
      setParseError(null);

      try {
        const text = await recognizeTextFromImageFile(file);
        setRawSignal(text);
        applyParsedSignal(text);
      } catch (error) {
        setParseError(error instanceof Error ? error.message : "Unable to read signal screenshot.");
      } finally {
        setImageReadStatus("idle");
      }
    },
    [applyParsedSignal],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await getPreference(draftPreferenceKey);
      if (cancelled) return;
      const draft = restoreDraft(stored);
      if (draft) {
        setMode(draft.mode);
        setManualDraft(draft.manualDraft);
        setImportDraft(draft.importDraft);
        setRawSignal(draft.rawSignal);
        setImportedSource(draft.importedSource);
        setParseError(draft.parseError);
      }

      setDraftLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;

    const draft = {
      mode,
      manualDraft,
      importDraft,
      rawSignal,
      importedSource,
    };
    void setPreference(draftPreferenceKey, serializeDraft(draft));
  }, [draftLoaded, rawSignal, importedSource, mode, manualDraft, importDraft]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const storedHistory = parseSignalHistory(await getPreference(signalHistoryPreferenceKey));
      if (cancelled) return;

      setSignalHistory((current) => (current.length > 0 ? current : storedHistory));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setQuoteRateRequestKey(requiredRateKey);
    if (!parsedPair) {
      setQuoteRate(null);
      setQuoteRateStatus("idle");
      return;
    }

    if (pipValueRateCandidates.length === 0) {
      setQuoteRate(null);
      setQuoteRateStatus("ready");
      return;
    }

    let cancelled = false;
    setQuoteRate(null);
    setQuoteRateStatus("loading");

    void (async () => {
      for (const candidate of pipValueRateCandidates) {
        try {
          const latest = await fetchExchangeRate(candidate.baseCurrency, candidate.quoteCurrency);
          if (cancelled) return;

          setQuoteRate({ ...latest, useAs: candidate.useAs });
          setQuoteRateStatus("ready");
          return;
        } catch {
          // Try the next conversion route before giving up.
        }
      }

      if (cancelled) return;
      setQuoteRate(null);
      setQuoteRateStatus("error");
    })();

    return () => {
      cancelled = true;
    };
  }, [parsedPair, pipValueRateCandidates, requiredRateKey]);

  const quoteRateMatchesRequiredRate =
    quoteRate !== null &&
    pipValueRateCandidates.some(
      (candidate) =>
        candidate.baseCurrency === quoteRate.base &&
        candidate.quoteCurrency === quoteRate.quote &&
        candidate.useAs === quoteRate.useAs,
    );
  const usesEurUsdRate = conversionPlan.usesEurUsd;
  const isWaitingForEurUsdRate =
    usesEurUsdRate && pipValueRateCandidates.length === 0 && !settings.eurUsdRateConfirmed && rateStatus !== "error";
  const isWaitingForQuoteRate =
    isWaitingForEurUsdRate ||
    (parsed !== null &&
      pipValueRateCandidates.length > 0 &&
      (quoteRateStatus !== "error" || quoteRateRequestKey !== requiredRateKey) &&
      !quoteRateMatchesRequiredRate);

  // User edits invalidate the submitted snapshot; only its awaited transport result may complete it.
  const manualSettings = { ...settings, priceAdjustmentEnabled: settings.manualPriceAdjustmentEnabled };
  const manualInputKey = JSON.stringify({
    manualDraft,
    settings: Object.entries(manualSettings)
      .filter(([key]) => !liveRateSettingKeys.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
    manualRevision,
  });
  const currentCalculationKey = JSON.stringify({
    manualInputKey,
    settings: Object.entries(manualSettings).sort(([a], [b]) => a.localeCompare(b)),
    quoteRate: mode === "manual" && quoteRateMatchesRequiredRate ? quoteRate : null,
  });
  useEffect(() => {
    if (pendingManualInputKey === null) return;
    if (mode !== "manual" || pendingManualInputKey !== manualInputKey) {
      setPendingManualInputKey(null);
    } else if (!isWaitingForQuoteRate) {
      setManualCalculationKey(currentCalculationKey);
      setPendingManualInputKey(null);
    }
  }, [mode, pendingManualInputKey, manualInputKey, isWaitingForQuoteRate, currentCalculationKey]);
  const isOutdated =
    mode === "manual" && manualCalculationKey !== null && manualCalculationKey !== currentCalculationKey;
  const canCalculate = mode === "import" || manualCalculationKey === currentCalculationKey;

  const calculation =
    parsed && canCalculate && !isWaitingForQuoteRate
      ? calculateTrade(parsed, effectiveSettings, {
          quoteToAccountRate: quoteRateMatchesRequiredRate && quoteRate.useAs === "quote" ? quoteRate.rate : undefined,
          baseToAccountRate: quoteRateMatchesRequiredRate && quoteRate.useAs === "base" ? quoteRate.rate : undefined,
        })
      : null;
  const calculationError = isOutdated
    ? "Result outdated. Calculate again to use the current trade."
    : (calculation?.error ?? null);
  const fieldErrors: Partial<Record<"pair" | "entry" | "stopLoss" | "takeProfit", string>> = {};
  if (tradeDraft && (mode === "import" || manualCalculationKey !== null)) {
    for (const field of ["entry", "stopLoss", "takeProfit"] as const) {
      if (!tradeDraft[field].trim() || !Number.isFinite(Number(tradeDraft[field])) || Number(tradeDraft[field]) <= 0)
        fieldErrors[field] =
          `${field === "entry" ? "Entry" : field === "stopLoss" ? "Stop loss" : "Take profit"} must be a positive number.`;
    }
    if (parsed && !Object.keys(fieldErrors).length) {
      if (parsed.side === "buy" ? parsed.stopLoss >= parsed.entry : parsed.stopLoss <= parsed.entry)
        fieldErrors.stopLoss = "Stop loss must agree with the trade direction.";
      if (parsed.side === "buy" ? parsed.takeProfit <= parsed.entry : parsed.takeProfit >= parsed.entry)
        fieldErrors.takeProfit = "Take profit must agree with the trade direction.";
    }
  }
  const calculateManual = () => {
    setManualCalculationKey(currentCalculationKey);
    setPendingManualInputKey(isWaitingForQuoteRate ? manualInputKey : null);
  };
  const adjustedPosition = calculation?.position ?? null;
  const result = adjustedPosition?.active ?? null;
  const historyOriginalResult = adjustedPosition?.original ?? result;
  const historyAdjustedResult = adjustedPosition?.changed ? adjustedPosition.adjusted : null;

  const copySnapshotKey = JSON.stringify({
    mode,
    tradeDraft,
    settings: effectiveSettings,
    quoteRate,
    manualRevision,
    importedSource: mode === "import" ? importedSource : null,
  });
  const currentCopySnapshot = useRef(copySnapshotKey);
  useEffect(() => {
    currentCopySnapshot.current = copySnapshotKey;
  }, [copySnapshotKey]);
  const handleResultCopied = () => {
    if (currentCopySnapshot.current !== copySnapshotKey) return;
    if (!historyOriginalResult || !canCalculate || isOutdated) return;

    const entry = createSignalHistoryEntry({
      origin: mode === "manual" ? "manual" : "imported",
      rawSignal: mode === "import" ? importedSource : "",
      original: historyOriginalResult,
      adjusted: historyAdjustedResult,
    });

    setSignalHistory((current) => {
      const next = upsertSignalHistoryEntry(current, entry);
      void setPreference(signalHistoryPreferenceKey, serializeSignalHistory(next));
      return next;
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[rgb(var(--muted-foreground))]">FX Calculator</p>
          <h1 className="text-2xl font-semibold tracking-tight">Position size</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            onClick={() =>
              mode === "manual" ? calculateManual() : setImportDraft((current) => (current ? { ...current } : null))
            }
            aria-label="Recalculate"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2" aria-label="Trade entry mode">
        <Button
          aria-pressed={mode === "manual"}
          onClick={() => {
            if (mode !== "manual" && pendingManualInputKey !== null) setManualRevision((revision) => revision + 1);
            setMode("manual");
          }}
        >
          Manual
        </Button>
        <Button
          aria-pressed={mode === "import"}
          onClick={() => {
            if (mode !== "import" && pendingManualInputKey !== null) setManualRevision((revision) => revision + 1);
            setMode("import");
          }}
        >
          Import signal
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-[rgb(var(--border))] p-3">
        <div>
          <p className="text-sm font-medium">Adjust prices</p>
          <p className="text-xs text-[rgb(var(--muted-foreground))]">
            {mode === "manual" ? "Apply adjustments when you Calculate." : "Apply adjustments to imported results."}
          </p>
        </div>
        <Switch
          checked={effectiveSettings.priceAdjustmentEnabled}
          onCheckedChange={setAdjustmentEnabled}
          aria-label="Adjust prices"
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account snapshot</CardTitle>
          <CardDescription>
            {settings.accountCurrency} {settings.accountBalance.toFixed(2)} risk {settings.riskPercent.toFixed(2)}%
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-[rgb(var(--muted))] p-3">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Balance</p>
            <p className="font-medium">{settings.accountBalance.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-[rgb(var(--muted))] p-3">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Risk</p>
            <p className="font-medium">{settings.riskPercent.toFixed(2)}%</p>
          </div>
          <div className="rounded-xl bg-[rgb(var(--muted))] p-3">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Lot step</p>
            <p className="font-medium">{formatLot(activeLotRules.lotStep)}</p>
          </div>
          <div className="rounded-xl bg-[rgb(var(--muted))] p-3">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Currency</p>
            <p className="font-medium">{settings.accountCurrency}</p>
          </div>
          <div className="rounded-xl bg-[rgb(var(--muted))] p-3 sm:col-span-4">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Instrument conversion</p>
            <p className="font-medium">
              {isWaitingForEurUsdRate || quoteRateStatus === "loading"
                ? "Loading live rate"
                : quoteRate
                  ? `${quoteRate.base}/${quoteRate.quote} ${quoteRate.rate.toFixed(6)}`
                  : quoteRateStatus === "error"
                    ? "Rate unavailable; calculation blocked"
                    : usesEurUsdRate
                      ? settings.eurUsdRateConfirmed
                        ? `EUR/USD ${settings.eurUsdRate.toFixed(6)}`
                        : "EUR/USD rate unavailable"
                      : "No conversion needed"}
            </p>
            {quoteRate && (
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                {quoteRate.stale ? "Using cached rate after refresh failed" : `Frankfurter ${quoteRate.date}`}
              </p>
            )}
          </div>
          <div className="rounded-xl bg-[rgb(var(--muted))] p-3 sm:col-span-4">
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Instrument lot rules</p>
            <p className="font-medium">
              {activeLotRules.symbol} step {formatLot(activeLotRules.lotStep)} min {formatLot(activeLotRules.minLot)}
            </p>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              {activeLotRules.source === "override" ? "Using manual instrument override" : "Using instrument defaults"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {mode === "import" && (
            <SignalPasteCard
              value={rawSignal}
              onChange={setRawSignal}
              onParse={() => applyParsedSignal(rawSignal)}
              onPaste={async () => {
                const clipboardValue = await readText();
                setRawSignal(clipboardValue);
                applyParsedSignal(clipboardValue);
              }}
              onImageSelected={(file) => void handleSignalImage(file)}
              isReadingImage={imageReadStatus === "reading"}
              error={parseError}
            />
          )}
          <ManualInputForm
            {...(tradeDraft ?? emptyTradeDraft)}
            mode={mode}
            errors={fieldErrors}
            onCalculate={calculateManual}
            onChange={(field, value) => {
              if (mode === "manual") setManualRevision((revision) => revision + 1);
              const next = editTradeDraft(tradeDraft ?? emptyTradeDraft, field, value);
              // Manual selections already carry the catalog's canonical symbol, including suffix casing.
              if (mode === "manual" && field === "pair") next.pair = normalizePair(value) || value;
              const previousPair = tradeDraft?.pair ?? "";
              const pairChanged =
                mode === "manual"
                  ? next.pair !== (normalizePair(previousPair) || previousPair)
                  : value !== previousPair;
              if (field === "pair" && pairChanged) {
                next.entry = "";
                next.stopLoss = "";
                next.takeProfit = "";
                next.priceText = undefined;
              }
              setTradeDraft(next);
            }}
          />
        </div>
        <div className="space-y-4">
          <ResultPanel
            result={result}
            error={calculationError}
            originalResult={adjustedPosition?.original ?? null}
            adjustedResult={adjustedPosition?.adjusted ?? null}
            adjustmentEnabled={effectiveSettings.priceAdjustmentEnabled}
            adjustmentChanged={adjustedPosition?.changed ?? false}
            adjustmentRejectionReason={adjustedPosition?.rejectionReason ?? null}
            onCopyValue={handleResultCopied}
          />
          <SignalHistoryCard history={signalHistory} onSelect={setSelectedHistoryEntry} />
          <Card>
            <CardHeader>
              <CardTitle>Workflow</CardTitle>
              <CardDescription>
                {mode === "manual"
                  ? "Enter the trade, calculate, then copy what MetaTrader needs."
                  : "Import the trade, confirm the detected values, then copy what MetaTrader needs."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[rgb(var(--muted-foreground))]">
              <div>
                {mode === "manual"
                  ? "1. Enter your instrument, direction, and prices."
                  : "1. Paste a signal or import a screenshot."}
              </div>
              <Separator />
              <div>
                {mode === "manual"
                  ? "2. Calculate using your current sizing settings."
                  : "2. Confirm instrument, entry, stop loss, and take profit."}
              </div>
              <Separator />
              <div>3. Copy the fields you need into MetaTrader.</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={effectiveSettings}
        onChange={(next) => {
          const enabledChanged = next.priceAdjustmentEnabled !== effectiveSettings.priceAdjustmentEnabled;
          if (enabledChanged) {
            setAdjustmentEnabled(next.priceAdjustmentEnabled);
          } else {
            setManualRevision((revision) => revision + 1);
            updateSettings({ ...next, priceAdjustmentEnabled: settings.priceAdjustmentEnabled });
          }
        }}
        rateStatus={rateStatus}
        onRefreshRate={() => {
          setManualRevision((revision) => revision + 1);
          void refreshEurUsdRate();
        }}
        activePair={parsedPair ?? activeLotRules.symbol}
      />
      <SignalHistoryFloatingPanel entry={selectedHistoryEntry} onClose={() => setSelectedHistoryEntry(null)} />
    </main>
  );
}
