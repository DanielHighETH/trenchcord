# Trenchcord

**Your Discord, Supercharged for Trenching**

Aggregate channels, track key users, auto-detect contracts, and trade in one click — all from a single dashboard. Trenchcord is a custom read-only Discord frontend that combines multiple guild channels and DMs into custom "rooms" with user highlighting, keyword alerts, and contract address detection.

## Features

- **Custom Rooms** — Aggregate channels from multiple servers into unified rooms
- **User Highlighting** — Track key users across all channels with visual alerts
- **Contract Detection** — Auto-detect Solana and EVM contract addresses in messages
- **One-Click Trading** — Click contracts to open Axiom, GMGN, Bloom, Padre and more
- **Push Notifications** — Pushover alerts when highlighted users post contracts
- **Focus Mode** — Filter messages to a specific channel within a room
- **Real-time Streaming** — Live message updates via Discord Gateway
- **DM Support** — Monitor DMs alongside guild channels
- **Sound Alerts** — Audio notifications for highlighted messages
- **Guild Colors** — Color-code messages by guild for quick visual scanning
- **Auto-Open Contracts** — Automatically open links when highlighted users post contracts
- **Custom Link Templates** — Configure which trading platform links generate for contracts

## How It Works

1. **Connect** — Add your Discord token to authenticate
2. **Configure** — Set up rooms and aggregate channels
3. **Highlight** — Mark users you want to track closely
4. **Monitor** — Watch everything in a unified dashboard

## Requirements

- **Node.js** v18 or higher
- **npm** (comes with Node.js)
- **Git** (any recent version)

## Installation

**Option A — Download ZIP:**
Download the latest release from GitHub and extract it.

**Option B — Clone with Git:**

```bash
git clone https://github.com/DanielHighETH/trenchcord.git
```

Then install dependencies:

```bash
cd trenchcord
npm install
```

This installs dependencies for all workspaces (`backend`, `frontend`, `landing`) via npm workspaces.

## Getting Your Discord Token

> **Warning:** Never share your Discord token with anyone. Using self-bots is against Discord's Terms of Service — use at your own risk and for personal use only.

