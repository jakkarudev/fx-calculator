import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[160px] w-full rounded-2xl border border-[rgb(var(--input))] bg-transparent px-4 py-3 text-sm shadow-sm outline-none transition-colors placeholder:text-[rgb(var(--muted-foreground))] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))]",
        className,
      )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
