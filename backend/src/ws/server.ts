import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { FrontendMessage } from '../discord/types.js';

interface ClientState {
  subscribedRooms: Set<string>;
}

export class WsServer {
  private wss: WebSocketServer;
  private clients: Map<WebSocket, ClientState> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');
      this.clients.set(ws, { subscribedRooms: new Set() });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch {
          // ignore malformed messages
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });
    });
  }

  private handleClientMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
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

  broadcastMessage(message: FrontendMessage, roomIds: string[]): void {
    const payload = JSON.stringify({ type: 'message', data: message, roomIds });

    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;

      const shouldSend =
        state.subscribedRooms.has('__all__') ||
        roomIds.some((id) => state.subscribedRooms.has(id));

      if (shouldSend) {
        ws.send(payload);
      }
    }
  }

  broadcastMessageUpdate(update: { messageId: string; channelId: string; embeds?: FrontendMessage['embeds']; content?: string; attachments?: FrontendMessage['attachments'] }, roomIds: string[]): void {
    const payload = JSON.stringify({ type: 'message_update', data: update, roomIds });
    for (const [ws, state] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const shouldSend =
        state.subscribedRooms.has('__all__') ||
        roomIds.some((id) => state.subscribedRooms.has(id));
      if (shouldSend) ws.send(payload);
    }
  }

  broadcastAlert(alert: { type: string; message: FrontendMessage; reason: string }): void {
    const payload = JSON.stringify({ type: 'alert', data: alert });
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastReactionUpdate(data: { channelId: string; messageId: string; emoji: { id: string | null; name: string; animated?: boolean }; delta: number }): void {
    const payload = JSON.stringify({ type: 'reaction_update', data });
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastContract(data: any): void {
    const payload = JSON.stringify({ type: 'contract', data });
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastChainUpdate(address: string, evmChain: string): void {
    const payload = JSON.stringify({ type: 'chain_update', data: { address, evmChain } });
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
