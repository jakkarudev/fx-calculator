import { Preferences } from "@capacitor/preferences";

export async function getPreference(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value;
  } catch {
    return window.localStorage.getItem(key);
  }
}

export async function setPreference(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
  } catch {
    window.localStorage.setItem(key, value);
  }
}
