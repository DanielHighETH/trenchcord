# Changelog

All notable changes to Trenchcord are documented here.

## 2026-07-14

### Added
- **Pop-out chat windows** — detach any room, DM, or your Mentions feed into its own native window that keeps streaming live, so you can watch a caller channel on a second monitor while you trade. Click the pop-out icon in a chat header; the chat re-docks automatically when you close the window (desktop app)
- **Automatic EVM chain detection** — when a contract is posted as a bare `0x…` address with no chain mentioned, Trenchcord now resolves its real chain from on-chain liquidity, so the trade link opens on the correct network instead of a default
- **Proxy support** — if Discord won't load behind a VPN, route the gateway and history connection through an HTTP/HTTPS proxy under Settings > General > Connection. Leave it blank to connect directly (desktop app)

### Fixed
- **Desktop app launches again** — the 1.1.0 desktop build could crash on startup and show a blank/black window; it now opens correctly. Update to 1.1.1 if you were affected (desktop app)
- **Connection blocks no longer look like a bad token** — a VPN or datacenter IP block (Discord/Cloudflare rejecting the connection) now shows a distinct `Connection blocked` banner instead of falsely flagging your token as invalid
- **Richer Telegram text** — bold, code blocks, and inline links now render correctly; a formatting-offset bug that could mangle or misplace styled text is fixed, and noise-only links (bare numbers) are dropped to plain text
- **Announcements stay dismissed** — dismissed in-app announcements now persist across restarts instead of reappearing every launch (desktop app)
- **Setup no longer hangs on a spinner** — if your servers can't load during onboarding (for example, a blocked connection), the welcome screen now shows the error with a shortcut to connection settings instead of spinning forever

## 2026-07-13

### Added
- **Split-screen layout** — watch up to 4 rooms, DMs, or your Mentions feed side by side. Add panes with the `+` button in a chat header, then use the layout button in the sidebar to drag, resize, lock, and rearrange them in a single row or two rows. Your layout is saved and restored across restarts
- **Mentions room** — a dedicated room that gathers every message where you, one of your roles, `@here`, or `@everyone` was mentioned across the channels you already monitor. Toggle each mention type under Settings > Mentions
- **Room hotkeys** — assign a single key to any room and press it anywhere (outside a text field) to jump straight to it
- **See who reacted** — click a reaction on a Discord message to see the list of users who reacted with that emoji
- **Unread badges** — the sidebar now shows a blue unread counter on rooms, DMs, and Mentions, clearing the moment you open them
- **Desktop app** — Trenchcord is now available as a native desktop app for Windows and macOS, with auto-updates, keeping your token and data fully on your machine
- **In-app announcements** — important updates and notices can now surface in a dismissible in-app modal
- **Import on setup** — the welcome screen now lets you import an existing `config.json` (token, rooms, and settings) to get going in one step, or continue without a token to explore the app first
- **Local backups include credentials** — in self-hosted mode, settings backups now include your Discord tokens and Telegram credentials so a restore fully reconnects you (hosted mode still never exports credentials — keep local backups somewhere safe)
- **Invalid token indicator** — when Discord rejects a token, it's flagged with a red `Invalid` badge in Settings > Tokens, and errors now name the specific token
- **Community links** — quick Join Discord and X / Twitter buttons in the sidebar
- **Open source under AGPL-3.0** — this release is now licensed under the GNU AGPL-3.0

### Fixed
- **Stable scroll while reading back** — scrolling up now pauses the feed and holds your position instead of drifting as new messages arrive. An `X new messages` pill (with the time of the first one) and a `Jump To Present` banner let you catch up whenever you're ready
- **Smarter token error handling** — connection problems (Discord unreachable, too many connections) are no longer mistaken for an invalid token; only Discord's explicit rejection flags a token as invalid

## 2026-07-02

### Added
- **Deleted message indicator** — messages removed on Discord now stay in the feed with a red `deleted` badge and dimmed styling, so you never miss something that was posted and then pulled
- **Edited message history** — edited messages now show an `(edited)` label; click it to reveal the original text from before the edit
- **Telegram link buttons** — inline keyboard URL buttons (dashboards, charts, etc.) now render as clickable buttons beneath the message
- **Telegram in-text links** — hyperlinks embedded inside Telegram message text now render as clickable links instead of plain text
- **Telegram chat colors** — color-code messages per Telegram chat, just like Discord servers and DMs
- **Telegram basic group support** — legacy Telegram groups now resolve an invite link so their messages link back to the chat and open in the Telegram app

## 2026-06-01