1. Open Discord in your browser at [discord.com/app](https://discord.com/app)
2. Open Developer Tools (`F12` or `Ctrl+Shift+I`)
3. Go to the **Network** tab
4. Refresh the page (`Ctrl+R`)
5. Search for `@me` in the network filter
6. Click the request, go to **Headers**
7. Find `authorization` in Request Headers — that's your token

Once you have your token, paste it into the setup screen on first launch.

## Running

### Production

Build and start Trenchcord with a single command:

```bash
npm start
```

This builds the frontend and backend, then starts the server. Open http://localhost:3001 in your browser.

### Development

Run everything with hot-reload:

```bash
npm run dev
```

Or run each workspace individually:

```bash
npm run dev:backend    # Backend API on http://localhost:3001
npm run dev:frontend   # Frontend on http://localhost:5173
npm run dev:landing    # Landing page on http://localhost:5174
```

### Other Scripts

```bash
npm run build          # Build both backend and frontend
npm run build:backend  # Build only backend
npm run build:frontend # Build only frontend
npm run build:landing  # Build only landing
npm run typecheck      # Type-check both backend and frontend
```

## Getting Started

1. Go to **Settings > Guilds** and enable the Discord servers you want to monitor
2. Click the **+** button next to "Rooms" in the sidebar to create a room
3. Add channels from your enabled guilds into the room — a single room can aggregate channels from multiple servers
4. Messages from all added channels will stream into the room in real time

## Usage Guide

### Message Interactions

- **Channel Badge** — Click the server / #channel badge on any message to jump to the original message in Discord. Configure whether it opens in the Discord app or browser in Settings > General
- **Badge Click Action** — In Settings > General, choose what badge clicks do: open in Discord, open in your trading platform (if a contract is detected), or both
- **Image Lightbox** — Click any image in a message to view it fullscreen. Press ESC to close
- **Compact Messages** — Messages from the same author within 5 minutes are grouped together. Hover over a compact message to see its timestamp
- **Right-Click Users** — Right-click a username to access the context menu where you can hide that user from the channel

### Focus Mode

- **Enter:** Click the eye icon on any message to focus on that message's channel
- **Active:** A "Focus Mode" badge appears in the channel header showing which channel you're filtering to. Only messages from that channel are displayed
- **Exit:** Click the X on the badge to return to the full room view

### Contract Detection

Trenchcord automatically detects Solana and EVM contract addresses in messages:

- **SOL** — Solana addresses appear as green pills
- **EVM** — EVM addresses (0x...) appear as yellow pills
- Click a contract to copy and/or open it in your configured trading platform (configurable in Settings > Contracts)
- **Contracts Dashboard** — Click "Contracts" in the sidebar to see a live feed of all detected contracts, searchable and filterable by chain
- **Auto-Open** — Enable "Auto-Open Highlighted Contracts" in Settings > Contracts to automatically open a new tab when a highlighted user posts a contract

### User Highlighting

Track specific Discord users so you never miss their messages:

- **Global:** Add user IDs in Settings > Highlighted Users. These users are highlighted in all rooms
- **Per-Room:** Edit a room (hover > gear icon) > Users tab to add room-specific highlights
- Highlighted messages appear with a blue border. Toast alerts pop up in the corner when they send a message

### Keyword Alerts

Get alerted when messages match your keyword patterns:

- **Global:** Settings > Keywords — matched in all rooms
- **Per-Room:** Room config > Keywords tab — only matched in that room
- Three match modes: **Contains** (substring), **Exact** (whole word), and **Regex** (advanced patterns)
- Matched messages appear with an orange border

### Room Configuration

- **Edit/Delete:** Hover over a room in the sidebar to reveal the gear (edit) and trash (delete) icons
- **Room Color:** Set a custom background color for the room in the config modal
- **Disable Embeds:** Toggle embeds off for specific channels in the Channels tab of room config
- **User Filter:** In the Filter tab, add user IDs to only show messages from those users in the room

### Hiding Users

- **Hide:** Right-click any username > "Hide user" to hide them from that specific channel
- **Manage:** Click the hidden users icon in the channel header to view and unhide users

### Sounds & Notifications

Three independent sound channels with individual volume controls:

- **Highlighted User** — Plays when a highlighted user sends a message
- **Contract Alert** — Plays when a contract address is detected
- **Keyword Match** — Plays when a keyword pattern matches

Upload custom sounds (MP3, WAV, OGG) or use built-in tones. Configure in Settings > Sounds.

- **Desktop Notifications** — Enable in Settings > General. Browser notifications appear when the tab is not focused and a highlighted user or keyword match is detected
- **Pushover** — Push notifications to your phone via Pushover when highlighted users post contracts. Configure in Settings > Sounds

### Guild Colors

In Settings > Guilds, assign a background color to each server. In rooms with multiple guilds, messages are color-coded so you can instantly tell which server a message came from.

### Direct Messages

DMs automatically appear in the sidebar under "Direct Messages" when you receive new messages. Click one to view the conversation.

### Multiple Accounts

Add multiple Discord tokens in Settings > Tokens to monitor channels across different accounts simultaneously. All guilds and channels from all tokens are available when creating rooms.

## Architecture

npm workspaces monorepo with three packages:

- **Backend** — Node.js + TypeScript + Express + WebSocket (raw Discord Gateway connection)
- **Frontend** — Vite + React + TypeScript + Tailwind CSS + Zustand
- **Landing** — Vite + React + TypeScript + Tailwind CSS + Framer Motion

```
trenchcord/
├── package.json          # Root — npm workspaces config + top-level scripts
├── backend/              # Node.js + Express + Discord Gateway
│   ├── package.json
│   ├── src/
│   └── data/
│       ├── config.default.json
│       └── config.json   # Auto-created on first run (gitignored)
├── frontend/             # Vite + React + Tailwind
│   ├── package.json
│   └── src/
├── landing/              # Landing page
│   ├── package.json
│   └── src/
└── README.md
```

## Configuration

All configuration is managed through the frontend UI and stored in `backend/data/config.json`. This file is auto-created from `backend/data/config.default.json` on first run. It stores your Discord tokens, rooms, highlighted users, contract detection settings, and more. The file is gitignored and never leaves your machine.

## Disclaimer

Trenchcord is an independent project and is not affiliated with Discord Inc. Using self-bots is against Discord's Terms of Service. This tool is for personal and educational use only. Use at your own risk. Never share your token or deploy this publicly.

## Open Source

Trenchcord is fully open source. Inspect the code, build on top of it, add your own features, and share with the community.

[View on GitHub](https://github.com/DanielHighETH/trenchcord)
