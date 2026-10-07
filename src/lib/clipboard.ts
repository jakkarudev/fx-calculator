import { Clipboard } from "@capacitor/clipboard";
import { Capacitor } from "@capacitor/core";

function copyWithSelection(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return typeof document.execCommand === "function" && document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function copyText(value: string) {
  if (value.length === 0) return false;

  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: value });
      return true;
    } catch {
      // Fall through to browser-compatible copying for development and web builds.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the selection fallback when browser permission is denied.
    }
  }

  return copyWithSelection(value);
}

export async function readText() {
  try {
    const result = await Clipboard.read();
    return result.value ?? "";
  } catch {
    return navigator.clipboard?.readText ? await navigator.clipboard.readText() : "";
  }
}
