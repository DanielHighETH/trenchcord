# Changelog

All notable changes to Trenchcord are documented here.

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
