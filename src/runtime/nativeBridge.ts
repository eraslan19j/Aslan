import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import type { KeyValueStorage } from '../core/save';
import { CRASH_LOG_KEY } from '../core/crashLog';
import { SAVE_BACKUP_KEY, SAVE_PRIMARY_KEY } from '../core/save';

const SYNCED_KEYS = [SAVE_PRIMARY_KEY, SAVE_BACKUP_KEY, CRASH_LOG_KEY] as const;

/**
 * Synchronous localStorage wrapper mirrored asynchronously to Capacitor Preferences
 * on native Android so saves survive WebView cache clearing.
 */
export class HybridStorage implements KeyValueStorage {
  private readonly memory = new Map<string, string>();
  private readonly isNative: boolean;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  async hydrate(): Promise<void> {
    if (!this.isNative) return;
    for (const key of SYNCED_KEYS) {
      try {
        const { value } = await Preferences.get({ key });
        if (value !== null) {
          this.memory.set(key, value);
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Ignore private-mode storage quota errors
          }
        }
      } catch {
        // Keep web fallback
      }
    }
  }

  getItem(key: string): string | null {
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage quota errors
    }
    if (this.isNative) {
      void Preferences.set({ key, value }).catch(() => undefined);
    }
  }

  removeItem(key: string): void {
    this.memory.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
    if (this.isNative) {
      void Preferences.remove({ key }).catch(() => undefined);
    }
  }
}

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function triggerLightHaptic(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Non-fatal
  }
}

/**
 * Connects Android hardware/gesture Back button to the in-game pause menu.
 * Returns cleanup callback.
 */
export function registerBackButtonHandler(onBack: () => void): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => undefined;
  }
  const handlePromise = App.addListener('backButton', () => {
    onBack();
  });
  return () => {
    void handlePromise.then((h) => h.remove()).catch(() => undefined);
  };
}
