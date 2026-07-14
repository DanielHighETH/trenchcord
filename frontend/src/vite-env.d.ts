/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface TrenchcordBridge {
  openPopout: (roomId: string, title?: string, seed?: unknown[]) => Promise<boolean>;
  getPopoutSeed: (roomId: string) => Promise<unknown[] | null>;
  onPopoutClosed: (callback: (roomId: string) => void) => () => void;
}

interface Window {
  trenchcord?: TrenchcordBridge;
}
