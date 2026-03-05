import type { StorageProvider } from './interface.js';
import { JsonStorageProvider } from './json.js';
import { SupabaseStorageProvider } from './supabase.js';

export type { StorageProvider } from './interface.js';

const mode = process.env.TRENCHCORD_MODE ?? 'local';

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider;

  if (mode === 'hosted') {
    _provider = new SupabaseStorageProvider();
  } else {
    _provider = new JsonStorageProvider();
  }

  return _provider;
}

export function setStorageProvider(provider: StorageProvider): void {
  _provider = provider;
}

export function isHostedMode(): boolean {
  return mode === 'hosted';
}
