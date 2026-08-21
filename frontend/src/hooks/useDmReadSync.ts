import { useEffect, useRef } from 'react';
import { useAppStore, backendFetch } from '../stores/appStore';
import { isDemoMode } from '../demo/demoStore';

/**
 * The reverse half of read-state sync: viewing a Discord DM in Trenchcord
 * marks it read on the Discord account, so the badge clears in the official
 * clients too.
 *
 * Only individual `dm:` panes ack, never rooms or the aggregate All DMs feed —
 * a room aggregates guild channels, and acking those would silently mass-read
 * the user's real Discord. Acks are also held while the window is unfocused
 * (like the official client): a DM pane left open must not keep eating
 * messages that arrive while the user is away.
 */
export function useDmReadSync() {
  const activeView = useAppStore((s) => s.activeView);
  const paneRoomIds = useAppStore((s) => s.paneRoomIds);
  const messages = useAppStore((s) => s.messages);
  const enabled = useAppStore((s) => s.config?.dmReadSyncEnabled ?? false);
  const lastAcked = useRef<Record<string, string>>({});

  useEffect(() => {
    if (isDemoMode || !enabled || activeView !== 'chat') return;

    const sync = () => {
      if (!document.hasFocus()) return;
      for (const roomId of paneRoomIds) {
        if (!roomId.startsWith('dm:')) continue;
        const channelId = roomId.slice('dm:'.length);
        const list = messages[roomId];
        const last = list?.[list.length - 1];
        if (!last || lastAcked.current[channelId] === last.id) continue;
        lastAcked.current[channelId] = last.id;
        backendFetch(`/channels/${channelId}/ack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: last.id }),
        }).catch(() => {});
      }
    };

    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [enabled, activeView, paneRoomIds, messages]);
}
