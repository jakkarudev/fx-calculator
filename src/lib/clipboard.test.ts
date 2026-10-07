import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    write: vi.fn(),
    read: vi.fn(),
  },
}));

import { Clipboard } from "@capacitor/clipboard";
import { copyText } from "./clipboard";

describe("copyText", () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    }
    document.execCommand = originalExecCommand;
  });

  it("falls back to a temporary textarea when browser clipboard APIs are unavailable", async () => {
    vi.mocked(Clipboard.write).mockRejectedValueOnce(new Error("Capacitor unavailable"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    document.execCommand = vi.fn(() => true);

    await expect(copyText("1.08450")).resolves.toBe(true);

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });

  it("falls back to a temporary textarea when browser clipboard write is rejected", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
      },
    });
    document.execCommand = vi.fn(() => true);

    await expect(copyText("1.08450")).resolves.toBe(true);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("1.08450");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when the legacy browser copy command fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    document.execCommand = vi.fn(() => false);

    await expect(copyText("1.08450")).resolves.toBe(false);

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
  });
});
