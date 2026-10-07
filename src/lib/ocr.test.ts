import { beforeEach, describe, expect, it, vi } from "vitest";

const recognizeText = vi.hoisted(() => vi.fn());

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({ recognizeText })),
}));

import { recognizeTextFromImageFile } from "./ocr";

describe("recognizeTextFromImageFile", () => {
  beforeEach(() => {
    recognizeText.mockReset();
  });

  it("passes an image data URL to the native OCR plugin and returns trimmed text", async () => {
    recognizeText.mockResolvedValue({ text: "  EURUSD BUY\nENTRY: 1.08450\nSL: 1.08050\nTP: 1.09250  " });
    const file = new File(["fake image"], "signal.png", { type: "image/png" });

    await expect(recognizeTextFromImageFile(file)).resolves.toBe(
      "EURUSD BUY\nENTRY: 1.08450\nSL: 1.08050\nTP: 1.09250",
    );
    expect(recognizeText).toHaveBeenCalledWith({ image: expect.stringMatching(/^data:image\/png;base64,/) });
  });

  it("rejects non-image files before calling the native OCR plugin", async () => {
    const file = new File(["not image"], "signal.txt", { type: "text/plain" });

    await expect(recognizeTextFromImageFile(file)).rejects.toThrow("Choose an image file.");
    expect(recognizeText).not.toHaveBeenCalled();
  });

  it("rejects images when ML Kit finds no readable text", async () => {
    recognizeText.mockResolvedValue({ text: "   " });
    const file = new File(["fake image"], "blank.png", { type: "image/png" });

    await expect(recognizeTextFromImageFile(file)).rejects.toThrow("No readable signal text found in that image.");
  });
});
