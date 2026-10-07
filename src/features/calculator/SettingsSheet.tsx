import { Input, type InputProps } from "@/components/ui/input";
import { Sheet, SheetSection } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ModeToggle } from "@/components/mode-toggle";
import { supportedAccountCurrencies, type AccountCurrency, type CalculatorSettings } from "./use-calculator-state";
import { RefreshCw } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import type {
  PriceAdjustmentMode,
  PriceAdjustmentProfile,
  PriceAdjustmentStrength,
  RiskAdjustmentBufferMode,
} from "@/domain/fx/adjust-signal";
import { resolveInstrumentSpecification, type InstrumentLotOverride } from "@/domain/fx/instrument-rules";
import { resolveTradeLotRules } from "./calculate-trade";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: CalculatorSettings;
  onChange: (settings: CalculatorSettings) => void;
  rateStatus: "idle" | "loading" | "ready" | "error";
  onRefreshRate: () => void;
  activePair: string;
};

function FieldHelp({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div>
        <p className="text-xs font-medium text-[rgb(var(--foreground))]">{label}</p>
        <p className="text-xs text-[rgb(var(--muted-foreground))]">{description}</p>
      </div>
      {children}
    </div>
  );
}

type NumericSettingInputProps = Omit<InputProps, "onChange" | "type" | "value"> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  onEmpty?: () => void;
  isValid?: (value: number) => boolean;
};

function formatNumericSettingValue(value: NumericSettingInputProps["value"]) {
  return value === null || value === undefined ? "" : String(value);
}

