/**
 * Scripted promo walk-through of the app, for recording ad/landing videos.
 *
 * Runs only on top of demo mode: open the demo build with `?tour` (play once,
 * ends on a closing card) or `?tour=loop` (restarts forever, for repeated
 * takes). A fake cursor glides through the real UI — switching rooms, watching
 * live messages arrive, a Rick scan, a one-click buy, the sniper, split view
 * with resize/pop-out, Telegram, Alerts and compact mode — with caption cards
 * narrating each scene. All "live" activity is injected through the same store
 * actions the real WebSocket path uses. The cursor/click machinery lives in
 * director.tsx, shared with the fast-paced promo scenes (scenes.tsx).
 *
 * Recording: screen-record the browser at 1920×1080. For automation, the
 * script sets `window.__tourDone` when finished.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../stores/appStore';
import { tourParam } from './demoStore';
import { TOUR_REFS, buildRickScan } from './demoData';
import { Director, DIRECTOR_CSS, CURSOR_SVG, clearPaneSizeMemory } from './director';
import type { FrontendMessage, PremiumEvent } from '../types';

declare global {
  interface Window {
    __tourDone?: boolean;
  }
}

const LOOP = tourParam === 'loop';
const { ROOM_MAIN, ROOM_CALLS, ROOM_TG, GUILD_PROSPERITY, CH_PROS_ALPHA, TG_CABAL, authors } = TOUR_REFS;

// Real, well-known SOL mint (BONK) so address rendering behaves exactly like
// production; distinct from the static dataset's mints so it lands fresh.
const TOUR_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

function Card({ kind, leaving }: { kind: 'intro' | 'outro'; leaving: boolean }) {
  return (
    <div className={`tour-card${leaving ? ' leaving' : ''}`}>
      <img src="/trenchcord.png" alt="" />
      <h1>Trenchcord</h1>
      {kind === 'intro' ? (
        <p>Your Discord and Telegram — supercharged for trenching.</p>
      ) : (
        <>
          <p>Runs on your PC — your keys and your data never leave it.</p>
          <p className="tour-platforms">Windows · macOS · iPhone</p>
          <div className="tour-cta">trenchcord.app</div>
        </>
      )}
    </div>
  );
}

export default function TourOverlay() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleHostRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [card, setCard] = useState<'intro' | 'outro' | null>(null);
  const [cardLeaving, setCardLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    document.documentElement.classList.add('touring');
    const S = useAppStore.getState;
    const d = new Director(cursorRef, rippleHostRef, () => cancelled);

    let seq = 0;
    const liveMsg = (
      author: FrontendMessage['author'],
      content: string,
      over: Partial<FrontendMessage> = {},
    ): FrontendMessage => ({
      id: `tour-${Date.now()}-${++seq}`,
      channelId: CH_PROS_ALPHA,
      guildId: GUILD_PROSPERITY,
      channelName: '👾｜alpha',
      guildName: 'Prosperity DAO',
      author,
      content,
      timestamp: new Date().toISOString(),
      attachments: [],
      embeds: [],
      isHighlighted: false,
      hasContractAddress: false,
      contractAddresses: [],
      mentions: {},
      ...over,
    });

    const showCard = async (kind: 'intro' | 'outro', holdMs: number) => {
      d.setCursorVisible(false);
      setCardLeaving(false);
      setCard(kind);
      await d.sleep(holdMs);
      setCardLeaving(true);
      await d.sleep(650);
      setCard(null);
      d.setCursorVisible(true);
    };

    const run = async (): Promise<void> => {
      await d.waitFor(() => d.findText('Rooms'), 15000);
      S().setSidebarCollapsed(false);
      // Edit mode persists in localStorage; an interrupted previous run can
      // leave it ON, which would make this run's edit-button click turn it OFF
      // — and a disabled divider silently ignores the resize drag.
      if (S().layoutEditMode) S().toggleLayoutEditMode();
      d.placeCursor();
      await d.sleep(300);

      await showCard('intro', 3400);

      // Scene 1 — rooms merge channels from anywhere; live banter arrives.
      setCaption('Merge channels from any Discord server — and Telegram — into custom rooms');
      await d.clickText('Calls');
      await d.sleep(1800);
      await d.clickText('Main');
      await d.sleep(900);
      S().addMessage(liveMsg(authors.sam, 'volume ticking up on the 5m'), [ROOM_MAIN, ROOM_CALLS], true);
      await d.sleep(1500);
      S().addMessage(liveMsg(authors.whatever, 'wolfie cooking?'), [ROOM_MAIN, ROOM_CALLS], true);
      await d.sleep(1500);

      // Scene 2 — a call drops, CA detection + Rick's scan.
      setCaption('Contract addresses are auto-detected the second they drop');
      const call = liveMsg(authors.wolfie, `new one. moving fast\n${TOUR_MINT}`, {
        isHighlighted: true,
        hasContractAddress: true,
        contractAddresses: [TOUR_MINT],
      });
      S().addMessage(call, [ROOM_MAIN, ROOM_CALLS], true);
      await d.sleep(1600);
      const scan = buildRickScan(
        `tour-rick-${Date.now()}`,
        TOUR_MINT,
        'Trenchcord',
        'TRENCHCORD',
        new Date().toISOString(),
        { id: call.id, authorId: call.author.id, author: 'wolfie', roleColor: call.author.roleColor, content: `new one. moving fast\n${TOUR_MINT}` },
        { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO' },
      );
      S().addMessage(scan, [ROOM_MAIN, ROOM_CALLS], true);
      await d.sleep(1200);
      setCaption('Scanner bots like Rick render in full — stats, links, buttons');
      await d.sleep(2800);

      // Scene 3 — trading: actually click a buy button; the success toast pops.
      setCaption('One-click buys right under the message — from your own wallets');
      const buyBtn = d.findLastText('1');
      if (buyBtn) {
        await d.moveToEl(buyBtn);
        await d.clickEl(buyBtn); // demo build: simulated success, nothing real is spent
      }
      await d.sleep(3000);

      // Scene 4 — sniping: the same call auto-buys, badge lands in the Snipes feed.
      S().addSnipeResult({
        status: 'bought',
        mint: TOUR_MINT,
        configName: 'Insiders',
        solAmount: 0.5,
        wallets: [{ label: 'Sniper', ok: true }],
        messageId: call.id,
        channelId: CH_PROS_ALPHA,
      });
      setCaption('Or let the sniper buy the instant a tracked user posts — no click at all');
      await d.clickText('Snipes');
      await d.sleep(3200);
      await d.clickText('Main');
      await d.sleep(600);

      // Scene 4.5 — replying: the source badge jumps into Discord, the
      // bring-to-front hotkey jumps back. Hover only — a real click would put
      // the actual Discord client over the recording. Only the channel pill is
      // an <a>; the CONTRACT/keyword badges share the same title but are spans.
      const pills = Array.from(document.querySelectorAll<HTMLElement>('a[title="Open in Discord"]'));
      const sourceBadge = pills[pills.length - 1];
      if (sourceBadge) {
        setCaption('Click the server / channel on any message to jump right there in Discord and reply');
        await d.moveToEl(sourceBadge);
        d.spotlight(sourceBadge, 5600);
        await d.sleep(3100);
        setCaption('…then snap back with the “Bring Trenchcord to front” hotkey');
        await d.sleep(2700);
      }

      // Scene 5 — split view with Telegram, then rearrange and resize.
      setCaption('Split view — watch up to four rooms side by side');
      clearPaneSizeMemory();
      S().addPane();
      S().setPaneRoom(1, ROOM_TG);
      await d.sleep(1500);
      S().addMessage(
        liveMsg(authors.tgCabal, '$ANSEM second leg loading. holders keep holding', {
          source: 'telegram',
          channelId: TG_CABAL,
          channelName: 'Cabal Calls',
          guildId: null,
          guildName: null,
        }),
        [ROOM_MAIN, ROOM_CALLS, ROOM_TG],
        true,
      );
      await d.sleep(2100);
      setCaption('Rearrange and resize panes — make the layout fit your trading');
      if (S().layoutEditMode) S().toggleLayoutEditMode(); // belt & suspenders: the click below must turn it ON
      const editBtn = d.findTitle('Edit layout');
      if (editBtn) {
        await d.moveToEl(editBtn);
        await d.clickEl(editBtn);
        await d.sleep(700);
        await d.dragResize(-Math.round(window.innerWidth * 0.17));
        await d.sleep(1300);
        S().swapPanes(0, 1);
        await d.sleep(1500);
      }
      const popoutBtn = d.tipButton('Pop out to its own window');
      if (popoutBtn) {
        setCaption('…or pop any chat out into its own window');
        await d.moveToEl(popoutBtn);
        await d.sleep(2100);
      }
      if (editBtn) await d.clickEl(editBtn);
      await d.sleep(500);
      S().removePane(1);
      await d.sleep(400);

      // Scene 6 — Alerts feed + a live alert firing (feed only, no toasts).
      setCaption('Alerts — CEX & DEX price alerts, tweet alerts, Telegram trackers');
      await d.clickText('Alerts');
      await d.sleep(2600);
      setCaption('They fire in the cloud and push to your phone — even with your PC off');
      const ev: PremiumEvent = {
        id: `tour-ev-${Date.now()}`,
        kind: 'price',
        source_id: 'demo-price-1',
        title: 'SOL alert triggered',
        body: 'Price goes over $300.0000\nCurrent: $302.1800',
        url: null,
        payload: { alert_kind: 'cex', symbol: 'SOL' },
        urgency: 'critical',
        created_at: new Date().toISOString(),
      };
      S().addPremiumEvent(ev);
      await d.sleep(3200);

      // Scene 7 — create-alert form (closed implicitly when the view changes).
      setCaption('Set up a new alert in seconds');
      if (await d.clickText('Create new alert')) await d.sleep(2800);

      // Scene 8 — settings depth, then switch the chat to compact mode.
      setCaption('Make it yours — sounds, keywords, hotkeys, layouts');
      await d.clickText('Settings');
      await d.sleep(1400);
      await d.clickText('Sounds & Notifications');
      await d.sleep(1900);
      await d.clickText('General');
      await d.sleep(1100);
      setCaption('Prefer denser chat? Switch to compact mode');
      await d.clickText('Compact');
      await d.sleep(700);
      await d.clickText('Save');
      await d.sleep(700);
      await d.clickText('Main');
      await d.sleep(2800);

      // Scene 9 — outro. (The local-first line lives on the outro card only.)
      setCaption(null);
      if (LOOP) {
        await showCard('outro', 5200);
        const st = S();
        st.setActiveView('chat');
        st.setActiveRoom(ROOM_MAIN);
        while (S().paneRoomIds.length > 1) S().removePane(S().paneRoomIds.length - 1);
        void st.updateConfig({ messageDisplay: 'default' });
        await d.sleep(700);
        return run();
      }
      d.setCursorVisible(false);
      setCardLeaving(false);
      setCard('outro');
      await d.sleep(1200);
      window.__tourDone = true; // recording scripts key off this
    };

    run().catch(() => {
      /* cancelled on unmount */
    });

    return () => {
      cancelled = true;
      document.documentElement.classList.remove('touring');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <style>{DIRECTOR_CSS}</style>
      <div ref={rippleHostRef} className="absolute inset-0" />
      {card && <Card kind={card} leaving={cardLeaving} />}
      {caption && (
        <div key={caption} className="tour-caption-wrap">
          <div className="tour-caption">{caption}</div>
        </div>
      )}
      <div ref={cursorRef} className="tour-cursor">
        <div className="tour-cursor-inner">{CURSOR_SVG}</div>
      </div>
    </div>,
    document.body,
  );
}