### Fixed
- **Auto-scroll reliability** — chat now stays pinned to the newest message in the cases that previously left it stranded a row or two above the bottom: tall multi-row messages and embeds, several messages arriving at the same time, and reactions added to recent messages. Auto-scroll now chases the live content height every frame until the layout settles (including late-loading images) instead of relying on a fixed-delay smooth scroll, and it gracefully steps aside the moment you scroll up

## 2026-05-04

### Added
- **Display Full Contract Address** — new setting under Settings > Contracts to show contract addresses in their full form instead of the shortened `0x1234...abcd` pill, both in chat and the Contracts dashboard

### Fixed
- **Memory leak on long sessions** — chat tabs running for hours no longer balloon into multiple GB of RAM. All message images (avatars, attachments, embeds, custom emojis, Telegram stickers) now lazy-load, and only the most recent ~200 messages live in the DOM at rest — scroll up to load more in 200-message chunks
- **Re-render performance** — `Message` rows are memoized, so a new incoming WebSocket event no longer re-renders every visible message

## 2026-03-12

### Fixed
- **Auto-scroll reliability** — chat no longer stops auto-scrolling when a reaction or large image appears, even if the user hasn't scrolled up

## 2026-03-06

### Added
- **Telegram integration** — monitor Telegram groups, channels, supergroups, and DMs alongside Discord
- **Telegram setup flow** — connect your Telegram account with phone number, verification code, and optional 2FA
- **Encrypted Telegram credentials** — API ID, API hash, and session strings encrypted at rest with AES-256-GCM (hosted mode)
- **Telegram message rendering** — replies, forwards, stickers, polls, and media displayed natively in the feed
- **Mixed rooms** — combine Discord and Telegram channels in the same room
- **Mobile responsivity** — improved mobile-friendly layouts and touch interactions across the app

### Fixed
- Backend environment configuration

## 2026-03-05

### Added
- **Hosted web app mode** — Trenchcord can now run as a multi-user web app, no installation required
- **Supabase integration** — PostgreSQL database with Row Level Security for per-user data isolation
- **User authentication** — sign up and log in with Email/Password or Discord OAuth
- **Encrypted token storage** — Discord tokens encrypted at rest with AES-256-GCM
- **Per-user Discord gateways** — each user gets their own gateway connection with automatic idle management
- **Profile page** — view account info, login method, and sign out (hosted mode)
- **Sound file storage** — user sounds stored in Supabase Storage for hosted deployments
- **Security hardening** — helmet headers, API rate limiting, CORS restrictions, JWT-authenticated WebSockets, error message sanitization
- **In-memory caching** — server-side cache for config, rooms, and tokens to minimize database round-trips
- **Role colors** — usernames now display their highest Discord role color
- **Compact mode** — denser message layout for power users
- **Custom DM colors** — personalize DM channel name colors
- **DM profile pictures** — avatars now show in DM conversations
- **Background opacity control** — adjust chat background transparency
- **Sound alerts** — configurable notification sounds per channel
- **Chat UI enhancements** — polished message rendering and layout

## 2026-03-04

### Added
- **Sending messages** — reply and send messages directly from Trenchcord
- **Self-host pill** — visual indicator for self-hosted instances

## 2026-03-03

### Added
- **Pushover notifications** — push alerts via Pushover integration
- **Sound settings** — granular control over notification sounds
- **Responsive design** — improved layout for smaller screens
- **Favicon and logo** — custom branding assets
- **Landing page anchors** — smooth scroll navigation on the landing page

### Fixed
- Build issues resolved
- Mobile gate for demo mode

## 2026-03-01

### Added
- **Quick menu user highlighting** — highlight users directly from the right-click menu

## 2026-02-28

### Added
- **Onboarding wizard** — guided setup flow for new users

### Fixed
- Highlight mode behavior
- Highlighting users on click

## 2026-02-27

### Added
- **Search bar** — search through messages
- **Demo mode** — try Trenchcord without connecting a token
- **Live demo on landing page** — embedded demo for visitors
- **CA feed & embeds** — contract address detection and rich embed rendering
- **Global settings** — centralized configuration panel
- **Custom confirm modals** — styled confirmation dialogs
- **Keyword & sound settings** — keyword-based alerts with sound configuration
- **Landing page rework** — redesigned landing page

### Fixed
- Desktop notifications reliability
- Multiple embed messages rendering in a row
- Autocomplete behavior
- Unknown channel handling
- Netlify demo build

## 2026-02-26

### Added
- **Initial release** — core Discord gateway, multi-account support, real-time message streaming
- **Landing page** — project homepage with installation guide
- **Config via JSON** — switched from `.env` to `config.json` for easier setup
- **Open-source section** — added to landing page

### Fixed
- Setup guide first step flow
