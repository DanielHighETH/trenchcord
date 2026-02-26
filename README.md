# Trenchcord

A custom read-only Discord frontend that aggregates multiple guild channels and DMs into custom "rooms" with user highlighting and contract address detection.

## Features

- **Custom Rooms** - Group any combination of guild channels and DMs into a single view
- **User Highlighting** - Track specific users and get visual highlights + toast alerts when they message
- **Contract Detection** - Automatically detects Solana and EVM contract addresses in messages
- **Discord-like UI** - Familiar dark theme styled after Discord

## Architecture

- **Backend**: Node.js + TypeScript + Express + WebSocket (raw Discord Gateway connection)
- **Frontend**: Vite + React + TypeScript + Tailwind CSS + Zustand

## Project Structure (npm workspaces monorepo)

```
trenchcord/
├── package.json          # Root — npm workspaces config + top-level scripts
├── backend/              # Node.js + Express + Discord Gateway
│   └── package.json
├── frontend/             # Vite + React + Tailwind
│   └── package.json
└── README.md
```

## Setup

### 1. Install everything from the root

```bash
npm install
```

This installs dependencies for both `backend` and `frontend` via npm workspaces.

### 2. Run both at once

```bash
npm run dev
```

Or run them individually:

```bash
npm run dev:backend
npm run dev:frontend
```

Open http://localhost:5173

### Other scripts

```bash
npm run build          # Build both backend and frontend
npm run typecheck      # Type-check both workspaces
npm run start          # Start the built backend (production)
```

## Usage

1. **Enter your Discord token** - On first launch you'll be prompted to paste your token. It's stored locally in `backend/data/config.json` and never leaves your machine
2. **Create a Room** - Click the + button in the sidebar or "Create one" link
3. **Add Channels** - In the room config modal, browse your guilds and DMs, click to toggle channels
4. **Highlight Users** - Go to the "Highlighted Users" tab and add Discord user IDs
5. **Global Settings** - Configure global highlighted users and contract detection in the "Global Settings" tab
6. **Monitor** - Messages from your selected channels will appear in real-time in your rooms

## Security Warning

Using a user token (self-bot) violates Discord's Terms of Service. This is intended for personal/local use only. Never share your token or deploy this publicly.
