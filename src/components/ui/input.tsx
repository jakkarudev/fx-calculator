import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-xl border border-[rgb(var(--input))] bg-transparent px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))]",
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
