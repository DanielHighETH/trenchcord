import { GatewayManager } from '../discord/gatewayManager.js';
import type { WsServer } from '../ws/server.js';

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface PoolEntry {
  manager: GatewayManager;
  lastActive: number;
  activeClients: number;
  tokenFingerprint: string;
}

function fingerprint(tokens: string[]): string {
  return tokens.map((t) => t.slice(0, 8)).sort().join(',');
}

export class UserGatewayPool {
  private gateways = new Map<string, PoolEntry>();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimeoutMs: number;

  constructor(idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.idleTimer = setInterval(() => this.disconnectIdle(), 60_000);
  }

  get(userId: string): GatewayManager | null {
    return this.gateways.get(userId)?.manager ?? null;
  }

  getOrCreate(
    userId: string,
    tokens: string[],
    wireEvents: (gw: GatewayManager) => void,
  ): GatewayManager {
    const existing = this.gateways.get(userId);
    const fp = fingerprint(tokens);

    if (existing && existing.tokenFingerprint === fp) {
      existing.lastActive = Date.now();
      return existing.manager;
    }

    if (existing) {
      existing.manager.disconnect();
      this.gateways.delete(userId);
    }

    const gw = new GatewayManager(tokens);
    wireEvents(gw);
    gw.connect();

    this.gateways.set(userId, {
      manager: gw,
      lastActive: Date.now(),
      activeClients: 0,
      tokenFingerprint: fp,
    });

    return gw;
  }

  disconnect(userId: string): void {
    const entry = this.gateways.get(userId);
    if (entry) {
      entry.manager.disconnect();
      this.gateways.delete(userId);
    }
  }

  markClientConnected(userId: string): void {
    const entry = this.gateways.get(userId);
    if (entry) {
      entry.activeClients++;
      entry.lastActive = Date.now();
    }
  }

  markClientDisconnected(userId: string): void {
    const entry = this.gateways.get(userId);
    if (entry) {
      entry.activeClients = Math.max(0, entry.activeClients - 1);
      entry.lastActive = Date.now();
    }
  }

  private disconnectIdle(): void {
    const now = Date.now();
    for (const [userId, entry] of this.gateways) {
      if (entry.activeClients === 0 && now - entry.lastActive > this.idleTimeoutMs) {
        console.log(`[GatewayPool] Disconnecting idle gateway for user ${userId.slice(0, 8)}...`);
        entry.manager.disconnect();
        this.gateways.delete(userId);
      }
    }
  }

  disconnectAll(): void {
    for (const [_userId, entry] of this.gateways) {
      entry.manager.disconnect();
    }
    this.gateways.clear();
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  getActiveCount(): number {
    return this.gateways.size;
  }
}
