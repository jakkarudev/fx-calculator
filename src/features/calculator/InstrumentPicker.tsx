import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getInstrumentCatalog, getInstrumentSpec, normalizePair } from "@/domain/fx";

const catalog = getInstrumentCatalog();
const categoryLabels = {
  forex: "Forex",
  metal: "Metals",
  index: "Indices",
  commodity: "Commodities",
  crypto: "Crypto",
  equity: "Equities",
};
const searchKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

type Props = { value: string; error?: string; onSelect: (symbol: string) => void };

export function InstrumentPicker({ value, error, onSelect }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const key = searchKey(query);
  const matches = catalog.filter((spec) =>
    [spec.symbol, spec.displaySymbol, spec.name, ...spec.aliases].some((text) => searchKey(text).includes(key)),
  );
  const dynamicSymbol = normalizePair(query);
  if (dynamicSymbol && !catalog.some((spec) => spec.symbol === dynamicSymbol)) {
    matches.push(getInstrumentSpec(dynamicSymbol));
  }
  const groups = new Map<string, typeof matches>();
  for (const spec of matches) {
    const category = categoryLabels[spec.kind];
    const group = groups.get(category) ?? [];
    group.push(spec);
    groups.set(category, group);
  }
  const options = [...groups.values()].flat();
  // Keyboard focus stays on the combobox; reveal its active option in the scrolling list.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[id="${id}-option-${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open, id, query]);

  const select = (symbol: string) => {
    if (symbol !== value) onSelect(symbol);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-[rgb(var(--foreground))]">
        Instrument
      </label>
      <div className="relative">
        <Input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "error-pair" : undefined}
          autoComplete="off"
          placeholder="Search symbol or name"
          className="pr-9"
          value={open ? query : value}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onClick={() => {
            if (!open) {
              setOpen(true);
              setQuery("");
              setActive(0);
            }
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                setOpen(true);
                setQuery("");
                setActive(0);
              } else
                setActive((index) =>
                  Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))),
                );
            }
            if (event.key === "Enter" && open) {
              event.preventDefault();
              if (options[active]) select(options[active].symbol);
            }
          }}
        />
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[rgb(var(--muted-foreground))]"
        />
      </div>
      {open && (
        <div
          id={`${id}-list`}
          ref={listRef}
          role="listbox"
          aria-label="Instruments"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))] p-1 shadow-lg"
        >
          {matches.length === 0 && (
            <p role="status" className="px-3 py-4 text-sm text-[rgb(var(--muted-foreground))]">
              No matching instruments
            </p>
          )}
          {[...groups].map(([category, specs]) => (
            <div key={category} role="group" aria-label={category}>
              <p className="px-3 pb-1 pt-3 text-xs font-semibold text-[rgb(var(--muted-foreground))]">{category}</p>
              {specs.map((spec) => {
                const index = options.indexOf(spec);
                return (
                  <div
                    key={spec.symbol}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={value === spec.symbol}
                    className={`min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm ${active === index ? "bg-[rgb(var(--muted))]" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(spec.symbol)}
                  >
                    <span className="font-medium">{spec.symbol}</span> —{" "}
                    <span className="text-[rgb(var(--muted-foreground))]">{spec.name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
