/**
 * Fast-paced scripted promo scenes, cut like an action trailer — punch-zooms,
 * screen shake, flash frames, smash cuts, letterboxed slam typography and
 * synthesized impact audio (fx.ts) on top of the real UI. For recording short
 * marketing clips (~20-25s each), unlike the full walk-through in tour.tsx.
 *
 * Runs only on top of demo mode: open the demo build with
 *   ?scene             — "one screen" hero: forget juggling Discord + Telegram
 *                        windows; slams into a single room holding it all
 *   ?scene=call        (1) — a tracked caller drops $TRENCHCORD, one-click buy
 *   ?scene=storm       (2) — multi-server message storm, tamed with Focus mode
 *   ?scene=confluence  (3) — the same CA hits three channels; Contracts feed
 *   ?scene=ios         (4) — the iPhone app: poses as the iOS shell (mobile
 *                        room bar, single pane, tap cursor) inside a drawn
 *                        iPhone-15-Pro body; record in a 9:16 viewport (e.g.
 *                        540×960 → 1080×1920). `&noframe` drops the device
 *                        body for a raw full-bleed take in a 390×844 viewport
 * (`?scene=onescreen`, `?scene=iphone` and `?scene=1|2|3|4` work too.)
 *
 * Each scene arms on a title card and starts on Space — the keypress doubles
 * as the user gesture browsers require before audio, so the alert sounds and
 * impact effects are part of the recording. When the scene ends on the outro
 * card, Space reloads the page for an identical fresh take. All "live"
 * activity is injected through the same store actions the real WebSocket path
 * uses; toasts and sounds fire exactly where the live pipeline would.
 *
 * Recording: screen-record the browser at 1920×1080, press Space, trim the
 * card padding in the edit.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../stores/appStore';
import { sceneParam, isPhoneScene } from './demoStore';
import { TOUR_REFS, buildRickScan } from './demoData';
import { Director, DIRECTOR_CSS, CURSOR_SVG } from './director';
import { Fx, FX_CSS } from './fx';
import { playContractAlertSound, playHighlightSound, playKeywordAlertSound } from '../utils/notificationSound';
import type { FrontendMessage, MessageAlert, SoundConfig } from '../types';

const {
  ROOM_MAIN, ROOM_CALLS, ROOM_TG,
  GUILD_PROSPERITY, CH_PROS_ALPHA,
  GUILD_WAGMI, CH_WAGMI_GENERAL, CH_WAGMI_CALLS,
  GUILD_INVERSE, CH_INVERSE_CLEAN,
  TG_CABAL, TG_LOUNGE,
  authors,
} = TOUR_REFS;

type SceneName = 'onescreen' | 'call' | 'storm' | 'confluence' | 'ios';

const SCENE: SceneName =
  isPhoneScene ? 'ios'
  : sceneParam === '1' || sceneParam === 'call' ? 'call'
  : sceneParam === '2' || sceneParam === 'storm' ? 'storm'
  : sceneParam === '3' || sceneParam === 'confluence' ? 'confluence'
  : 'onescreen';

// The iOS scene renders inside a drawn iPhone body by default (record in a
// 9:16 window, e.g. 540×960 → 1080×1920). `&noframe` gives the raw full-bleed
// app for true phone-screen-shaped takes.
const FRAMED = isPhoneScene && (() => {
  try {
    return !new URLSearchParams(window.location.search).has('noframe');
  } catch {
    return true;
  }
})();

// Real, well-known SOL mint (BONK) so address rendering behaves exactly like
// production — the $TRENCHCORD branding lives in the copy and the Rick scan.
const SCENE_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

// The demo config keeps message sounds off; the scenes fire them explicitly
// at the beats where the live pipeline would, so the recording has audio.
const SOUND: SoundConfig = { enabled: true, volume: 85, useCustom: false };

const INTRO_TAGLINE: Record<SceneName, string> = {
  onescreen: 'Discord + Telegram. One screen.',
  call: 'One call. One click.',
  storm: 'Every trench at once.',
  confluence: 'One CA. Three channels.',
  ios: 'The trenches — in your pocket.',
};

// The slam/display font: same bold-grotesque energy as the app font, nicer
// uppercase letterforms. @import must precede every rule in the stylesheet.
const FONT_CSS = "@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap');";

const SCENES_CSS = `
  .fx-slam span, .fx-chart-pct, .fx-mclabel, .tour-card h1 { font-family: 'Montserrat', ui-sans-serif, system-ui, sans-serif; }
  /* Captions must clear the chart scrim (z 47/48) for the chart beat. */
  .tour-caption-wrap { z-index: 49; }
  .scene-tapdot { width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 9999px;
    background: rgba(255,255,255,.32); border: 2px solid rgba(255,255,255,.85);
    box-shadow: 0 2px 12px rgba(0,0,0,.5); }
  .tour-cursor-inner.tapdot { transform-origin: 0 0; }
  /* ── Payoff chart (hero scene): early buy marker, then the pump ── */
  .fx-chart-scrim { position: absolute; inset: 0; z-index: 47; background: rgba(5,6,10,.74);
    backdrop-filter: blur(3px); opacity: 0; transition: opacity .35s ease; }
  .fx-chart { position: absolute; z-index: 48; left: 50%; top: 50%; width: min(720px, 88vw);
    transform: translate(-50%,-50%) scale(.94); background: #0b0d12;
    border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 18px 22px 18px;
    box-shadow: 0 30px 90px rgba(0,0,0,.65); opacity: 0;
    transition: opacity .4s ease, transform .45s cubic-bezier(.2,.8,.2,1); }
  .fx-chart.show { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  .fx-chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
  .fx-chart-pair { color: #e8eaed; font-weight: 700; font-size: 15px; letter-spacing: .01em; }
  .fx-chart-pair i { font-style: normal; color: #6b7280; font-weight: 500; }
  .fx-chart-mc { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700;
    font-size: 15px; color: #16c784; }
  .fx-chart-plot { position: relative; height: 280px; }
  .fx-chart-grid { position: absolute; left: 0; right: 58px; height: 1px; background: rgba(255,255,255,.05); }
  .fx-axis { position: absolute; top: 0; bottom: 0; right: 0; width: 58px;
    border-left: 1px solid rgba(255,255,255,.07); }
  .fx-axis span { position: absolute; right: 8px; transform: translateY(50%);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #6b7280; }
  .fx-price-line { position: absolute; left: 0; right: 58px; height: 0; z-index: 1;
    border-top: 1px dashed rgba(255,255,255,.3); }
  .fx-price-pill { position: absolute; right: 3px; width: 52px; z-index: 3; text-align: center;
    padding: 2px 0; border-radius: 4px; transform: translateY(50%);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 700; }
  .fx-price-pill.up { background: #16c784; color: #04140c; }
  .fx-price-pill.down { background: #ea3943; color: #fff; }
  .fx-ath-line { position: absolute; left: 0; right: 58px; height: 0; z-index: 1;
    border-top: 1px dotted rgba(250,204,21,.6); }
  .fx-ath-text { position: absolute; right: 66px; transform: translateY(50%); z-index: 1;
    font-size: 10px; font-weight: 600; color: #facc15; }
  .fx-ath-pill { position: absolute; right: 3px; width: 52px; z-index: 2; text-align: center;
    padding: 2px 0; border-radius: 4px; transform: translateY(50%); background: #facc15; color: #1a1602;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-weight: 700; }
  .fx-timebar { display: flex; justify-content: space-between; padding: 7px 70px 0 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #565c66; }
  .fx-candle { position: absolute; width: 30px; transform: scaleY(0); transform-origin: bottom;
    transition: transform .16s cubic-bezier(.2,.8,.3,1.15); }
  .fx-chart-layer { position: absolute; inset: 0; transform-origin: bottom center;
    transition: transform .4s cubic-bezier(.25,.8,.25,1); }
  .fx-float { position: absolute; transform: translateX(-50%); z-index: 2;
    transition: bottom .4s cubic-bezier(.25,.8,.25,1); }
  .fx-float .fx-bbubble { position: relative; }
  .fx-mclabel { font-weight: 900; font-size: 26px; color: #2bff8f; letter-spacing: .02em;
    text-shadow: 0 0 18px rgba(43,255,143,.85), 0 0 44px rgba(43,255,143,.4);
    animation: fx-bpop .4s cubic-bezier(.2,1.4,.3,1) both; }
  .fx-chart.punch { animation: fx-chart-punch .38s ease; }
  @keyframes fx-chart-punch {
    0%, 100% { transform: translate(-50%,-50%) scale(1); }
    45% { transform: translate(-50%,-50%) scale(1.035); }
  }
  .fx-candle.on { transform: scaleY(1); }
  .fx-candle .body { position: absolute; inset: 0; border-radius: 3px; }
  .fx-candle.up .body { background: #16c784; box-shadow: 0 0 16px rgba(22,199,132,.35); }
  .fx-candle.down .body { background: #ea3943; box-shadow: 0 0 10px rgba(234,57,67,.25); }
  .fx-candle .wick { position: absolute; left: 50%; width: 3px; margin-left: -1.5px; border-radius: 2px; }
  .fx-candle.up .wick { background: #16c784; }
  .fx-candle.down .wick { background: #ea3943; }
  .fx-bbubble { position: absolute; z-index: 2; width: 30px; height: 30px; border-radius: 9999px;
    background: #16c784; color: #04140c; display: flex; align-items: center; justify-content: center;
    font-weight: 900; font-size: 16px; transform: scale(0);
    box-shadow: 0 0 0 3px rgba(22,199,132,.28), 0 6px 18px rgba(0,0,0,.5); }
  .fx-bbubble::after { content: ''; position: absolute; bottom: -6px; left: 50%; margin-left: -5px;
    border: 5px solid transparent; border-top-color: #16c784; border-bottom: 0; }
  .fx-bbubble.on { animation: fx-bpop .45s cubic-bezier(.2,1.4,.3,1) both; }
  .fx-pnl { position: absolute; top: 8px; left: 10px; z-index: 2; padding: 4px 10px; border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 15px; font-weight: 800;
    color: #2bff8f; background: rgba(22,199,132,.1); border: 1px solid rgba(22,199,132,.35);
    text-shadow: 0 0 14px rgba(43,255,143,.5); }
  @keyframes fx-bpop { from { transform: scale(0) } 70% { transform: scale(1.28) } to { transform: scale(1) } }
  .fx-chart-pct { position: absolute; top: 44px; left: 10px; font-weight: 900; font-size: 40px;
    color: #16c784; text-shadow: 0 0 26px rgba(22,199,132,.5); transform: scale(0); }
  .fx-chart-pct.on { animation: fx-bpop .5s cubic-bezier(.2,1.4,.3,1) both; }
  @media (max-width: 560px) {
    .fx-chart-plot { height: 220px; }
    .fx-chart-pair, .fx-chart-mc { font-size: 16px; }
    .fx-chart-pct { font-size: 26px; }
    .fx-mclabel { font-size: 17px; }
  }
  /* Phone-sized takes (the ?scene=ios vertical cut) */
  @media (max-width: 560px) {
    .fx-slam span { font-size: clamp(30px, 11vw, 60px); }
    .tour-card h1 { font-size: 40px; }
    .tour-card p { font-size: 17px; padding: 0 26px; text-align: center; }
    .tour-card img { width: 76px; height: 76px; border-radius: 20px; }
    .tour-card .tour-platforms { font-size: 14px; }
    .tour-card .tour-cta { font-size: 17px; padding: 11px 24px; }
    .tour-caption { font-size: 15px; padding: 10px 16px; border-radius: 13px; }
    /* Above the room bar AND the compact buy pill that slides in over it. */
    .tour-caption-wrap { bottom: 128px; }
  }
`;

/**
 * The drawn iPhone-15-Pro body around the iOS scene: titanium rail, Dynamic
 * Island, side buttons, home indicator, showcase backdrop. The screen wrapper
 * carries a transform so it becomes the containing block for the app's fixed
 * chrome (toasts, drawer) — everything stays on the glass, clipped to it.
 */
const PHONE_FRAME_CSS = `
  html.tc-framed { --safe-top: 54px; --safe-bottom: 24px; }
  html.tc-framed body { background:
    radial-gradient(120% 90% at 50% 28%, #171a28 0%, #0b0c14 52%, #05060b 100%); }
  html.tc-framed body::after { content: ''; position: fixed; inset: 0; pointer-events: none;
    background: radial-gradient(300px 520px at 50% 50%, rgba(88,101,242,.17), transparent 70%); }
  #tc-phone { position: fixed; inset: 0; margin: auto; z-index: 1; box-sizing: content-box;
    width: 390px; height: 844px; padding: 14px; border-radius: 68px;
    background: linear-gradient(150deg, #46464d 0%, #232327 22%, #101014 55%, #2e2e34 86%, #56565d 100%);
    box-shadow: inset 0 0 1px 1px rgba(255,255,255,.10), 0 40px 90px rgba(0,0,0,.75), 0 10px 30px rgba(0,0,0,.6); }
  #tc-phone::before { content: ''; position: absolute; inset: 4px; border-radius: 64px; background: #000; }
  .tc-phone-screen { position: relative; width: 390px; height: 844px; border-radius: 55px;
    overflow: hidden; background: #000; transform: translateZ(0); }
  .tc-island { position: absolute; z-index: 9000; top: 11px; left: 50%; margin-left: -62px;
    width: 124px; height: 36px; border-radius: 20px; background: #000; pointer-events: none; }
  .tc-status { position: absolute; z-index: 8999; top: 0; left: 0; right: 0; height: 54px;
    pointer-events: none; color: #fff; }
  .tc-status .tc-time { position: absolute; top: 21px; left: 0; width: 133px; text-align: center;
    font-family: -apple-system, 'SF Pro Text', system-ui, sans-serif;
    font-size: 16px; font-weight: 600; letter-spacing: .02em; }
  .tc-status svg { position: absolute; top: 23px; right: 30px; }
  .tc-island::after { content: ''; position: absolute; right: 9px; top: 13px; width: 10px; height: 10px;
    border-radius: 9999px; background: radial-gradient(circle at 35% 35%, #2a2f4a, #0a0b12 70%); }
  .tc-homebar { position: absolute; z-index: 9000; bottom: 8px; left: 50%; width: 140px; height: 5px;
    margin-left: -70px; border-radius: 3px; background: rgba(255,255,255,.45); pointer-events: none; }
  .tc-btn { position: absolute; width: 4px; border-radius: 2px;
    background: linear-gradient(90deg, #1c1c20, #50505a 45%, #26262b); }
  .tc-btn-action { left: -3px; top: 192px; height: 26px; }
  .tc-btn-volup { left: -3px; top: 250px; height: 52px; }
  .tc-btn-voldn { left: -3px; top: 314px; height: 52px; }
  .tc-btn-power { right: -3px; top: 272px; height: 86px;
    background: linear-gradient(270deg, #1c1c20, #50505a 45%, #26262b); }
  /* Same 128px clearance over the room bar, measured from the glass, not the window. */
  html.tc-framed .tour-caption-wrap { bottom: calc((100vh - 844px) / 2 + 128px); }
`;

/**
 * Wrap the live app in the drawn iPhone: #root is reparented into the clipped
 * screen, and #tc-phone becomes the camera stage fx.ts moves (zooms and
 * shakes read as pushes on the device). Returns the teardown that restores
 * #root to <body>.
 */
function mountPhoneFrame(): () => void {
  const root = document.getElementById('root');
  if (!root) return () => {};
  document.documentElement.classList.add('tc-framed');
  const phone = document.createElement('div');
  phone.id = 'tc-phone';
  phone.innerHTML = `
    <div class="tc-btn tc-btn-action"></div>
    <div class="tc-btn tc-btn-volup"></div>
    <div class="tc-btn tc-btn-voldn"></div>
    <div class="tc-btn tc-btn-power"></div>
    <div class="tc-phone-screen">
      <div class="tc-island"></div>
      <div class="tc-status">
        <span class="tc-time">9:41</span>
        <svg width="67" height="12" viewBox="0 0 67 12">
          <rect x="0" y="7.5" width="3" height="4" rx="1" fill="#fff"/>
          <rect x="4.5" y="5.5" width="3" height="6" rx="1" fill="#fff"/>
          <rect x="9" y="3.5" width="3" height="8" rx="1" fill="#fff"/>
          <rect x="13.5" y="1.5" width="3" height="10" rx="1" fill="#fff"/>
          <path d="M22.6 5.9a9.4 9.4 0 0 1 14.8 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M25.3 8.4a6 6 0 0 1 9.4 0" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
          <circle cx="30" cy="10.6" r="1.5" fill="#fff"/>
          <rect x="44.5" y="1.5" width="20" height="9.5" rx="2.5" stroke="rgba(255,255,255,.45)" fill="none"/>
          <rect x="46.3" y="3.3" width="13" height="6" rx="1.4" fill="#fff"/>
          <rect x="65.4" y="4.3" width="1.6" height="4" rx="0.8" fill="rgba(255,255,255,.5)"/>
        </svg>
      </div>
      <div class="tc-homebar"></div>
    </div>`;
  document.body.appendChild(phone);
  const screen = phone.querySelector<HTMLElement>('.tc-phone-screen')!;
  screen.insertBefore(root, screen.firstChild); // island + home bar stay above the app
  return () => {
    document.body.appendChild(root);
    phone.remove();
    document.documentElement.classList.remove('tc-framed');
  };
}

/** Where an injected message lands: channel identity + the rooms that show it. */
type Chan = {
  channelId: string;
  guildId: string | null;
  channelName: string;
  guildName: string | null;
  source?: 'telegram';
  roomIds: string[];
};

const CH: Record<string, Chan> = {
  alpha: { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO', roomIds: [ROOM_MAIN, ROOM_CALLS] },
  wagmi: { channelId: CH_WAGMI_GENERAL, guildId: GUILD_WAGMI, channelName: 'wagmi-general', guildName: 'WAGMI DAO', roomIds: [ROOM_MAIN] },
  wagmiCalls: { channelId: CH_WAGMI_CALLS, guildId: GUILD_WAGMI, channelName: 'wagmi-calls', guildName: 'WAGMI DAO', roomIds: [ROOM_CALLS] },
  inverse: { channelId: CH_INVERSE_CLEAN, guildId: GUILD_INVERSE, channelName: 'clean-chat', guildName: 'Inverse', roomIds: [ROOM_MAIN] },
  cabal: { channelId: TG_CABAL, guildId: null, channelName: 'Cabal Calls', guildName: null, source: 'telegram', roomIds: [ROOM_MAIN, ROOM_CALLS, ROOM_TG] },
  lounge: { channelId: TG_LOUNGE, guildId: null, channelName: 'Trench Lounge', guildName: null, source: 'telegram', roomIds: [ROOM_TG] },
};

function Card({ kind, leaving }: { kind: 'intro' | 'outro'; leaving: boolean }) {
  return (
    <div className={`tour-card${leaving ? ' leaving' : ''}`}>
      <img src="/trenchcord.png" alt="" />
      <h1>Trenchcord</h1>
      {kind === 'intro' ? (
        <p>{INTRO_TAGLINE[SCENE]}</p>
      ) : (
        <>
          <p>
            {SCENE === 'ios'
              ? 'The whole trench setup — on your iPhone.'
              : 'Discord + Telegram — every trench on one screen.'}
          </p>
          <p className="tour-platforms">Windows · macOS · iPhone</p>
          <div className="tour-cta">trenchcord.app</div>
        </>
      )}
    </div>
  );
}

export default function SceneOverlay() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleHostRef = useRef<HTMLDivElement>(null);
  const fxHostRef = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [card, setCard] = useState<'intro' | 'outro' | null>('intro');
  const [cardLeaving, setCardLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const phaseRef = useRef<'armed' | 'running' | 'done'>('armed');
  const [phase, setPhase] = useState<'armed' | 'running' | 'done'>('armed');
  const triggerRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    document.documentElement.classList.add('touring');
    const unframe = FRAMED ? mountPhoneFrame() : null;
    const S = useAppStore.getState;
    const d = new Director(cursorRef, rippleHostRef, () => cancelled, 0.62);
    const fx = new Fx(() => fxHostRef.current);

    let seq = 0;
    const send = (
      chan: Chan,
      author: FrontendMessage['author'],
      content: string,
      over: Partial<FrontendMessage> = {},
    ): FrontendMessage => {
      const message: FrontendMessage = {
        id: `scene-${Date.now()}-${++seq}`,
        channelId: chan.channelId,
        guildId: chan.guildId,
        channelName: chan.channelName,
        guildName: chan.guildName,
        author,
        content,
        timestamp: new Date().toISOString(),
        attachments: [],
        embeds: [],
        isHighlighted: false,
        hasContractAddress: false,
        contractAddresses: [],
        mentions: {},
        ...(chan.source ? { source: chan.source } : {}),
        ...over,
      };
      S().addMessage(message, chan.roomIds, true);
      return message;
    };

    const toast = (type: MessageAlert['type'], message: FrontendMessage, reason: string) => {
      S().addAlert({ id: `scene-alert-${++seq}`, type, message, reason, timestamp: Date.now() });
    };

    /**
     * A CA drop with full impact: message + contract-feed entry (like the live
     * pipeline logs) + alert sound + green flash + kick.
     */
    const dropCA = (
      chan: Chan,
      author: FrontendMessage['author'],
      content: string,
      firstSeen: boolean,
      over: Partial<FrontendMessage> = {},
      intensity = 0.8,
    ): FrontendMessage => {
      const message = send(chan, author, content, {
        hasContractAddress: true,
        contractAddresses: [SCENE_MINT],
        ...over,
      });
      S().addContract({
        address: SCENE_MINT,
        chain: 'sol',
        authorId: author.id,
        authorName: author.displayName,
        channelId: chan.channelId,
        channelName: chan.channelName,
        guildId: chan.guildId,
        guildName: chan.guildName,
        roomIds: chan.roomIds,
        messageId: message.id,
        timestamp: message.timestamp,
        firstSeen,
        ...(chan.source ? { source: chan.source } : {}),
        content: content.length > 90 ? `${content.slice(0, 90)}…` : content,
      });
      playContractAlertSound(SOUND);
      fx.flash('rgba(20,241,149,.4)', 280);
      fx.boom(intensity);
      fx.shake(5 * intensity, 260);
      return message;
    };

    const rickScan = (reply: FrontendMessage) => {
      S().addMessage(
        buildRickScan(
          `scene-rick-${Date.now()}`,
          SCENE_MINT,
          'Trenchcord',
          'TRENCHCORD',
          new Date().toISOString(),
          { id: reply.id, authorId: reply.author.id, author: reply.author.displayName, roleColor: reply.author.roleColor, content: reply.content },
          { channelId: CH_PROS_ALPHA, guildId: GUILD_PROSPERITY, channelName: '👾｜alpha', guildName: 'Prosperity DAO' },
        ),
        CH.alpha.roomIds,
        true,
      );
    };

    /**
     * Last visible <button> whose whole label is `label` — buy buttons are
     * bare-number buttons, while look-alike numbers elsewhere (mobile room
     * bar unread badges) are spans inside labeled buttons.
     */
    const lastButton = (label: string): HTMLElement | null => {
      let found: HTMLElement | null = null;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('button'))) {
        if (el.childElementCount === 0 && el.textContent?.trim() === label && el.offsetParent !== null) found = el;
      }
      return found;
    };

    /**
     * Punch-zoom onto the newest buy row and land the trade. The tap visual
     * plays at the zoom's peak, but the real click waits for the camera to
     * settle: the demo buy resolves instantly, and a toast born while zoomed
     * gets cropped out of the frame.
     */
    const buyWithZoom = async () => {
      const buyBtn = lastButton('10');
      if (!buyBtn) return; // markup drifted — skip the beat, keep the show going
      fx.whoosh();
      fx.zoomTo(buyBtn, 1.24);
      await d.sleep(560);
      await d.moveToEl(buyBtn);
      d.pressAndRipple(); // the tap lands at the zoom's peak…
      fx.flash('rgba(35,165,90,.45)', 300);
      fx.boom(0.7);
      await d.sleep(120);
      fx.zoomOut(300); // …the camera snaps back…
      await d.sleep(270);
      // …and the click fires as it settles, so the success toast is born on a
      // full frame with no visible wait. Demo: simulated, nothing is spent.
      buyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await d.sleep(900);
    };

    /** Punch-zoom onto the message that contains the given text, hold, back. */
    const zoomToText = async (text: string, scale = 1.28, holdMs = 900) => {
      const el = d.findLastText(text);
      if (!el) return;
      fx.whoosh();
      fx.zoomTo(el, scale);
      await d.sleep(480 + holdMs);
      fx.zoomOut(400);
      await d.sleep(380);
    };

    /**
     * The hero's payoff, cut like the classic trench chart edit: a long
     * fast-forward chop of small candles with the B(uy) bubble printed near
     * the end (your Trenchcord entry), then a MEGA candle with its market cap
     * glowing above it, the whole chart compressing down to make room (the
     * dexscreener rescale feel), a second mega leg, and a stair-step run into
     * the top. Not a real chart; it's the "you were early" story in one card.
     */
    const chartSequence = async () => {
      const host = fxHostRef.current;
      if (!host) return;
      d.setCursorVisible(false);
      const scrim = document.createElement('div');
      scrim.className = 'fx-chart-scrim';
      host.appendChild(scrim);
      const card = document.createElement('div');
      card.className = 'fx-chart';
      card.innerHTML = `
        <div class="fx-chart-head">
          <div class="fx-chart-pair">TRENCHCORD / SOL <i>· 1m · axiom.trade</i></div>
          <div class="fx-chart-mc">MC 412K</div>
        </div>
        <div class="fx-chart-plot">
          <div class="fx-chart-pct">+2,060%</div>
        </div>
        <div class="fx-timebar"><span>01:46</span><span>01:48</span><span>01:50</span><span>01:52</span><span>01:54</span></div>`;
      host.appendChild(card);
      requestAnimationFrame(() => {
        scrim.style.opacity = '1';
        card.classList.add('show');
      });
      fx.whoosh();
      setCaption('One-click buys — right from your chats');
      await d.sleep(400);

      const plot = card.querySelector<HTMLElement>('.fx-chart-plot')!;
      const mc = card.querySelector<HTMLElement>('.fx-chart-mc')!;
      const kx = (plot.clientWidth - 74) / 400; // candles live left of the 58px price axis
      const ky = plot.clientHeight / 280;

      // ── Platform chrome: right-side MC axis with gridlines. The label set
      // swaps on each rescale, like the axis re-fitting to the new range.
      const AXIS_SETS = [
        ['1.8M', '1.5M', '1.2M', '900K', '600K', '300K'],
        ['3.6M', '3.0M', '2.4M', '1.8M', '1.2M', '600K'],
        ['9.0M', '7.5M', '6.0M', '4.5M', '3.0M', '1.5M'],
      ];
      const axis = document.createElement('div');
      axis.className = 'fx-axis';
      plot.appendChild(axis);
      const axisSpans: HTMLElement[] = [];
      for (let i = 0; i < 6; i++) {
        const bottomPct = 88 - i * 16;
        const grid = document.createElement('div');
        grid.className = 'fx-chart-grid';
        grid.style.bottom = `${bottomPct}%`;
        plot.appendChild(grid);
        const span = document.createElement('span');
        span.style.bottom = `${bottomPct}%`;
        span.textContent = AXIS_SETS[0][i];
        axis.appendChild(span);
        axisSpans.push(span);
      }
      const setAxis = (n: number) => axisSpans.forEach((s, i) => { s.textContent = AXIS_SETS[n][i]; });

      // Live last-price marker: dashed line + axis pill riding every close.
      const priceLine = document.createElement('div');
      priceLine.className = 'fx-price-line';
      const pricePill = document.createElement('div');
      pricePill.className = 'fx-price-pill up';
      const price = { designY: 0, scale: 1 };
      // The running-high line every trench terminal draws.
      const athLine = document.createElement('div');
      athLine.className = 'fx-ath-line';
      const athText = document.createElement('div');
      athText.className = 'fx-ath-text';
      athText.textContent = 'ATH Market Cap';
      const athPill = document.createElement('div');
      athPill.className = 'fx-ath-pill';
      const ath = { designY: 0, scale: 1 };
      for (const el of [priceLine, pricePill, athLine, athText, athPill]) {
        el.style.display = 'none';
        plot.appendChild(el);
      }
      const setPrice = (designY: number, text: string, up: boolean) => {
        price.designY = designY;
        price.scale = 1; // closes always print in the newest, unscaled layer
        for (const el of [priceLine, pricePill]) {
          el.style.display = '';
          el.style.transition = 'bottom .16s ease';
          el.style.bottom = `${designY * ky}px`;
        }
        pricePill.textContent = text;
        pricePill.classList.toggle('up', up);
        pricePill.classList.toggle('down', !up);
      };
      const setAth = (designY: number, text: string) => {
        ath.designY = designY;
        ath.scale = 1;
        for (const el of [athLine, athText, athPill]) {
          el.style.display = '';
          el.style.transition = 'bottom .16s ease';
          el.style.bottom = `${designY * ky}px`;
        }
        athPill.textContent = text;
      };

      // Candles live in stacked layers; a "rescale" squashes every existing
      // layer toward the baseline (old action shrinks, like an axis re-fit)
      // while the next candles print into a fresh, unscaled layer.
      const layers: Array<{ el: HTMLElement; scale: number }> = [];
      const newLayer = () => {
        const el = document.createElement('div');
        el.className = 'fx-chart-layer';
        plot.appendChild(el);
        const layer = { el, scale: 1 };
        layers.push(layer);
        return layer;
      };
      // Labels and the B bubble live outside the layers (scaleY would squash
      // the glyphs); on rescale they ride down to their candle's new top.
      const floats: Array<{ el: HTMLElement; topPx: number; scale: number }> = [];
      // Labels hug their candle's top but never leave the plot for the header.
      const floatBottom = (topPx: number, scale: number) =>
        Math.min(topPx * ky * scale + 10, plot.clientHeight - 26);
      const addFloat = (inner: HTMLElement, x: number, topPx: number) => {
        const wrap = document.createElement('div');
        wrap.className = 'fx-float';
        wrap.style.left = `${x * kx}px`;
        wrap.style.bottom = `${floatBottom(topPx, 1)}px`;
        wrap.appendChild(inner);
        plot.appendChild(wrap);
        floats.push({ el: wrap, topPx, scale: 1 });
      };
      const rescale = (k: number, axisSet: number) => {
        for (const layer of layers) {
          layer.scale *= k;
          layer.el.style.transform = `scaleY(${layer.scale})`;
        }
        for (const f of floats) {
          f.scale *= k;
          f.el.style.bottom = `${floatBottom(f.topPx, f.scale)}px`;
        }
        // The price/ATH markers ride the re-fit at the layers' pace.
        price.scale *= k;
        ath.scale *= k;
        const slow = 'bottom .4s cubic-bezier(.25,.8,.25,1)';
        for (const el of [priceLine, pricePill]) {
          el.style.transition = slow;
          el.style.bottom = `${price.designY * ky * price.scale}px`;
        }
        for (const el of [athLine, athText, athPill]) {
          el.style.transition = slow;
          el.style.bottom = `${ath.designY * ky * ath.scale}px`;
        }
        setAxis(axisSet);
        fx.whoosh();
      };

      type Candle = { x: number; b: number; h: number; up: boolean; w?: number; wickT?: number };
      const drawCandle = (layer: { el: HTMLElement }, c: Candle) => {
        const el = document.createElement('div');
        el.className = `fx-candle ${c.up ? 'up' : 'down'}`;
        const w = (c.w ?? 13) * kx;
        el.style.left = `${c.x * kx}px`;
        el.style.width = `${w}px`;
        el.style.bottom = `${c.b * ky}px`;
        el.style.height = `${c.h * ky}px`;
        const wick = document.createElement('div');
        wick.className = 'wick';
        wick.style.top = `${-(c.wickT ?? (c.up ? 10 : 7)) * ky}px`;
        wick.style.bottom = `${-6 * ky}px`;
        el.appendChild(wick);
        const body = document.createElement('div');
        body.className = 'body';
        el.appendChild(body);
        layer.el.appendChild(el);
        requestAnimationFrame(() => el.classList.add('on'));
      };
      const mcLabel = (text: string, x: number, topPx: number) => {
        const span = document.createElement('span');
        span.className = 'fx-mclabel';
        span.textContent = text;
        addFloat(span, x, topPx);
      };
      /** The Axiom-style entry marker: a green B where you bought. */
      const marker = (x: number, topPx: number) => {
        const el = document.createElement('div');
        el.className = 'fx-bbubble';
        el.textContent = 'B';
        requestAnimationFrame(() => el.classList.add('on'));
        addFloat(el, x, topPx);
      };
      // Your position, marked to market: 10 SOL in at 412K.
      const pnl = document.createElement('div');
      pnl.className = 'fx-pnl';
      pnl.style.display = 'none';
      plot.appendChild(pnl);
      const setPnl = (v: string) => {
        pnl.style.display = '';
        pnl.textContent = `PNL ${v}`;
      };

      // Phase 1 — a beat of context: three candles, then your B prints.
      const base = newLayer();
      const chop: Array<{ c: Candle; t: string }> = [
        { c: { x: 10, b: 40, h: 14, up: false }, t: '405K' },
        { c: { x: 34, b: 38, h: 14, up: true }, t: '410K' },
        { c: { x: 58, b: 44, h: 16, up: true }, t: '412K' },
      ];
      for (const { c, t } of chop) {
        drawCandle(base, c);
        setPrice(c.up ? c.b + c.h : c.b, t, c.up);
        fx.tick();
        await d.sleep(140);
      }
      await d.sleep(180);
      marker(64, 68);
      setPnl('+0.0 SOL');
      fx.boom(0.5);
      await d.sleep(550); // the entry lands…
      fx.riser(0.6);
      await d.sleep(350); // …and it rips immediately

      // Phase 2 — first leg, two cooling candles, re-fit.
      const m1 = newLayer();
      drawCandle(m1, { x: 96, b: 56, h: 128, up: true, w: 20, wickT: 14 });
      setPrice(184, '1.2M', true);
      setAth(198, '1.2M');
      mcLabel('$1.2M', 106, 196);
      mc.textContent = 'MC 1.2M';
      setPnl('+19.1 SOL');
      fx.boom(0.7);
      fx.shake(7, 340);
      await d.sleep(380);
      const cooloff: Array<{ c: Candle; t: string; p: string }> = [
        { c: { x: 130, b: 152, h: 26, up: false }, t: '1.05M', p: '+15.5 SOL' },
        { c: { x: 154, b: 142, h: 16, up: true }, t: '960K', p: '+13.3 SOL' },
      ];
      for (const [i, { c, t, p }] of cooloff.entries()) {
        drawCandle(m1, c);
        setPrice(c.up ? c.b + c.h : c.b, t, c.up);
        setPnl(p);
        fx.tick();
        await d.sleep(90);
      }
      mc.textContent = 'MC 960K';
      rescale(0.62, 1);
      await d.sleep(380);

      // Phase 3 — second leg, one red breath, re-fit.
      const m2 = newLayer();
      drawCandle(m2, { x: 186, b: 96, h: 142, up: true, w: 20, wickT: 12 });
      setPrice(238, '3.4M', true);
      setAth(252, '3.4M');
      mcLabel('$3.4M', 196, 244);
      mc.textContent = 'MC 3.4M';
      setPnl('+72.5 SOL');
      fx.boom(0.9);
      fx.shake(9, 400);
      fx.flash('rgba(22,199,132,.25)', 240);
      await d.sleep(380);
      drawCandle(m2, { x: 216, b: 196, h: 30, up: false, wickT: 18 });
      setPrice(196, '2.7M', false);
      setPnl('+55.5 SOL');
      fx.tick();
      await d.sleep(120);
      mc.textContent = 'MC 2.7M';
      rescale(0.68, 2);
      await d.sleep(380);

      // Phase 4 — straight up: the run to the top.
      const run = newLayer();
      const grind: Array<{ c: Candle; t: string; p: string }> = [
        { c: { x: 244, b: 148, h: 30, up: true, w: 16 }, t: '4.6M', p: '+102 SOL' },
        { c: { x: 270, b: 170, h: 34, up: true, w: 16 }, t: '5.6M', p: '+126 SOL' },
        { c: { x: 296, b: 188, h: 22, up: false, w: 16 }, t: '5.1M', p: '+114 SOL' },
        { c: { x: 322, b: 180, h: 38, up: true, w: 16 }, t: '6.9M', p: '+158 SOL' },
        { c: { x: 348, b: 206, h: 42, up: true, w: 16 }, t: '8.9M', p: '+206 SOL' },
      ];
      for (const [i, { c, t, p }] of grind.entries()) {
        drawCandle(run, c);
        setPrice(c.up ? c.b + c.h : c.b, t, c.up);
        setPnl(p);
        if (c.up && c.b + c.h > ath.designY * ath.scale) setAth(c.b + c.h + 4, t);
        fx.tick();
        if (c.up && i >= 2) fx.boom(0.4 + 0.15 * i);
        await d.sleep(85);
      }
      mcLabel('$8.9M', 356, 254);
      mc.textContent = 'MC 8.9M';
      fx.flash('rgba(22,199,132,.4)', 320);
      fx.boom(1);
      fx.shake(10, 400);
      card.classList.add('punch');
      const pct = card.querySelector<HTMLElement>('.fx-chart-pct')!;
      pct.classList.add('on');
      await d.sleep(1100); // hold the top — the line lands as a slam right after
      card.classList.remove('show');
      scrim.style.opacity = '0';
      await d.sleep(400);
      card.remove();
      scrim.remove();
    };

    /** Tap a room pill in the iOS bottom room bar (last match skips the sidebar). */
    const tapRoom = async (name: string) => {
      const pill = d.findLastText(name);
      if (!pill) return;
      fx.whoosh();
      const target = d.clickable(pill);
      await d.moveToEl(target);
      await d.clickEl(target);
    };

    /**
     * Dive to black, slam the closing lines, reveal the outro card. The camera
     * pushes into the app while black swallows the frame in the same motion —
     * one gesture instead of bars sliding in over live UI.
     */
    const finale = async (lines: string[]) => {
      setCaption(null);
      d.setCursorVisible(false);
      const stage = document.getElementById('root');
      fx.whoosh();
      fx.boom(0.6);
      if (stage) fx.zoomTo(stage, 1.5, 750);
      fx.blackOn(400);
      await d.sleep(480);
      fx.zoomOut(0); // reset behind the black — the outro must sit on a still frame
      // The last line is the message — let it sit.
      for (const [i, line] of lines.entries()) {
        await fx.slam(line, { hold: i === lines.length - 1 ? 950 : 470 });
      }
      fx.vignette(false);
      setCardLeaving(false);
      setCard('outro');
      await d.sleep(80);
      fx.blackOff(450);
      phaseRef.current = 'done';
      setPhase('done');
    };

    // ── Hero: "One screen" — forget juggling Discord and Telegram windows;
    //    cold-open slams, reveal the room that holds it all, CA → buy → the
    //    chart pumps with your B printed early. ~26s.
    const runOnescreen = async () => {
      // Cold open on black — the card is already covered by the smash cut.
      fx.letterbox(true);
      fx.blackOn();
      setCard(null);
      fx.riser(0.8);
      await d.sleep(450);
      await fx.slam('6 DISCORD SERVERS.', { hold: 420 });
      await fx.slam('3 TELEGRAM CABALS.', { hold: 420 });
      await fx.slam('ALL YOUR CHATS.', { hold: 420 });
      await fx.slam('ONE CHANNEL.', { intensity: 1.3, hold: 440 });
      // Reveal the app mid-flood.
      fx.blackOff();
      fx.flash('rgba(88,101,242,.5)', 320);
      fx.whoosh();
      fx.shake(9, 400);
      fx.letterbox(false);
      fx.vignette(true);
      d.setCursorVisible(true);

      setCaption('Discord + Telegram support');
      const burst: Array<[Chan, FrontendMessage['author'], string, number, Partial<FrontendMessage>?]> = [
        [CH.alpha, authors.konda, 'WTF is moving rn', 200],
        [CH.cabal, authors.tgCabal, 'big one loading. eyes on', 200],
        [CH.wagmi, authors.sam, 'my whole feed is one ticker lmao', 190],
        [CH.lounge, authors.tgMeeks, 'cabal chat going nuclear', 200],
        [CH.inverse, authors.jenz, 'im awake im awake', 190],
        [CH.wagmi, authors.brix, '6 monitors. finally useful', 200],
        [CH.alpha, authors.whatever, 'CHART GOING VERTICAL', 300, { reactions: [{ emoji: { id: null, name: '🔥' }, count: 5 }] }],
      ];
      for (const [chan, author, content, gap, over] of burst) {
        send(chan, author, content, over);
        await d.sleep(gap);
      }
      const ash = send(CH.alpha, authors.ashton, 'this is the play. loading', { isHighlighted: true });
      toast('highlighted_user', ash, 'ashton posted');
      playHighlightSound(SOUND);
      await d.sleep(450);

      // The use case in one exchange: Discord asks, your Telegram answers —
      // same screen, no app switch.
      setCaption('Someone drops a CA in Discord…');
      const call = dropCA(CH.alpha, authors.konda, `what is this??\n${SCENE_MINT}`, true, {}, 1);
      toast('contract_address', call, 'Contract detected');
      await d.sleep(500);
      rickScan(call);
      await d.sleep(350);
      // The spam wave: both servers lose their minds over the same CA.
      const caSpam: Array<[Chan, FrontendMessage['author'], string, number]> = [
        [CH.alpha, authors.whatever, 'is it real trenchcord??', 160],
        [CH.wagmi, authors.sam, 'TRENCHCORD JUST DROPPED', 160],
        [CH.alpha, authors.mera, 'is it real???', 150],
        [CH.wagmi, authors.nick, 'dev looks based. im in', 160],
        [CH.alpha, authors.lucas, 'REAL OR FAKE someone check', 150],
        [CH.wagmi, authors.brix, 'aping. this is the one', 170],
      ];
      for (const [chan, author, content, gap] of caSpam) {
        send(chan, author, content);
        await d.sleep(gap);
      }
      setCaption('…and your Telegram already knows');
      send(CH.cabal, authors.tgCabal, 'im blasting, pretty sure its really trenchcord');
      await zoomToText('im blasting, pretty sure its really trenchcord', 1.3, 700);

      setCaption('Buy it from the message. One click.');
      await buyWithZoom();

      // The payoff: your B prints early, then the chart goes vertical.
      send(CH.lounge, authors.tgDario, 'trenchcord chads saw it first');
      await chartSequence();

      await finale(['BE THE FIRST TX.', 'ON EVERYTHING SHARED.', 'TRENCH DIFFERENT.']);
    };

    // ── Scene 1: "The Call" — quiet channel, a tracked caller posts the CA,
    //    one-click buy, hype rolls in. ~18s.
    const runCall = async () => {
      fx.vignette(true);
      setCaption('3:41 AM. The trenches are quiet…');
      await d.sleep(900);
      send(CH.alpha, authors.konda, 'dead hours. someone find a play');
      await d.sleep(950);
      send(CH.alpha, authors.whatever, 'wolfie has been quiet way too long 👀');
      await d.sleep(1200);

      setCaption('Then a caller you track posts a CA');
      const call = dropCA(CH.alpha, authors.wolfie, `$TRENCHCORD\n${SCENE_MINT}`, true, { isHighlighted: true }, 1);
      toast('contract_address', call, 'Contract from wolfie');
      await d.sleep(1300);
      rickScan(call);
      await d.sleep(1000);

      setCaption('Buy it from the message. One click.');
      await buyWithZoom();

      setCaption('Filled. Chart’s already moving.');
      send(CH.alpha, authors.mera, 'in 🫡', { reactions: [{ emoji: { id: null, name: '🔥' }, count: 3 }] });
      await d.sleep(650);
      send(CH.alpha, authors.lucas, 'send it');
      await d.sleep(650);
      send(CH.alpha, authors.brix, 'chart looks stupid good already');
      await d.sleep(1400);

      await finale(['ONE CALL.', 'ONE CLICK.']);
    };

    // ── Scene 2: "The Storm" — every server erupts at once, alerts firing,
    //    then Focus mode cuts the noise. ~24s.
    const runStorm = async () => {
      fx.vignette(true);
      setCaption('Something just launched. Every trench erupts at once.');
      const burst: Array<[Chan, FrontendMessage['author'], string, number, Partial<FrontendMessage>?]> = [
        [CH.alpha, authors.konda, 'WTF is pumping rn', 380],
        [CH.cabal, authors.tgCabal, 'eyes on. big one loading', 340],
        [CH.wagmi, authors.sam, 'my whole feed is one ticker lmao', 320],
        [CH.inverse, authors.jenz, 'ok who started this', 340],
        [CH.lounge, authors.tgMeeks, 'cabal chat going nuclear', 320],
        [CH.wagmi, authors.brix, '6 monitors finally paying off', 340],
        [CH.alpha, authors.whatever, 'CHART GOING VERTICAL', 440, { reactions: [{ emoji: { id: null, name: '🔥' }, count: 5 }] }],
      ];
      for (const [chan, author, content, gap, over] of burst) {
        send(chan, author, content, over);
        await d.sleep(gap);
      }

      const ash = send(CH.alpha, authors.ashton, 'this is the play. loading', { isHighlighted: true });
      toast('highlighted_user', ash, 'ashton posted');
      playHighlightSound(SOUND);
      await d.sleep(750);
      const pre = send(CH.cabal, authors.tgCabal, 'presale wallets are bidding this too', { matchedKeywords: ['presale'] });
      toast('keyword_match', pre, 'Keyword match: presale');
      playKeywordAlertSound(SOUND);
      await d.sleep(900);

      setCaption(null);
      await fx.slam('EVERY TRENCH. AT ONCE.', { hold: 500 });
      const call = dropCA(CH.alpha, authors.wolfie, `$TRENCHCORD\n${SCENE_MINT}`, true, { isHighlighted: true }, 1);
      toast('contract_address', call, 'Contract from wolfie');
      await d.sleep(1000);
      rickScan(call);
      await d.sleep(800);
      dropCA(CH.cabal, authors.tgCabal, `TRENCHCORD. you know what to do\n${SCENE_MINT}`, false, {
        buttons: [{ text: '📈 Chart', url: `https://dexscreener.com/solana/${SCENE_MINT}` }],
      }, 0.6);
      await d.sleep(600);
      send(CH.wagmi, authors.nick, 'aped');
      await d.sleep(450);
      send(CH.alpha, authors.lucas, 'everyone and their mom posting it');
      await d.sleep(800);

      setCaption('Too loud? Focus the one channel that matters.');
      const eye = d.findLastVisible('button[title="Focus on this channel"]');
      if (eye) {
        // The eye only fades in on hover, and a scripted cursor can't hover.
        const wrap = eye.closest('span');
        if (wrap instanceof HTMLElement) wrap.style.opacity = '1';
        fx.whoosh();
        fx.zoomTo(eye, 1.3);
        await d.sleep(600);
        await d.moveToEl(eye);
        await d.clickEl(eye);
        fx.boom(0.6);
        await d.sleep(500);
        fx.zoomOut();
        await d.sleep(450);
      }
      const badge = d.findText('Focus');
      if (badge) d.spotlight(d.clickable(badge), 2000);
      await d.sleep(400);
      const ash2 = send(CH.alpha, authors.ashton, 'clean entries only. zone is 480-520k', { isHighlighted: true });
      toast('highlighted_user', ash2, 'ashton posted');
      playHighlightSound(SOUND);
      await d.sleep(1000);
      send(CH.alpha, authors.mera, 'this room is all i need fr');
      await d.sleep(1200);

      await finale(['EVERY TRENCH.', 'ONE SCREEN.']);
    };

    // ── Scene 3: "Confluence" — the same CA hits Telegram, then two Discord
    //    servers; the Contracts feed stacks the proof, then the buy. ~24s.
    const runConfluence = async () => {
      fx.vignette(true);
      setCaption('One ticker starts moving…');
      await d.sleep(800);
      dropCA(CH.cabal, authors.tgCabal, `$TRENCHCORD — early. dev is known.\n${SCENE_MINT}`, true, {
        buttons: [
          { text: '📈 Chart', url: `https://dexscreener.com/solana/${SCENE_MINT}` },
          { text: '🤖 Quick buy', url: 'https://t.me/' },
        ],
      }, 0.6);
      await d.sleep(1400);

      setCaption('First call: a Telegram cabal. Logged.');
      await d.clickText('Contracts');
      await d.sleep(1600);

      setCaption('Then Discord catches it…');
      const w = dropCA(CH.alpha, authors.wolfie, `$TRENCHCORD\n${SCENE_MINT}`, false, { isHighlighted: true }, 0.8);
      toast('contract_address', w, 'Contract from wolfie');
      await d.sleep(1700);
      const a2 = dropCA(CH.wagmiCalls, authors.ashton, `cabal + wolfie both on it. im in\n${SCENE_MINT}`, false, { isHighlighted: true }, 1);
      toast('contract_address', a2, 'Contract from ashton');
      await d.sleep(1300);

      setCaption(null);
      await fx.slam('SAME CA. THREE ROOMS.', { hold: 560 });
      setCaption('That’s not a gamble — that’s confluence.');
      await zoomToText('Contract Feed', 1.2, 1100);

      await d.clickText('Main');
      await d.sleep(450);
      rickScan(w);
      await d.sleep(800);
      setCaption('Confirmed → bought. Without leaving Trenchcord.');
      await buyWithZoom();
      await d.sleep(600);

      await finale(['THAT’S CONFLUENCE.']);
    };

    // ── Scene 4: "iOS" — a different story from the hero: buying from a
    //    phone is normally painful, and here it's one tap — or zero, when the
    //    sniper fires. Drawer + room-bar beats make the phone unmistakable.
    //    No chart, no spam wave — those are the hero's beats. ~19s.
    const runIos = async () => {
      // Cold open on black — the card is already covered by the smash cut.
      fx.letterbox(true);
      fx.blackOn();
      setCard(null);
      fx.riser(0.8);
      await d.sleep(500);
      await fx.slam('YOUR PC IS OFF.', { hold: 500 });
      await fx.slam('THE TRENCHES AREN’T.', { intensity: 1.3, hold: 470 });
      fx.blackOff();
      fx.flash('rgba(88,101,242,.5)', 320);
      fx.whoosh();
      fx.shake(8, 380);
      fx.letterbox(false);
      fx.vignette(true);
      d.setCursorVisible(true);

      setCaption('The full app — on your iPhone');
      const burst: Array<[Chan, FrontendMessage['author'], string, number]> = [
        [CH.alpha, authors.konda, 'quiet in here. anyone watching anything', 300],
        [CH.cabal, authors.tgCabal, 'scanning. one setup on watch', 320],
        [CH.lounge, authors.tgMeeks, 'phone trenching from bed rn', 360],
      ];
      for (const [chan, author, content, gap] of burst) {
        send(chan, author, content);
        await d.sleep(gap);
      }
      await d.sleep(400);

      // Unmistakably a phone: the drawer slides over the chat.
      setCaption('Rooms, DMs, feeds — all in the drawer');
      const menuBtn = d.findTitle('Show sidebar');
      if (menuBtn) {
        await d.moveToEl(menuBtn);
        await d.clickEl(menuBtn);
        await d.sleep(850);
        await d.clickText('Telegram'); // picking a room closes the drawer, like any phone app
        await d.sleep(650);
      }
      send(CH.lounge, authors.tgDario, 'we mobile now');
      await d.sleep(550);
      setCaption('Every room — one tap away');
      await tapRoom('Main');
      await d.sleep(350);

      // The story beat: buying from a phone is normally agony.
      setCaption('Buying from your phone used to be painful');
      const call = dropCA(CH.alpha, authors.wolfie, `$TRENCHCORD\n${SCENE_MINT}`, true, { isHighlighted: true }, 1);
      toast('contract_address', call, 'Contract from wolfie');
      await d.sleep(800);
      rickScan(call);
      await d.sleep(1000);

      setCaption('Not anymore. One tap.');
      await buyWithZoom();

      // And the topper: the sniper needs zero taps.
      setCaption('Or zero taps — the sniper fires the instant they post');
      const snipeMsg = send(CH.alpha, authors.ashton, `second one. same dev\n${SCENE_MINT}`, {
        isHighlighted: true,
        hasContractAddress: true,
        contractAddresses: [SCENE_MINT],
      });
      S().addSnipeResult({
        status: 'bought',
        mint: SCENE_MINT,
        configName: 'Insiders',
        solAmount: 5,
        wallets: [{ label: 'Sniper', ok: true }],
        messageId: snipeMsg.id,
        channelId: CH_PROS_ALPHA,
      });
      S().pushToast({
        kind: 'success',
        title: `Sniped ${SCENE_MINT.slice(0, 4)}…${SCENE_MINT.slice(-4)} — 5 SOL`,
        detail: 'Insiders',
      });
      fx.boom(0.7);
      fx.flash('rgba(35,165,90,.35)', 280);
      await d.sleep(2300);

      await finale(['TRENCH FROM ANYWHERE.']);
    };

    const scripts: Record<SceneName, () => Promise<void>> = {
      onescreen: runOnescreen,
      call: runCall,
      storm: runStorm,
      confluence: runConfluence,
      ios: runIos,
    };

    const prep = async () => {
      // The phone layout hides the sidebar (and its "Rooms" heading) — anchor
      // readiness on the room name instead.
      await d.waitFor(() => d.findText(SCENE === 'ios' ? 'Main' : 'Rooms'), 15000);
      const st = S();
      // On the phone the sidebar is an overlay drawer — keep it out of frame.
      st.setSidebarCollapsed(SCENE === 'ios');
      // Edit mode persists in localStorage; a stray previous session can
      // leave it ON, which would litter the recording with drag handles.
      if (st.layoutEditMode) st.toggleLayoutEditMode();
      while (S().paneRoomIds.length > 1) S().removePane(S().paneRoomIds.length - 1);
      st.setActiveView('chat');
      st.setActiveRoom(ROOM_MAIN);
      d.placeCursor();
      readyRef.current = true;
      setReady(true);
    };

    const start = async () => {
      phaseRef.current = 'running';
      setPhase('running');
      if (SCENE === 'onescreen' || SCENE === 'ios') {
        // These smash-cut straight onto black — no card fade needed.
        await scripts[SCENE]();
        return;
      }
      setCardLeaving(true);
      await d.sleep(650);
      setCard(null);
      d.setCursorVisible(true);
      await scripts[SCENE]();
    };

    const trigger = () => {
      if (phaseRef.current === 'armed' && readyRef.current) {
        phaseRef.current = 'running'; // claim immediately so a double-tap can't start twice
        start().catch(() => {
          /* cancelled on unmount */
        });
      } else if (phaseRef.current === 'done') {
        // Fresh take: a reload resets every injected message deterministically.
        window.location.reload();
      }
    };
    triggerRef.current = trigger; // the tap-catcher div (touch recordings) fires it too

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      if (e.repeat) return;
      trigger();
    };
    window.addEventListener('keydown', onKey);

    prep().catch(() => {
      /* cancelled on unmount */
    });

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('touring');
      fx.dispose();
      unframe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <style>{FONT_CSS + DIRECTOR_CSS + FX_CSS + SCENES_CSS + (FRAMED ? PHONE_FRAME_CSS : '')}</style>
      <div ref={rippleHostRef} className="absolute inset-0" />
      {card && <Card kind={card} leaving={cardLeaving} />}
      <div ref={fxHostRef} className="absolute inset-0" />
      {((phase === 'armed' && ready) || phase === 'done') && (
        // Tap-to-start/-retake for touch recordings; sits over the card, under FX.
        <div
          className="absolute inset-0 z-[53]"
          style={{ pointerEvents: 'auto' }}
          onClick={() => triggerRef.current()}
        />
      )}
      {caption && (
        <div key={caption} className="tour-caption-wrap">
          <div className="tour-caption">{caption}</div>
        </div>
      )}
      <div ref={cursorRef} className="tour-cursor" style={{ opacity: 0 }}>
        <div className={`tour-cursor-inner${SCENE === 'ios' ? ' tapdot' : ''}`}>
          {SCENE === 'ios' ? <div className="scene-tapdot" /> : CURSOR_SVG}
        </div>
      </div>
    </div>,
    document.body,
  );
}
