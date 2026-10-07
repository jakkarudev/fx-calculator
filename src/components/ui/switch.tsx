import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={checked}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full border border-[rgb(var(--border))] p-0.5 transition-colors",
          checked ? "bg-[rgb(var(--primary))]" : "bg-[rgb(var(--muted))]",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-[rgb(var(--card))] shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    );
  },
);

Switch.displayName = "Switch";
