import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="absolute right-0 top-0 h-full w-full max-w-md border-l border-[rgb(var(--border))] bg-[rgb(var(--card))] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[rgb(var(--border))] p-4">
          <div>
            <p id="settings-title" className="text-sm font-medium">
              Settings
            </p>
            <p className="text-xs text-[rgb(var(--muted-foreground))]">Saved locally on this device</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="h-[calc(100%-64px)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetSection({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-3 py-4", className)} {...props} />;
}
