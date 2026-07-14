# Trenchcord — Discord Publishing Tutorial

Two messages, each under Discord's 2000-char limit. Copy each block (inside the fences) and post them in order.

---

## Message 1 of 2 — Install & Discord Token

````markdown
# How to Install Trenchcord + Get Your Discord & Telegram Tokens (1/2)

**Trenchcord** is a Discord frontend supercharged for trenching — aggregate channels from multiple servers (and Telegram), highlight users, auto-detect Solana + EVM contracts, and one-click trade on Axiom / GMGN / Bloom / Padre from one dashboard.

> Don't want to self-host? Just download the desktop app for **macOS** or **Windows** → <https://github.com/DanielHighETH/trenchcord/releases/latest> — install, paste your token, done. The rest of this guide is for running it from source.

## 0. Requirements

- **Node.js v18+** → <https://nodejs.org>
- **npm** (ships with Node.js)
- **Git** → <https://git-scm.com>

Verify in a terminal:
```bash
node -v && npm -v && git --version
```

## 1. Download & Install

**Option A — ZIP:** Go to <https://github.com/DanielHighETH/trenchcord> → green **Code** button → **Download ZIP** → extract.

**Option B — Git (recommended, so you can `git pull` updates):**
```bash
git clone https://github.com/DanielHighETH/trenchcord.git
```

Then install dependencies:
```bash
cd trenchcord
npm install
```

No `.env`, no config to edit — npm workspaces installs `backend`, `frontend`, and `landing` in one shot.

## 2. Get Your Discord Token

> ⚠️ **Never share your Discord token.** Anyone with it has full account access. Self-bots break Discord's ToS — personal use, at your own risk.

1. Open Discord **in your browser** at <https://discord.com/app> (must be web, not desktop app)
2. Open **DevTools** → `F12` (or `Cmd+Option+I` on Mac)
3. Go to the **Network** tab
4. Refresh the page (`Ctrl+R` / `Cmd+R`)
5. In the Network filter, type `@me`
6. Click any matching request → **Headers** panel
7. Under **Request Headers**, find `authorization` — the value is your token

Copy the whole value. You'll paste it into Trenchcord on first launch (or later under **Settings → Tokens**).

*👇 Part 2 below — Telegram setup + running the app.*
````

---

## Message 2 of 2 — Telegram, Running & First-Time Setup

````markdown
# Trenchcord Setup (2/2) — Telegram, Run & First Use

## 3. Get Your Telegram API Credentials (optional)

Only needed if you want to monitor Telegram chats alongside Discord.

> 🔒 Your API ID, API hash, and session are encrypted at rest with **AES-256-GCM**. Your phone number and 2FA password are **never stored or logged** — memory-only during the auth handshake.

1. Go to **<https://my.telegram.org>** and log in with your phone number
2. Click **API development tools**
3. Fill in the form:
   - **App title:** `Trenchcord`
   - **Short name:** `trenchcord`
   - **Platform:** leave as *Desktop*
4. After submitting you'll see:
   - `api_id` — a number
   - `api_hash` — a long hex string
5. In Trenchcord go to **Settings → Connect Telegram**, paste both, then enter your phone number
6. Telegram sends a **verification code** to your Telegram app — enter it
7. If you have **2FA** on Telegram, you'll also be prompted for your password

## 4. Run Trenchcord

From inside the `trenchcord` folder:
```bash
npm start
```

Then open **<http://localhost:3001>**. On first launch, paste the Discord token from Step 2.

For hot-reload dev mode: `npm run dev`

## 5. First-Time Setup Inside the App

1. **Settings → Guilds** — enable the Discord servers you want to monitor
2. Click **+** next to **Rooms** in the sidebar to create a custom room
3. Add channels from your enabled guilds (and Telegram chats) into the room
4. **Settings → Highlighted Users** — paste user IDs of callers/wallets to track
5. Messages stream live. Highlighted users get a blue border + toast. Contracts appear as green (SOL) / yellow (EVM) pills — click to open your trading platform.

## Security TL;DR

- **Self-hosted = no database.** Tokens live only in `backend/data/config.json` on your PC.
- **Hosted mode** encrypts tokens with AES-256-GCM, JWT-auth WebSockets, rate limiting, strict CORS.
- Fully open source — audit the encryption: <https://github.com/DanielHighETH/trenchcord/blob/main/backend/src/auth/encryption.ts>

## Links

- Site → <https://trenchcord.app>
- Download → <https://github.com/DanielHighETH/trenchcord/releases/latest>
- Demo → <https://demo.trenchcord.app>
- GitHub → <https://github.com/DanielHighETH/trenchcord>
- X → <https://x.com/trenchcordapp>

> ⚠️ **Heads up:** Trenchcord is independent and **not affiliated with Discord Inc.** Using any self-bot — including this one — breaks Discord's ToS and **can get your account banned.** Use at your own risk. Personal and educational use only.
````
