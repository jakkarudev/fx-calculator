import { ClipboardPaste, Sparkles, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onParse: () => void;
  onPaste: () => void;
  onImageSelected: (file: File) => void;
  isReadingImage?: boolean;
  error?: string | null;
};

export function SignalPasteCard({ value, onChange, onParse, onPaste, onImageSelected, isReadingImage, error }: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste signal</CardTitle>
        <CardDescription>Drop the trade text here and the app will detect the pair, entry, SL, and TP.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`EURUSD BUY\nEntry: 1.08450\nSL: 1.08050\nTP: 1.09250`}
        />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <input
          ref={imageInputRef}
          aria-label="Signal screenshot image"
          className="sr-only"
          type="file"
          accept="image/*"
          disabled={isReadingImage}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onImageSelected(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={onParse}>
            <Sparkles className="h-4 w-4" />
            Parse signal
          </Button>
          <Button variant="outline" type="button" onClick={onPaste}>
            <ClipboardPaste className="h-4 w-4" />
            Paste clipboard
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={isReadingImage}
            onClick={() => imageInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {isReadingImage ? "Reading..." : "Read screenshot"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
