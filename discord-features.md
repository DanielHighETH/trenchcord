# Trenchcord — Full Feature Write-Up (Discord Post)

Three messages, each under Discord's 2000-char limit. Copy each block (inside the fences) and post them in order.

---

## Message 1 of 3 — What It Is + Monitoring & Aggregation

````markdown
# Everything Trenchcord Can Do

**Trenchcord** is a Discord frontend supercharged for trenching — aggregate channels from multiple servers (and Telegram), highlight users, auto-detect Solana + EVM contracts, and one-click trade on Axiom / GMGN / Bloom / Padre from one dashboard.

Use it hosted at **<https://app.trenchcord.app>** or self-host it (no database, tokens never leave your PC).

## Aggregation & Monitoring

- **Custom Rooms** — pull channels from any number of servers into a single unified feed
- **Telegram Integration** — monitor Telegram **groups, channels, supergroups, and DMs** alongside Discord in the same room
- **Mixed Rooms** — combine Discord + Telegram channels in one feed
- **Real-time Streaming** — live updates via a raw Discord Gateway connection (no polling)
- **DM Support** — monitor Discord DMs alongside guild channels; Telegram DMs too
- **Multiple Accounts** — add multiple Discord tokens and monitor across accounts at once
- **Search** — full message search across your feed
- **Focus Mode** — click the eye icon on any message to filter the room to just that channel; click the X on the badge to exit
- **Rich Rendering** — replies, forwards, stickers, polls, media, embeds, and reactions all render natively (Discord + Telegram)

## Contract Detection & Trading

- **Auto CA Detection** — Solana addresses appear as green pills, EVM (`0x…`) as yellow pills
- **One-Click Trading** — click a contract to open it in **Axiom, GMGN, Bloom, Padre**, and more
- **Custom Link Templates** — configure exactly which trading platform each contract type opens in
- **Contracts Dashboard** — live feed of every detected CA across all rooms, searchable and filterable by chain
- **Auto-Open Highlighted Contracts** — when a highlighted user posts a CA, Trenchcord can auto-open the trading link in a new tab
- **Badge Click Actions** — click a message's server/#channel badge to jump to the original message in Discord app or browser, open the trading platform, or both

*👇 Part 2 — alerts, highlighting, messaging & UX*
````

---

## Message 2 of 3 — Alerts, Messaging & UX

````markdown
# Trenchcord Features (2/3) — Alerts, Messaging & UX

## User Highlighting & Keyword Alerts

- **Global User Highlights** — add Discord user IDs in **Settings → Highlighted Users** to track key callers/wallets across every room (blue border + toast alert + sound)
- **Per-Room Highlights** — room config → Users tab, for room-scoped tracking
- **Quick Highlight** — right-click any username to highlight them instantly
- **Keyword Alerts** — global **or** per-room, with three match modes:
  - **Contains** (substring)
  - **Exact** (whole word)
  - **Regex** (full pattern power)
  Matched messages get an orange border.
- **Hide Users** — right-click → Hide user to suppress a noisy user in a specific channel; manage hidden users from the channel header
- **User Filter** — room config → Filter tab, restrict a room to messages from a specific set of user IDs only

## Notifications & Sound

- **Three Independent Sound Channels** with individual volume: Highlighted User / Contract Alert / Keyword Match
- **Custom Sounds** — upload MP3 / WAV / OGG or use built-in tones
- **Desktop Notifications** — browser notifications when the tab isn't focused
- **Pushover Integration** — phone push alerts when highlighted users post contracts

## Messaging (Quick Reply & Chat)

- **Send from Trenchcord** — reply and send messages directly without switching to Discord
- **Channel Selector** — `#` icon in the message bar to pick any channel across any guild
- **Quick Reply** — click reply on any message to auto-target that channel
- **File Attachments** — up to 10 files per message via `+` button or clipboard paste
- **Focus-Aware Input** — when Focus Mode is active, the input auto-targets that channel
- **Opt-In** — disabled by default (read-only mode is safer); enable in Settings → General

## UX & Customization

- **Guild Colors** — assign a background color to each server so messages are instantly identifiable in multi-guild rooms
- **Role Colors** — usernames show their highest Discord role color
- **Room Color** — custom background tint per room
- **Compact Mode** — denser message layout for power users
- **Custom DM Colors** + DM profile pictures in the sidebar
- **Background Opacity** — adjust chat background transparency
- **Image Lightbox** — click any image to view fullscreen, ESC to close
- **Disable Embeds** per channel inside a room
- **Onboarding Wizard** — guided setup for new users

*👇 Part 3 — try it yourself before installing*
````

---

## Message 3 of 3 — Try It Before You Install

````markdown
# 🎮 Try Trenchcord Before You Install

Not sure if it's for you? **You can try the full app live in your browser — no Discord token, no signup, no install, nothing to download.**

**Live demo → <https://demo.trenchcord.app>**

Play around with rooms, highlighting, contract detection, focus mode and everything else — all with mock data so nothing touches your real account.

When you're ready for the real thing:
- **Hosted app** (zero setup) → <https://app.trenchcord.app>
- **Self-host / source code** → <https://github.com/DanielHighETH/trenchcord>
- **Setup guide** → <https://trenchcord.app/#setup>
- **Updates / X** → <https://x.com/trenchcordapp>

> ⚠️ **Heads up:** Trenchcord is independent and **not affiliated with Discord Inc.** Using any self-bot — including this one — breaks Discord's ToS and **can get your account banned.** Use at your own risk. Personal and educational use only.
````