import { AnimatedSection, StaggerContainer, fadeUpVariant } from './AnimatedSection';
import { motion } from 'framer-motion';

interface ChangelogEntry {
  date?: string;
  version?: string;
  changed?: string[];
  added?: string[];
  fixed?: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-21',
    version: 'Trenchcord v2.0.0',
    changed: [
      '**Links to Discord and Telegram now open the apps by default** — clicking through to a message\'s original (source badges, DM conversation badges, Contracts-feed entries) now lands in the Discord / Telegram app instead of the browser. The **Open in Discord App** / **Open in Telegram App** switches under Settings → General still turn the browser behavior back on, and anyone who already made a choice keeps it (all platforms)',
      '**License: AGPL-3.0 → Trenchcord Source-Available License** — the source stays fully public so anyone can audit exactly what Trenchcord does (and what leaves their machine), and building it yourself for evaluation and verification is explicitly allowed. Day-to-day use now requires an active subscription, whether you run an official build or your own, and redistribution is not permitted. Releases published before this change remain under the AGPL-3.0',
      '**Auto-update is now opt-in (Windows)** — the Windows app no longer checks for or downloads updates on its own. A new **Automatic Updates** toggle under Settings → General controls it, **off by default**: with it off, the app never contacts GitHub for updates. Update manually from the releases page, or flip the toggle on to get the old behavior',
      '**Backup & Restore is now its own Settings section** — exporting and importing your settings used to hide at the very bottom of Help & Features; it now has its own entry in the settings sidebar, right below Guilds (all platforms)',
    ],
    added: [
      '**iOS app — Trenchcord on your iPhone (beta via TestFlight)** — the native iPhone app ships with Trenchcord 2.0: rooms, panes, all the feeds, Telegram, and full trading and sniping on the phone. Devices count into the same subscription. Snipes only fire while the app is open and in the foreground, and after any stay in the background the app reconnects Discord, Telegram, and its own backend by itself the moment you return (iOS)',
      '**Trenchcord Cloud accounts & subscriptions** — official builds link to a Trenchcord account with a one-time device code and unlock cloud-gated features via a subscription paid in SOL (1 / 3 / 12-month plans). The pairing code has a copy button and carries itself into the dashboard — it survives signing in or signing up, so it\'s pre-filled and one click approves the device. Everything sent is documented in the README\'s transparency section',
      '**A room can follow a whole Discord category** — the room\'s Channels tab now has an **Add category** button: the room takes every channel under it and keeps following it, so a channel created in that category joins the room by itself and one moved out leaves — no reopening the room. Individual channels can still be switched off inside a followed category (all platforms)',
      '**Account dashboard, in-app** — Settings → Account & Subscription mirrors dashboard.trenchcord.app once your device is linked: extend your subscription without leaving the app (pay in SOL via a Solana Pay QR code or a one-time deposit address, with live payment detection and automatic crediting), and see your linked devices, connected accounts, and payment history with Solscan links (desktop app)',
      '**Alerts** — alerts that fire even while your PC is off, because they run on Trenchcord Cloud (subscription required). Price alerts for CEX pairs, DEX tokens by market cap on Solana / Ethereum / BSC / Base / Robinhood / Monad / Tron, stocks, and metals; X account alerts (new post, keyword, reply, interaction, follow); and public Telegram channel alerts — watched by Trenchcord\'s own accounts, your Telegram login is never used. Delivered to your phone via Pushover, Telegram DM, and/or Discord DM the moment they fire, with fully configurable Pushover priorities and sounds. Managed on a new Alerts page with its own sidebar feed and hotkey: card grid, live FIRED state, one-click reactivate, plus in-app toasts and desktop notifications (desktop app)',
      '**Auto-sniping** — Trenchcord can buy a token the instant it\'s called, with no click at all. Create snipe configs on the Snipes feed page: pick a room, follow specific callers or snipe everything posted there, set the SOL amount and which Slotshark wallets fire, with per-config slippage, tip, priority fee, min/max market cap bounds, and automatic limit sells. Failed buys never retry themselves into a loop, and the snipe ledger survives restarts. Snipes trigger even when a caller bot attaches the contract via an edit moments after posting — the common Rick-style pattern (desktop app)',
      '**Re-snipe policies** — choose per config what happens when the same token is called again: never re-snipe (the default), after a cooldown, or up to X times per token. The same message can never fire twice, so a bot editing its own call won\'t double-buy (desktop app)',
      '**Keyword-triggered snipes** — map keywords to contract addresses: when a followed caller writes e.g. `ANSEM`, Trenchcord instantly buys the contract you mapped to that word — no address needs to appear in the message at all (desktop app)',
      '**Skip if already bought** — a per-config toggle that skips the buy when the wallet already holds the token, so a token you\'re already in doesn\'t get a second position stacked on top (desktop app)',
      '**Snipes feed** — a new sidebar feed collecting every message that triggered a snipe, with a colored outcome badge: green `SNIPED`, orange `SKIPPED`, or red `FAILED` with the reason. Snipe configs live right on the page in a card grid, and an empty feed shows a step-by-step setup checklist (desktop app)',
      '**Keywords feed** — every keyword-matched message across your rooms collects into a dedicated feed with the matched keyword badge, so you can review past matches instead of relying on catching the toast',
      '**Contract feed shows the message** — each entry shows who posted it, where, and the message text itself, so you can judge a call without leaving the dashboard. Search also matches message text',
      '**Feed hotkeys & bring-to-front** — single-key hotkeys for the Contract feed, Mentions, Keywords, and Snipes, plus an OS-wide shortcut that raises and focuses Trenchcord from anywhere (desktop app)',
      '**Threads & forum posts** — messages posted in threads and forum posts under a monitored channel now reach your rooms, labeled `parent › thread-title` (they previously never arrived)',
      '**New Discord message formats render fully** — "Components v2" bot messages and forwarded messages used to show up completely blank; both now render with clickable contract pills, images, and working link buttons — and contract detection, keyword alerts, search, trade buttons, and the snipe engine all see their text too',
      '**Native Discord polls, stickers, GIFs & video embeds** — polls render with live vote share, stickers display (including animated ones), Tenor & Giphy GIFs autoplay as looping clips, and playable videos get an inline player',
      '**Image viewer with zoom** — full-screen viewer with wheel / double-click / pinch zoom, drag to pan, a save button, and an open-in-browser button for Discord CDN images',
      '**Clickable notification toasts** — clicking a highlighted-user, keyword, or contract toast jumps to the message, either inside Trenchcord or to the original in Discord / Telegram',
      '**Hiding a user also hides bot scans of their calls** — replies that bots (e.g. Rick) post to a hidden user\'s messages are hidden along with them, instead of leaving orphaned scans in the feed',
      '**Pushover notification per snipe config** — each config can push every snipe result (bought or failed, with token, SOL amount, and per-wallet outcome) to your phone, with a chart link attached (desktop app)',
      '**fomo.family trade links** — Fomo joins Axiom, Padre, Bloom, and GMGN as a platform preset under Settings → Contracts, for both SOL and EVM contract links (Solana, Ethereum, BNB, Base, Robinhood, and more), and as an "Open Chart on Buy" site',
      '**Full network transparency** — the README documents every single request the app makes off your machine: what triggers it, exactly what is sent, and what comes back. Any future outbound endpoint will be documented there as part of the change',
      '**Help & Features refresh** — the in-app guide now covers everything recent: split screen, pop-outs, all five feeds, Telegram in rooms, trading, sniping, cloud Alerts, and hotkeys',
      '**Settings search** — a search bar at the top of Settings: type part of a setting\'s name (or a related word — "sound", "slippage", "proxy", "@everyone"…) and matching settings appear instantly with their section name. On/off settings show their switch right in the result row, and clicking a result jumps to its section, scrolls to the setting, and briefly highlights it (all platforms)',
      '**All DMs — every incoming Discord DM in one room** — a new **All DMs** entry at the top of the sidebar collects every Discord DM as it arrives into a single feed. Each message keeps its conversation badge, and the room works everywhere rooms do: panes, pop-outs, feed hotkeys. With multiple Discord accounts connected, each DM shows which of your accounts received it (all platforms)',
      '**Mute-all button in the chat header** — a speaker icon next to the pop-out button silences every notification sound Trenchcord plays in one click; click again to unmute. The icon turns red while muted and the choice survives restarts. On the phone it lives in the header\'s ⋮ menu (all platforms)',
      '**Custom renames** — click a username and pick **Rename User** to call them whatever you want. The custom name replaces their platform name everywhere in Trenchcord — messages, replies, the mute/highlight menus — for Discord and Telegram authors alike, and nothing changes on Discord itself',
      '**Server icon badges** — the source badge next to each message can now show the server\'s icon with just the **#channel** name, like Discord\'s own channel pills. On by default everywhere — your call, per platform, under Settings → General → **Source Badge**',
      '**Mute by role** — right-click (or tap) a user and pick **Mute by Role**: messages from anyone holding that role disappear from your feeds, server-wide. You can also browse a server\'s full role list in the room settings\' new **Roles** tab and mute from there; muted roles appear alongside hidden users, where one click unmutes them',
      '**Highlight by role** — highlight entire server roles the way you highlight users, each with its own color: pick them in the **Roles** tab, or right-click a user → **Highlight by Role**. Messages from anyone holding the role light up with the room\'s highlight style and fire the same alerts as highlighted users — including Pushover',
      '**Unread badges now sync with Discord — both ways** — unread counters used to be Trenchcord-only. Reading a channel or DM in the official Discord app (phone or desktop) now clears the matching badges in Trenchcord: the app picks up the read receipts Discord already sends over the existing connection. And with the new **DM Read Sync** toggle under Settings → General (off by default), viewing a DM in Trenchcord marks that conversation read on Discord itself, so the badge disappears from your other Discord clients too. The other direction is DMs only by design — opening a Trenchcord room never marks its guild channels read in Discord. The aggregate All DMs badge only drops by the read conversation\'s share (other DMs may still be unread), acks hold while the Trenchcord window is unfocused so an open DM pane doesn\'t eat messages while you\'re away, and marking a channel as *unread* in Discord leaves Trenchcord\'s badges alone (all platforms)',
      '**All DMs: exclude users** — a new **All DMs** section in Settings (also reachable via the gear that appears on the All DMs row in the sidebar) keeps chosen users out of the aggregate All DMs feed, by Discord user ID or username (leading @ and letter case don\'t matter). Their DMs stop appearing in the feed and stop counting toward its unread badge, including DMs already in the feed\'s history — the individual DM conversations in the sidebar are untouched (all platforms)',
      '**Mentions from bots can now be filtered out** — a new toggle under Settings → Mentions controls whether messages from bot accounts (Rick and friends replying to or pinging you) land in the Mentions feed. It\'s on by default, so nothing changes unless you switch it off (all platforms)',
      '**Per-channel message colors** — a channel can now have its own background color instead of inheriting its guild\'s. In a room\'s settings, the new **Channel Message Colors** section lists the room\'s guild channels, each with the same color-and-opacity picker as guild colors and a badge showing whether it follows the **GUILD COLOR** or has a **CUSTOM** one; a custom channel color overrides the guild color just for that channel and sticks even when the guild color later changes — channels without one keep following the guild color (delete a custom color to go back to that), and like guild colors it applies globally across every room (all platforms)',
      '**Compact mode: show the name only once per group** — a new toggle under Settings → General → Message Display (shown when Compact is selected): when someone sends several messages in a row, only the first one shows their avatar, name, and channel badge — the follow-ups are just the message text, like Discord\'s own grouping (all platforms)',
      '**Ephemeral messages are now labeled — and can be hidden** — bot replies that Discord shows only to your account (e.g. Rick\'s "This message is too old to delete.") used to look like normal chat; they now carry an eye icon with **Only you can see this** underneath, like in Discord. A new **Ephemeral Messages** toggle under Settings → General controls whether they appear at all — it\'s on by default, and switching it off also hides the ones already in your feeds (all platforms)',
    ],
    fixed: [
      '**The "used /command" line now shows the whole command** — Discord doesn\'t put a slash command\'s arguments in the bot\'s reply, so the line read just "goodbyes used /wallet"; pointing at the command now fetches the arguments the way Discord\'s own client fills its tooltip, and the full command shows on the line, in its tooltip, and in what clicking copies (all platforms)',
      '**Long links are no longer cut short** — a URL longer than 70 characters rendered as its first 65 characters plus "…", so the tail of a long address couldn\'t be read; the whole URL now shows, wrapping across lines the way Discord draws it (all platforms)',
      '**Telegram DMs in the sidebar no longer show your own name** — a conversation was labelled with whoever sent the last message, so replying to someone renamed their conversation to *you*; it now always shows the other person, like the conversation header already did (all platforms)',
      '**Voice messages now play in the app instead of arriving as a file to download** — Discord and Telegram voice notes now render the way Discord draws them: a play button, the recorded waveform (click or drag to seek), the running time, a 1x/1.5x/2x speed pill and a mute button — in normal messages, compact mode and forwarded bodies alike. Starting one stops whatever else was playing (all platforms)',
      '**One malformed message can no longer blank the whole app** — a message whose author id isn\'t numeric crashed the default-avatar lookup and took the entire message list down with it; the avatar now falls back to Discord\'s default',
      '**User menu no longer runs off the bottom of the screen** — clicking a username near the bottom edge opens the menu above the name instead of cutting it off below the window',
      '**Room edit/delete buttons on touch devices** — the per-room Edit and Delete buttons only appeared on mouse hover, so they were unreachable on phones; in the compact layout they are now always visible',
      '**Phone: tapping a room no longer "ghost-opens" an image behind the drawer** — the tap that picked a room could fall through to the chat underneath and open whatever sat under the finger',
      '**Image viewer no longer dims for deleted messages** — the viewer now renders at full opacity regardless of where it was opened from',
      '**Adding your first Discord token now starts the setup guide** — pasting a token later under Settings → Tokens used to drop you into an empty app with no hint of what to do next; the welcome guide now opens the moment your first token connects and lands you in the chat view (all platforms)',
      '**Message badges now sit on one line, properly aligned** — the CONTRACT and keyword badges next to a message\'s author no longer sit a few pixels lower than the channel badge, in both cozy and compact mode (all platforms)',
      '**Server icon badges no longer randomly degrade to lettered circles** — the server list is now loaded at startup and re-synced every time the app reconnects to the backend, so badges reliably show the server\'s icon (all platforms)',
      '**Importing settings opens your rooms, not an "Unknown" room** — the saved layout is remapped to the recreated rooms during an import, so restoring a backup no longer opens a dead pane (all platforms)',
      '**Terminal no longer spammed with "Unsupported pixel format" errors** — the desktop app now silences Chromium\'s harmless internal decoder logging (desktop app)',
      '**Discord reconnection no longer gives up for good after repeated sleep/wake cycles** — the reconnect budget refills whenever a session resumes, and returning to the foreground retries a connection that had exhausted its attempts (desktop + iOS)',
      '**Embed footers now show the timestamp** — bot embeds that carry a timestamp (PulseX delivery notices and the like) used to show only the footer text; they now render it Discord-style as "Sent by Daniel • Today at 0:44", including embeds with a timestamp but no footer text at all (all platforms)',
      '**Mentions inside embeds now resolve to real names** — a `<@id>` inside an embed (e.g. "Sent to @Daniel" in a bot\'s delivery notice) used to render as a literal **@user**, because Discord doesn\'t list embed-only mentions in the message data. Embed text is now scanned for user, channel, and role mentions and the names are filled in from the app\'s own caches — anyone who has ever sent a message or been pinged where Trenchcord is listening resolves; a user the app has truly never seen still falls back to @user. This covers bot replies that post an empty shell first and attach the embed via an edit a moment later (the usual slash-command pattern): message edits now re-resolve mentions too (all platforms)',
      '**Buy buttons no longer appear under wallet addresses** — a wallet address looks exactly like a token contract in text, so wallet-tracker posts ("this wallet just aped…") used to grow buy buttons under the *wallet*. Detected addresses are now checked once against Solana\'s public RPC (`api.mainnet-beta.solana.com` — only the address itself is sent, and only while trading is enabled) and buttons stay only under actual token mints. The check fails open: a brand-new token the chain hasn\'t confirmed yet, or an RPC hiccup, never delays or hides real buy buttons — a wallet\'s buttons may flash briefly before the answer lands, and answers are remembered for the session (all platforms)',
      '**All DMs badge now drains as you read each DM** — the aggregate All DMs counter used to clear only when you opened the All DMs feed itself, so reading every conversation one by one (in Trenchcord or, with read sync, in Discord) left its badge stuck. Each DM\'s contribution to the aggregate is now tracked individually and subtracted the moment that DM is read anywhere. Relatedly, a message that arrives while it\'s already on your screen — its DM or room open in a visible pane — no longer counts as unread at all: it used to still bump the All DMs badge, and any other room watching the same channel (all platforms)',
      '**Pasted images and GIFs now render like Discord** — a message that is just a media link (a Discord CDN image link, a Giphy/Tenor GIF, a direct video URL) no longer shows the blue URL above the media: the link is hidden and only the media renders, without the grey embed box around it. Pasted image links also used to shrink to a tiny 80px thumbnail — they now display at full size, and all inline images and videos got bigger overall (up to 550×350 like Discord, previously 400×300). Embed media is also capped at its source\'s real dimensions, so a small GIF from Discord\'s GIF picker stays small instead of blowing up into a blurry giant (Tenor\'s video files are upscaled). If a room has embeds disabled, the link keeps showing so the message never turns blank (all platforms)',
      '**Videos show a preview frame instead of a black box** — unplayed videos (Discord and Telegram alike) used to sit as a black rectangle at 0:00 until you pressed play; they now display their first frame as a thumbnail, like Discord. Telegram videos also gained proper seeking — the backend\'s media proxy now serves byte ranges, which is also what lets them play on iOS at all (all platforms)',
      '**Compact mode: names now line up when avatars are on** — consecutive messages from the same user hide the repeated avatar, but the name used to start flush left where the avatar would be, so a user\'s own messages zig-zagged. Grouped messages now reserve the avatar\'s width and every name in the group aligns (all platforms)',
    ],
  },
  {
    date: '2026-07-28',
    version: 'v1.3.0',
    added: [
      '**One-click Solana trading via Slotshark** — buy a token the moment it\'s called, without leaving Trenchcord. When a message contains a Solana contract, a row of buy buttons appears under it with your own SOL amounts (up to five, fully editable). Add your Slotshark API token and wallets under Settings > Trading, where you can also set slippage, tip, priority fee, anti-MEV, and pick the US or EU server. A message with several contracts gets one clearly-labelled row per token, so you always know what you\'re buying. Buys fire on a single click by default; turn on double-click protection if you\'d rather confirm first. Your API token stays on your machine, is never shown again after saving, and is never included in a settings export (desktop app)',
      '**Multi-wallet buys** — tick as many of your Slotshark wallets as you want and a single click fires on all of them. Pick what an amount means under Settings > Trading: **that much per wallet** (clicking 5 SOL with 3 wallets buys 5 SOL on each, spending 15) or **split across wallets** (clicking 5 SOL spends 5 SOL total, about 1.667 from each). The settings panel shows the real total before you save, the buy row shows which mode is live, and each button\'s tooltip states what the click costs. If one wallet fails, the others still go through and you\'re told which one missed',
      '**Open the chart when you buy** — turn on Settings > Trading > Open Chart on Buy and clicking a buy button also opens that token on Axiom, Padre, Bloom, GMGN, or any site you paste in, so you land on the chart to manage the position instead of pasting the address by hand. It follows your Contracts platform setting by default, opens instantly without waiting for the buy to confirm, and won\'t spam tabs when you scale into the same token',
      '**Cleaner buy rows** — the contract address on the buy row can be turned off under Settings > Trading > Button Appearance, leaving just the amounts, since the address is already in the message above. Messages carrying several contracts always keep it, so you can still tell which row spends on which token',
    ],
    fixed: [
      '**Telegram stays connected** — Telegram could silently drop (after a network blip, laptop sleep, or an idle connection being cut) and never come back, so messages just stopped arriving until you restarted or reloaded Trenchcord. The connection is now health-checked continuously and rebuilt automatically, and the Telegram indicator in the sidebar reflects the real state instead of showing connected',
      '**Trenchcord is no longer reachable from your network** — the self-hosted/desktop backend used to listen on every network interface and accept browser requests from any origin, while its settings export returns your Discord tokens and Telegram sessions in plaintext. On shared or public Wi-Fi, anyone on that network could read them straight off the port, and any website you had open could do the same through localhost. It now listens on this machine only, restricts browser origins, and validates the Host header — including on the live message WebSocket — to block DNS-rebinding',
      '**The local API now requires a token** — every request to the self-hosted API and the live message socket must carry a token that only this machine\'s Trenchcord page is given, so nothing else running on your computer can read your messages or spend from your trading wallet either. It\'s handled for you: opening Trenchcord normally signs you in. To use it from another device on a network you trust, set `TRENCHCORD_HOST=0.0.0.0` and open the URL the server prints at startup on that device — one visit and it stays signed in. Add `TRENCHCORD_ALLOWED_HOSTS` if you browse to it by name rather than by IP',
    ],
  },
  {
    date: '2026-07-25',
    version: 'v1.2.0',
    added: [
      '**Browser pop-out windows** — pop out a room, DM, or Mentions into its own browser window from the self-hosted web UI, not just the desktop app. Closing the window re-docks the chat into your layout',
    ],
    fixed: [
      '**Telegram bot chats in rooms** — DMs with Telegram bots now show up in the room channel picker (with a `BOT` badge), so you can add alert bots and other bot chats alongside groups and channels',
    ],
  },
  {
    date: '2026-07-14',
    version: 'v1.1.1',
    added: [
      '**Pop-out chat windows** — detach any room, DM, or your Mentions feed into its own native window that keeps streaming live, so you can watch a caller channel on a second monitor while you trade. Click the pop-out icon in a chat header; the chat re-docks automatically when you close the window (desktop app)',
      '**Automatic EVM chain detection** — when a contract is posted as a bare `0x…` address with no chain mentioned, Trenchcord now resolves its real chain from on-chain liquidity (DexScreener, with a GeckoTerminal fallback), so the trade link opens on the correct network instead of a default',
      '**Proxy support** — if Discord won\'t load behind a VPN, route the gateway and history connection through an HTTP/HTTPS proxy under Settings > General > Connection. Leave it blank to connect directly (desktop app)',
    ],
    fixed: [
      '**Desktop app launches again** — the 1.1.0 desktop build could crash on startup and show a blank/black window; it now opens correctly. Update to 1.1.1 if you were affected (desktop app)',
      '**Connection blocks no longer look like a bad token** — a VPN or datacenter IP block (Discord/Cloudflare rejecting the connection) now shows a distinct `Connection blocked` banner instead of falsely flagging your token as invalid',
      '**Richer Telegram text** — bold, code blocks, and inline links now render correctly; a formatting-offset bug that could mangle or misplace styled text is fixed, and noise-only links (bare numbers) are dropped to plain text',
      '**Announcements stay dismissed** — dismissed in-app announcements now persist across restarts instead of reappearing every launch (desktop app)',
      '**Setup no longer hangs on a spinner** — if your servers can\'t load during onboarding (for example, a blocked connection), the welcome screen now shows the error with a shortcut to connection settings instead of spinning forever',
    ],
  },
  {
    date: '2026-07-13',
    version: 'v1.1.0',
    added: [
      '**Split-screen layout** — watch up to 4 rooms, DMs, or your Mentions feed side by side. Add panes with the `+` button in a chat header, then use the layout button in the sidebar to drag, resize, lock, and rearrange them in a single row or two rows. Your layout is saved and restored across restarts',
      '**Mentions room** — a dedicated room that gathers every message where you, one of your roles, `@here`, or `@everyone` was mentioned across the channels you already monitor. Toggle each mention type under Settings > Mentions',
      '**Room hotkeys** — assign a single key to any room and press it anywhere (outside a text field) to jump straight to it',
      '**See who reacted** — click a reaction on a Discord message to see the list of users who reacted with that emoji',
      '**Unread badges** — the sidebar now shows a blue unread counter on rooms, DMs, and Mentions, clearing the moment you open them',
      '**Desktop app** — Trenchcord is now available as a native desktop app for Windows and macOS, with auto-updates, keeping your token and data fully on your machine',
      '**In-app announcements** — important updates and notices can now surface in a dismissible in-app modal',
      '**Import on setup** — the welcome screen now lets you import an existing config.json (token, rooms, and settings) to get going in one step, or continue without a token to explore the app first',
      '**Local backups include credentials** — in self-hosted mode, settings backups now include your Discord tokens and Telegram credentials so a restore fully reconnects you (hosted mode still never exports credentials — keep local backups somewhere safe)',
      '**Invalid token indicator** — when Discord rejects a token, it\'s flagged with a red `Invalid` badge in Settings > Tokens, and errors now name the specific token',
      '**Community links** — quick Join Discord and X / Twitter buttons in the sidebar',
      '**Open source under AGPL-3.0** — this release is now licensed under the GNU AGPL-3.0',
    ],
    fixed: [
      '**Stable scroll while reading back** — scrolling up now pauses the feed and holds your position instead of drifting as new messages arrive. An `X new messages` pill (with the time of the first one) and a `Jump To Present` banner let you catch up whenever you\'re ready',
      '**Smarter token error handling** — connection problems (Discord unreachable, too many connections) are no longer mistaken for an invalid token; only Discord\'s explicit rejection flags a token as invalid',
    ],
  },
  {
    date: '2026-07-02',
    added: [
      '**Deleted message indicator** — messages removed on Discord now stay in the feed with a red `deleted` badge and dimmed styling, so you never miss something that was posted and then pulled',
      '**Edited message history** — edited messages now show an `(edited)` label; click it to reveal the original text from before the edit',
      '**Telegram link buttons** — inline keyboard URL buttons (dashboards, charts, etc.) now render as clickable buttons beneath the message',
      '**Telegram in-text links** — hyperlinks embedded inside Telegram message text now render as clickable links instead of plain text',
      '**Telegram chat colors** — color-code messages per Telegram chat, just like Discord servers and DMs',
      '**Telegram basic group support** — legacy Telegram groups now resolve an invite link so their messages link back to the chat and open in the Telegram app',
    ],
  },
  {
    date: '2026-06-01',
    fixed: [
      '**Auto-scroll reliability** — chat now stays pinned to the newest message in the cases that previously left it stranded a row or two above the bottom: tall multi-row messages and embeds, several messages arriving at the same time, and reactions added to recent messages. Auto-scroll now chases the live content height until the layout settles (including late-loading images) instead of relying on a fixed-delay smooth scroll, and it gracefully steps aside the moment you scroll up',
    ],
  },
  {
    date: '2026-05-04',
    added: [
      '**Display Full Contract Address** — new setting under Settings > Contracts to show contract addresses in their full form instead of the shortened `0x1234...abcd` pill, both in chat and the Contracts dashboard',
    ],
    fixed: [
      '**Memory leak on long sessions** — chat tabs running for hours no longer balloon into multiple GB of RAM. All message images (avatars, attachments, embeds, custom emojis, Telegram stickers) now lazy-load, and only the most recent ~200 messages live in the DOM at rest — scroll up to load more in 200-message chunks',
      '**Re-render performance** — message rows are memoized so a new incoming WebSocket event no longer re-renders every visible message',
    ],
  },
  {
    date: '2026-03-12',
    fixed: [
      '**Auto-scroll reliability** — chat no longer stops auto-scrolling when a reaction or large image appears, even if the user hasn\'t scrolled up',
    ],
  },
  {
    date: '2026-03-06',
    added: [
      '**Telegram integration** — monitor Telegram groups, channels, supergroups, and DMs alongside Discord',
      '**Telegram setup flow** — connect your Telegram account with phone number, verification code, and optional 2FA',
      '**Encrypted Telegram credentials** — API ID, API hash, and session strings encrypted at rest with AES-256-GCM',
      '**Telegram message rendering** — replies, forwards, stickers, polls, and media displayed natively in the feed',
      '**Mixed rooms** — combine Discord and Telegram channels in the same room',
      '**Mobile responsivity** — improved mobile-friendly layouts and touch interactions across the app',
    ],
    fixed: [
      'Backend environment configuration',
    ],
  },
  {
    date: '2026-03-05',
    added: [
      '**Hosted web app mode** — Trenchcord can now run as a multi-user web app, no installation required',
      '**User authentication** — sign up and log in with Email/Password or Discord OAuth',
      '**Encrypted token storage** — Discord tokens encrypted at rest with AES-256-GCM',
      '**Per-user Discord gateways** — each user gets their own gateway connection with idle management',
      '**Profile page** — view account info, login method, and sign out',
      '**Security hardening** — helmet headers, rate limiting, CORS, JWT WebSockets, error sanitization',
      '**In-memory caching** — server-side cache to minimize database round-trips',
      '**Role colors** — usernames now display their highest Discord role color',
      '**Compact mode** — denser message layout for power users',
      '**Custom DM colors** — personalize DM channel name colors',
      '**DM profile pictures** — avatars now show in DM conversations',
      '**Background opacity control** — adjust chat background transparency',
      '**Sound alerts** — configurable notification sounds per channel',
      '**Chat UI enhancements** — polished message rendering and layout',
    ],
  },
  {
    date: '2026-03-04',
    added: [
      '**Sending messages** — reply and send messages directly from Trenchcord',
      '**Self-host pill** — visual indicator for self-hosted instances',
    ],
  },
  {
    date: '2026-03-03',
    added: [
      '**Pushover notifications** — push alerts via Pushover integration',
      '**Sound settings** — granular control over notification sounds',
      '**Responsive design** — improved layout for smaller screens',
      '**Favicon and logo** — custom branding assets',
      '**Landing page anchors** — smooth scroll navigation on the landing page',
    ],
    fixed: [
      'Build issues resolved',
      'Mobile gate for demo mode',
    ],
  },
  {
    date: '2026-03-01',
    added: [
      '**Quick menu user highlighting** — highlight users directly from the right-click menu',
    ],
  },
  {
    date: '2026-02-28',
    added: [
      '**Onboarding wizard** — guided setup flow for new users',
    ],
    fixed: [
      'Highlight mode behavior',
      'Highlighting users on click',
    ],
  },
  {
    date: '2026-02-27',
    added: [
      '**Search bar** — search through messages',
      '**Demo mode** — try Trenchcord without connecting a token',
      '**Live demo on landing page** — embedded demo for visitors',
      '**CA feed & embeds** — contract address detection and rich embed rendering',
      '**Global settings** — centralized configuration panel',
      '**Custom confirm modals** — styled confirmation dialogs',
      '**Keyword & sound settings** — keyword-based alerts with sound configuration',
      '**Landing page rework** — redesigned landing page',
    ],
    fixed: [
      'Desktop notifications reliability',
      'Multiple embed messages rendering in a row',
      'Autocomplete behavior',
      'Unknown channel handling',
      'Netlify demo build',
    ],
  },
  {
    date: '2026-02-26',
    added: [
      '**Initial release** — core Discord gateway, multi-account support, real-time message streaming',
      '**Landing page** — project homepage with installation guide',
      '**Config via JSON** — switched from .env to config.json for easier setup',
      '**Open-source section** — added to landing page',
    ],
    fixed: [
      'Setup guide first step flow',
    ],
  },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-white font-semibold">{part}</strong> : part
  );
}