function NumericSettingInput({
  value,
  onValueChange,
  onEmpty,
  isValid = Number.isFinite,
  ...props
}: NumericSettingInputProps) {
  const [text, setText] = useState(() => formatNumericSettingValue(value));

  useEffect(() => {
    setText(formatNumericSettingValue(value));
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextText = event.target.value;
    setText(nextText);

    if (nextText.trim() === "") {
      onEmpty?.();
      return;
    }

    const nextValue = Number(nextText);
    if (Number.isFinite(nextValue) && isValid(nextValue)) {
      onValueChange(nextValue);
    }
  };

  return <Input {...props} type="number" value={text} onChange={handleChange} />;
}

const riskBufferModes: Array<{ label: string; value: RiskAdjustmentBufferMode }> = [
  { label: "Plus only", value: "plus" },
  { label: "Minus only", value: "minus" },
  { label: "Both ways", value: "both" },
];

const adjustmentModes: Array<{ label: string; value: PriceAdjustmentMode; description: string }> = [
  {
    label: "Fixed pips",
    value: "fixed",
    description: "Use the exact pip distance you enter.",
  },
  {
    label: "Signal-relative",
    value: "signal-relative",
    description: "Choose a preset based on the original stop distance.",
  },
];

const adjustmentStrengths: Array<{ label: string; value: PriceAdjustmentStrength; description: string }> = [
  {
    label: "Subtle",
    value: "subtle",
    description: "Smallest offset.",
  },
  {
    label: "Normal",
    value: "normal",
    description: "Balanced default.",
  },
  {
    label: "Strong",
    value: "strong",
    description: "More separation.",
  },
];

const adjustmentProfiles: Array<{ label: string; value: PriceAdjustmentProfile; description: string }> = [
  {
    label: "Shift setup",
    value: "shift",
    description: "Moves entry, SL, and TP together so RR and stop distance stay close.",
  },
  {
    label: "Keep risk",
    value: "keep-risk",
    description: "Uses the current behavior; RR may drift while risk stays guarded.",
  },
  {
    label: "Keep RR",
    value: "keep-rr",
    description: "Recalculates TP to keep RR close; risk may drift inside the buffer.",
  },
];

export function SettingsSheet({
  open,
  onOpenChange,
  settings,
  onChange,
  rateStatus,
  onRefreshRate,
  activePair,
}: Props) {
  const activeRules = (() => {
    try {
      return resolveTradeLotRules(activePair, settings);
    } catch {
      return null;
    }
  })();
  const activeOverride = activeRules ? (settings.instrumentOverrides[activeRules.symbol] ?? {}) : {};

  const activeSpecification = activeRules
    ? resolveInstrumentSpecification(activeRules.symbol, settings.instrumentOverrides)
    : null;

  const updateActiveOverride = (next: InstrumentLotOverride) => {
    if (!activeRules) return;
    onChange({
      ...settings,
      instrumentOverrides: {
        ...settings.instrumentOverrides,
        [activeRules.symbol]: {
          ...activeOverride,
          ...next,
        },
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetSection>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Light and dark mode</p>
          </div>
          <ModeToggle />
        </div>
      </SheetSection>
      <SheetSection>
        <p className="text-sm font-medium">Risk settings</p>
        <div className="grid gap-3">
          <FieldHelp
            label="Account balance"
            description="The account size used to convert your risk percent into money at risk."
          >
            <NumericSettingInput
              inputMode="numeric"
              value={settings.accountBalance}
              onValueChange={(accountBalance) => onChange({ ...settings, accountBalance })}
              isValid={(value) => value > 0}
              placeholder="Account balance"
              aria-label="Account balance"
            />
          </FieldHelp>
          <FieldHelp
            label="Risk percent"
            description="The target percentage of the account to risk on the original trade."
          >
            <NumericSettingInput
              inputMode="decimal"
              value={settings.riskPercent}
              onValueChange={(riskPercent) => onChange({ ...settings, riskPercent })}
              isValid={(value) => value > 0}
              placeholder="Risk %"
              aria-label="Risk percent"
            />
          </FieldHelp>
          <div>
            <p className="text-xs font-medium text-[rgb(var(--foreground))]">Account currency</p>
            <p className="mb-2 text-xs text-[rgb(var(--muted-foreground))]">
              The currency your account balance and risk amount are shown in.
            </p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Account currency">
              {supportedAccountCurrencies.map((currency) => (
                <Button
                  key={currency}
                  type="button"
                  variant={settings.accountCurrency === currency ? "default" : "outline"}
                  aria-pressed={settings.accountCurrency === currency}
                  onClick={() => onChange({ ...settings, accountCurrency: currency as AccountCurrency })}
                >
                  {currency}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-[rgb(var(--foreground))]">EUR/USD rate</p>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Used when converting EUR and USD pip values if no pair-specific live rate is needed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NumericSettingInput
                inputMode="decimal"
                step="0.0001"
                value={settings.eurUsdRate}
                onValueChange={(eurUsdRate) =>
                  onChange({
                    ...settings,
                    eurUsdRate,
                    eurUsdRateConfirmed: true,
                    eurUsdRateDate: null,
                    eurUsdRateFetchedAt: null,
                    eurUsdRateSource: "manual",
                  })
                }
                isValid={(value) => value > 0}
                placeholder="EUR/USD rate"
                aria-label="EUR/USD rate"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onRefreshRate}
                disabled={rateStatus === "loading"}
                aria-label="Refresh EUR/USD rate"
                title="Refresh EUR/USD rate"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onChange({
                  ...settings,
                  eurUsdRateConfirmed: true,
                  eurUsdRateSource: "manual",
                  eurUsdRateDate: null,
                  eurUsdRateFetchedAt: null,
                })
              }
            >
              Use manual EUR/USD rate
            </Button>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">
              {rateStatus === "loading"
                ? "Updating EUR/USD..."
                : rateStatus === "error"
                  ? settings.eurUsdRateConfirmed
                    ? "Using saved EUR/USD rate."
                    : "No confirmed EUR/USD rate. Enter or confirm a manual rate."
                  : settings.eurUsdRateSource === "Frankfurter"
                    ? `Frankfurter ${settings.eurUsdRateDate ?? ""}`.trim()
                    : settings.eurUsdRateConfirmed
                      ? "Manual EUR/USD rate"
                      : "No confirmed EUR/USD rate. Enter or confirm a manual rate."}
            </p>
            {settings.eurUsdRateFetchedAt && (
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Last updated {new Date(settings.eurUsdRateFetchedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </SheetSection>
      <SheetSection>
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Price adjustment</p>
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                Slightly alter entry, stop loss, and take profit while keeping risk and RR guarded.
              </p>
            </div>
            <Switch
              checked={settings.priceAdjustmentEnabled}
              onCheckedChange={(checked) => onChange({ ...settings, priceAdjustmentEnabled: checked })}
              aria-label="Enable price adjustment"
            />
          </div>
          <div>
            <p className="mb-2 text-xs text-[rgb(var(--muted-foreground))]">
              Choose how the app decides the adjustment distance.
            </p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Price adjustment mode">
              {adjustmentModes.map((mode) => (
                <Button
                  key={mode.value}
                  type="button"
                  variant={settings.priceAdjustmentMode === mode.value ? "default" : "outline"}
                  aria-pressed={settings.priceAdjustmentMode === mode.value}
                  onClick={() => onChange({ ...settings, priceAdjustmentMode: mode.value })}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[rgb(var(--muted-foreground))]">
              {adjustmentModes.find((mode) => mode.value === settings.priceAdjustmentMode)?.description}
            </p>
          </div>
          {settings.priceAdjustmentMode === "fixed" ? (
            <>
              <NumericSettingInput
                inputMode="decimal"
                min="0.1"
                step="0.1"
                value={settings.priceAdjustmentPips}
                onValueChange={(priceAdjustmentPips) => onChange({ ...settings, priceAdjustmentPips })}
                isValid={(value) => value > 0}
                placeholder="Adjustment pips"
                aria-label="Adjustment pips"
              />
              <p className="text-xs text-[rgb(var(--muted-foreground))]">
                How far entry, SL, and TP can move before the app tries a smaller safe adjustment.
              </p>
            </>
          ) : (
            <div>
              <p className="mb-2 text-xs text-[rgb(var(--muted-foreground))]">
                Presets use a small percentage of the original stop distance and still obey risk and RR checks.
              </p>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Signal-relative strength">
                {adjustmentStrengths.map((strength) => (
                  <Button
                    key={strength.value}
                    type="button"
                    variant={settings.priceAdjustmentStrength === strength.value ? "default" : "outline"}
                    aria-pressed={settings.priceAdjustmentStrength === strength.value}
                    onClick={() => onChange({ ...settings, priceAdjustmentStrength: strength.value })}
                  >
                    {strength.label}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[rgb(var(--muted-foreground))]">
                {
                  adjustmentStrengths.find((strength) => strength.value === settings.priceAdjustmentStrength)
                    ?.description
                }
              </p>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs text-[rgb(var(--muted-foreground))]">
              Choose what the adjusted trade should preserve.
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Adjustment profile">
              {adjustmentProfiles.map((profile) => (
                <Button
                  key={profile.value}
                  type="button"
                  variant={settings.priceAdjustmentProfile === profile.value ? "default" : "outline"}
                  aria-pressed={settings.priceAdjustmentProfile === profile.value}
                  onClick={() => onChange({ ...settings, priceAdjustmentProfile: profile.value })}
                >
                  {profile.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-[rgb(var(--muted-foreground))]">
              {adjustmentProfiles.find((profile) => profile.value === settings.priceAdjustmentProfile)?.description}
            </p>
          </div>
          <NumericSettingInput
            inputMode="decimal"
            min="0"
            step="0.1"
            value={settings.priceAdjustmentRiskBuffer}
            onValueChange={(priceAdjustmentRiskBuffer) => onChange({ ...settings, priceAdjustmentRiskBuffer })}
            isValid={(value) => value >= 0}
            placeholder="Risk adjustment buffer"
            aria-label="Risk adjustment buffer"
          />
          <p className="text-xs text-[rgb(var(--muted-foreground))]">Risk buffer amount, in percentage points.</p>
          <div>
            <p className="mb-2 text-xs text-[rgb(var(--muted-foreground))]">
              Choose whether adjusted risk may drift above, below, or both around your target.
            </p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Risk buffer direction">
              {riskBufferModes.map((mode) => (
                <Button
                  key={mode.value}
                  type="button"
                  variant={settings.priceAdjustmentRiskBufferMode === mode.value ? "default" : "outline"}
                  aria-pressed={settings.priceAdjustmentRiskBufferMode === mode.value}
                  onClick={() => onChange({ ...settings, priceAdjustmentRiskBufferMode: mode.value })}
                >
                  {mode.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SheetSection>
      <SheetSection>
        <p className="text-sm font-medium">Lot rules</p>
        <div className="grid gap-3">
          <p className="text-xs text-[rgb(var(--muted-foreground))]">
            {activeRules
              ? `Editing rules for ${activeRules.symbol}. Defaults are used until an override is set.`
              : "Select a supported instrument to edit its lot rules."}
          </p>
          <FieldHelp
            label="Default lot step"
            description="Fallback lot increment used by forex pairs unless an instrument override exists."
          >
            <NumericSettingInput
              inputMode="decimal"
              step="0.01"
              value={settings.lotStep}
              onValueChange={(lotStep) => onChange({ ...settings, lotStep })}
              isValid={(value) => value > 0}
              placeholder="0.01"
              aria-label="Default lot step"
            />
          </FieldHelp>
          <FieldHelp label="Default minimum lot" description="Fallback minimum lot used when no override exists.">
            <NumericSettingInput
              inputMode="decimal"
              step="0.01"
              value={settings.minLot}
              onValueChange={(minLot) => onChange({ ...settings, minLot })}
              isValid={(value) => value > 0}
              placeholder="0.01"
              aria-label="Default minimum lot"
            />
          </FieldHelp>
          {activeRules && (
            <>
              <FieldHelp
                label={`${activeRules.symbol} lot step`}
                description="Override the lot increment for this symbol."
              >
                <NumericSettingInput
                  inputMode="decimal"
                  step="0.01"
                  value={activeOverride.lotStep}
                  onValueChange={(lotStep) => updateActiveOverride({ lotStep })}
                  onEmpty={() => updateActiveOverride({ lotStep: undefined })}
                  isValid={(value) => value > 0}
                  placeholder={activeRules.lotStep.toString()}
                  aria-label={`${activeRules.symbol} lot step`}
                />
              </FieldHelp>
              <FieldHelp
                label={`${activeRules.symbol} minimum lot`}
                description="Override the minimum lot for this symbol."
              >
                <NumericSettingInput
                  inputMode="decimal"
                  step="0.01"
                  value={activeOverride.minLot}
                  onValueChange={(minLot) => updateActiveOverride({ minLot })}
                  onEmpty={() => updateActiveOverride({ minLot: undefined })}
                  isValid={(value) => value > 0}
                  placeholder={activeRules.minLot.toString()}
                  aria-label={`${activeRules.symbol} minimum lot`}
                />
              </FieldHelp>
              {activeSpecification && (
                <>
                  {(
                    [
                      {
                        field: "contractSize",
                        label: "contract size",
                        description: "Units represented by one lot.",
                        fallback: activeSpecification.contractSize,
                      },
                      {
                        field: "movementUnit",
                        label: "movement unit",
                        description: "Price movement represented by one pip or point.",
                        fallback: activeSpecification.pipSize,
                      },
                      {
                        field: "manualPipValuePerLot",
                        label: "manual pip value",
                        description: `Value of one movement unit per lot in ${settings.accountCurrency}. Overrides automatic valuation for this instrument.`,
                        fallback: undefined,
                      },
                    ] as const
                  ).map(({ field, label, description, fallback }) => (
                    <FieldHelp
                      key={`${activeRules.symbol}-${field}`}
                      label={`${activeRules.symbol} ${label}`}
                      description={description}
                    >
                      <NumericSettingInput
                        inputMode="decimal"
                        step="any"
                        value={activeOverride[field]}
                        onValueChange={(value) => updateActiveOverride({ [field]: value })}
                        onEmpty={() => updateActiveOverride({ [field]: undefined })}
                        isValid={(value) => value > 0}
                        placeholder={fallback?.toString() ?? "Automatic valuation"}
                        aria-label={`${activeRules.symbol} ${label}`}
                      />
                    </FieldHelp>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Reset ${activeRules.symbol} specifications`}
                    onClick={() => {
                      const instrumentOverrides = { ...settings.instrumentOverrides };
                      delete instrumentOverrides[activeRules.symbol];
                      onChange({ ...settings, instrumentOverrides });
                    }}
                  >
                    Reset {activeRules.symbol} specifications
                  </Button>
                </>
              )}
            </>
          )}
          <FieldHelp
            label="Manual pip value"
            description="Global fallback when automatic valuation is unavailable. Instrument manual values take priority."
          >
            <NumericSettingInput
              inputMode="decimal"
              step="0.00001"
              value={settings.manualPipValuePerLot}
              onValueChange={(manualPipValuePerLot) =>
                onChange({
                  ...settings,
                  manualPipValuePerLot,
                })
              }
              onEmpty={() => onChange({ ...settings, manualPipValuePerLot: null })}
              isValid={(value) => value > 0}
              placeholder="Manual pip value override"
              aria-label="Manual pip value"
            />
          </FieldHelp>
        </div>
      </SheetSection>
      <div className="pt-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onOpenChange(false)}
          aria-label="Close settings panel"
        >
          Close
        </Button>
      </div>
    </Sheet>
  );
}
