import type { StorageProvider } from './interface.js';
import { JsonStorageProvider } from './json.js';
import { SupabaseStorageProvider } from './supabase.js';

export type { StorageProvider } from './interface.js';

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (_provider) return _provider;

  if (isHostedMode()) {
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
  return (process.env.TRENCHCORD_MODE ?? 'local') === 'hosted';
}
