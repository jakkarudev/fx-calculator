import { InstrumentPicker } from "./InstrumentPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  pair: string;
  side: string;
  orderType: string;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  mode?: "manual" | "import";
  errors?: Partial<Record<"pair" | "entry" | "stopLoss" | "takeProfit", string>>;
  onCalculate?: () => void;
  onChange: (field: "pair" | "side" | "orderType" | "entry" | "stopLoss" | "takeProfit", value: string) => void;
};

export function ManualInputForm({
  pair,
  side,
  orderType,
  entry,
  stopLoss,
  takeProfit,
  onChange,
  mode = "manual",
  errors = {},
  onCalculate,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "manual" ? "Manual trade" : "Imported values"}</CardTitle>
        <CardDescription>Enter or correct the instrument and prices.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {mode === "manual" ? (
          <InstrumentPicker value={pair} error={errors.pair} onSelect={(symbol) => onChange("pair", symbol)} />
        ) : (
          <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground))]">
            Instrument
            <Input
              aria-invalid={Boolean(errors.pair)}
              aria-describedby={errors.pair ? "error-pair" : undefined}
              value={pair}
              onChange={(event) => onChange("pair", event.target.value)}
              placeholder="EURUSD"
            />
          </label>
        )}
        {mode === "manual" && (
          <label className="grid gap-1 text-xs font-medium">
            Direction
            <select
              className="h-10 rounded-xl border px-3 bg-[rgb(var(--background))]"
              value={side}
              onChange={(event) => onChange("side", event.target.value)}
            >
              <option value="auto">AUTO</option>
              <option value="buy">LONG</option>
              <option value="sell">SHORT</option>
            </select>
          </label>
        )}
        <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground))]">
          Order type
          <select
            className="h-10 rounded-xl border px-3 bg-[rgb(var(--background))]"
            value={orderType}
            disabled={mode === "import"}
            onChange={(event) => onChange("orderType", event.target.value)}
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground))]">
          Entry
          <Input
            inputMode="decimal"
            aria-invalid={Boolean(errors.entry)}
            aria-describedby={errors.entry ? "error-entry" : undefined}
            value={entry}
            onChange={(event) => onChange("entry", event.target.value)}
            placeholder="1.08450"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground))]">
          Stop loss
          <Input
            inputMode="decimal"
            aria-invalid={Boolean(errors.stopLoss)}
            aria-describedby={errors.stopLoss ? "error-stopLoss" : undefined}
            value={stopLoss}
            onChange={(event) => onChange("stopLoss", event.target.value)}
            placeholder="1.08050"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-[rgb(var(--foreground))] sm:col-span-2">
          Take profit
          <Input
            inputMode="decimal"
            aria-invalid={Boolean(errors.takeProfit)}
            aria-describedby={errors.takeProfit ? "error-takeProfit" : undefined}
            value={takeProfit}
            onChange={(event) => onChange("takeProfit", event.target.value)}
            placeholder="1.09250"
          />
        </label>
        {Object.entries(errors).map(([field, message]) => (
          <p key={field} id={`error-${field}`} className="text-sm text-red-500 sm:col-span-2" role="alert">
            {message}
          </p>
        ))}
        {mode === "manual" && (
          <Button className="h-11 sm:col-span-2" onClick={onCalculate}>
            Calculate
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
