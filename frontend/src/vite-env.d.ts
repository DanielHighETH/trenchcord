/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface TrenchcordBridge {
  openPopout: (roomId: string, title?: string, seed?: unknown[]) => Promise<boolean>;
  getPopoutSeed: (roomId: string) => Promise<unknown[] | null>;
  onPopoutClosed: (callback: (roomId: string) => void) => () => void;
  /** Register/replace the OS-wide "bring Trenchcord to front" shortcut; null clears it. */
  setFocusShortcut?: (accelerator: string | null) => Promise<boolean>;
  /** Opt-in auto-update (Windows only, off by default). `supported` is false on macOS/dev. */
  getAutoUpdate?: () => Promise<{ supported: boolean; enabled: boolean }>;
  setAutoUpdate?: (enabled: boolean) => Promise<boolean>;
}

interface Window {
  trenchcord?: TrenchcordBridge;
}