export function Changelog() {
  return (
    <section id="changelog" className="relative py-20 px-6 scroll-mt-14 bg-dc-sidebar">
      <div className="mx-auto max-w-3xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Changelog
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Latest updates and improvements to Trenchcord.
          </p>
        </AnimatedSection>

        <StaggerContainer className="relative" staggerDelay={0.08}>
          {/* Timeline line */}
          <div className="absolute left-[7px] sm:left-[9px] top-2 bottom-2 w-px bg-dc-divider" />

          {CHANGELOG.map((entry, idx) => (
            <motion.div
              key={entry.date ?? 'unreleased'}
              variants={fadeUpVariant}
              className={`relative pl-8 sm:pl-10 ${idx < CHANGELOG.length - 1 ? 'pb-10' : 'pb-0'}`}
            >
              {/* Timeline dot */}
              <div className="absolute left-0 top-1.5 w-[15px] h-[15px] sm:w-[19px] sm:h-[19px] rounded-full border-2 border-dc-blurple bg-dc-main" />

              <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-5 sm:p-6">
                <time className="text-xs font-medium text-dc-blurple tracking-wide uppercase">
                  {entry.version && (
                    <span className="text-white font-semibold">{entry.version} · </span>
                  )}
                  {entry.date ? formatDate(entry.date) : 'Unreleased'}
                </time>

                {entry.changed && entry.changed.length > 0 && (
                  <div className="mt-3">
                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded mb-2">
                      Changed
                    </span>
                    <ul className="space-y-1.5">
                      {entry.changed.map((item, i) => (
                        <li key={i} className="text-sm text-dc-text-muted leading-relaxed flex gap-2">
                          <span className="text-sky-400 shrink-0 mt-0.5">±</span>
                          <span>{renderBold(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.added && entry.added.length > 0 && (
                  <div className="mt-3">
                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded mb-2">
                      Added
                    </span>
                    <ul className="space-y-1.5">
                      {entry.added.map((item, i) => (
                        <li key={i} className="text-sm text-dc-text-muted leading-relaxed flex gap-2">
                          <span className="text-green-400 shrink-0 mt-0.5">+</span>
                          <span>{renderBold(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.fixed && entry.fixed.length > 0 && (
                  <div className="mt-3">
                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded mb-2">
                      Fixed
                    </span>
                    <ul className="space-y-1.5">
                      {entry.fixed.map((item, i) => (
                        <li key={i} className="text-sm text-dc-text-muted leading-relaxed flex gap-2">
                          <span className="text-amber-400 shrink-0 mt-0.5">~</span>
                          <span>{renderBold(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
