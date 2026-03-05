import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FrontendMessage } from '../discord/types.js';
import { isHostedMode } from '../storage/index.js';

let _verifier: SupabaseClient | null = null;

function getVerifier(): SupabaseClient {
  if (_verifier) return _verifier;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');
  _verifier = createClient(url, key, { auth: { persistSession: false } });
  return _verifier;
}

interface ClientState {
  subscribedRooms: Set<string>;
  userId: string | null;
}

export class WsServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientState> = new Map();
  private onUserConnect?: (userId: string) => void;
  private onUserDisconnect?: (userId: string) => void;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');
      this.clients.set(ws, { subscribedRooms: new Set(), userId: null });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        const state = this.clients.get(ws);
        console.log('[WS] Client disconnected');
        if (state?.userId && this.onUserDisconnect) {
          this.onUserDisconnect(state.userId);
        }
        this.clients.delete(ws);
      });
    });
  }

  setUserLifecycleCallbacks(
    onConnect: (userId: string) => void,
    onDisconnect: (userId: string) => void,
  ): void {
    this.onUserConnect = onConnect;
    this.onUserDisconnect = onDisconnect;
  }

  private handleClientMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case 'auth': {
        if (!isHostedMode() || !msg.token) break;
        const state = this.clients.get(ws);
        if (!state) break;

        getVerifier().auth.getUser(msg.token).then(({ data, error }) => {
          if (error || !data.user) {
            ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }));
            return;
          }
          state.userId = data.user.id;
          if (this.onUserConnect) {
            this.onUserConnect(data.user.id);
          }
        }).catch(() => {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Auth verification failed' }));
        });
        break;
      }
      case 'subscribe': {
        const state = this.clients.get(ws);
        if (state && msg.roomId) {
          state.subscribedRooms.add(msg.roomId);
          console.log(`[WS] Client subscribed to room ${msg.roomId}`);
        }
        break;
      }
      case 'unsubscribe': {
        const state = this.clients.get(ws);
        if (state && msg.roomId) {
          state.subscribedRooms.delete(msg.roomId);
        }
        break;
      }
      case 'subscribe_all': {
        const state = this.clients.get(ws);
        if (state) {
          state.subscribedRooms.add('__all__');
        }
        break;
      }
    }
  }

  private shouldSendToClient(state: ClientState, roomIds: string[], userId?: string): boolean {
    if (isHostedMode() && userId && state.userId !== userId) return false;

    return state.subscribedRooms.has('__all__') ||
      roomIds.some((id) => state.subscribedRooms.has(id));
  }

  broadcastMessage(message: FrontendMessage, roomIds: string[], userId?: string): void {
    const payload = JSON.stringify({ type: 'message', data: message, roomIds });

    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (this.shouldSendToClient(state, roomIds, userId)) {
        ws.send(payload);
      }
    }
  }

  broadcastMessageUpdate(update: { messageId: string; channelId: string; embeds?: FrontendMessage['embeds']; content?: string; attachments?: FrontendMessage['attachments'] }, roomIds: string[], userId?: string): void {
    const payload = JSON.stringify({ type: 'message_update', data: update, roomIds });
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (this.shouldSendToClient(state, roomIds, userId)) {
        ws.send(payload);
      }
    }
  }

  broadcastAlert(alert: { type: string; message: FrontendMessage; reason: string }, userId?: string): void {
    const payload = JSON.stringify({ type: 'alert', data: alert });
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (isHostedMode() && userId && state.userId !== userId) continue;
      ws.send(payload);
    }
  }

  broadcastReactionUpdate(data: { channelId: string; messageId: string; emoji: { id: string | null; name: string; animated?: boolean }; delta: number }, userId?: string): void {
    const payload = JSON.stringify({ type: 'reaction_update', data });
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (isHostedMode() && userId && state.userId !== userId) continue;
      ws.send(payload);
    }
  }

  broadcastContract(data: any, userId?: string): void {
    const payload = JSON.stringify({ type: 'contract', data });
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (isHostedMode() && userId && state.userId !== userId) continue;
      ws.send(payload);
    }
  }

  broadcastChainUpdate(address: string, evmChain: string, userId?: string): void {
    const payload = JSON.stringify({ type: 'chain_update', data: { address, evmChain } });
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (isHostedMode() && userId && state.userId !== userId) continue;
      ws.send(payload);
    }
  }

  broadcastRaw(msg: Record<string, any>, userId?: string): void {
    const payload = JSON.stringify(msg);
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (isHostedMode() && userId && state.userId !== userId) continue;
      ws.send(payload);
    }
  }

  hasActiveClients(userId: string): boolean {
    for (const [ws, state] of this.clients) {
      if (ws.readyState === WebSocket.OPEN && state.userId === userId) return true;
    }
    return false;
  }
}
