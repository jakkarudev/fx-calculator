import { registerPlugin } from "@capacitor/core";

type OcrPlugin = {
  recognizeText(options: { image: string }): Promise<{ text?: string }>;
};

const Ocr = registerPlugin<OcrPlugin>("Ocr", {
  web: () => ({
    async recognizeText() {
      throw new Error("Screenshot OCR is only available in the Android app.");
    },
  }),
});

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read that image file."));
    });
    reader.addEventListener("error", () => reject(new Error("Unable to read that image file.")));
    reader.readAsDataURL(file);
  });
}

export async function recognizeTextFromImageFile(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const image = await readFileAsDataUrl(file);
  const result = await Ocr.recognizeText({ image });
  const text = result.text?.trim() ?? "";

  if (!text) {
    throw new Error("No readable signal text found in that image.");
  }

  return text;
}
