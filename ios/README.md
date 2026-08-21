# Trenchcord for iOS

> ## Status: active again (2026-08-02 — Apple Developer Program enrollment done)
>
> The code here is **complete and verified as far as it can be without an
> iPhone**. It is not shipped and not on anyone's phone. Nothing in the repo
> depends on it; the desktop app is unaffected.
>
> **Why it stopped:** TestFlight displays a **DEVELOPER** line to every tester,
> and on an Individual membership that is the account holder's legal name —
> confirmed by looking at it, not inferred. Apple does not permit a DBA or alias
> for individuals, so the only fix is converting to an Organization membership,
> which needs a registered legal entity and a D-U-N-S number. That was not worth
> doing for this, so the app is on the shelf until it is.
>
> **What was already built and checked:**
> - Backend runs unmodified under an embedded Node runtime — bundled to a single
>   CJS file, boots, serves the frontend, gate enforced, all endpoints answered.
> - The WebAssembly problem is solved and guarded (see the next section).
> - iOS platform flags, loopback hardening and the foreground-resume endpoint.
> - Frontend: billing links suppressed, trading enabled (since 2026-08-04), single-pane, import-first
>   onboarding, sample-data preview for App Review.
> - Swift shell, Xcode project spec, and an on-device capability probe.
>
> **Compiled and simulator-tested 2026-08-02** (Xcode 26.0.1, unsigned simulator
> build): the app builds, the embedded Node runtime boots the backend, `/health`
> answers and the frontend is served on loopback. One fix was needed — the
> shipped `NodeMobile.xcframework` exports a single C `node_start()` entry point,
> not the C++ `node::Start()` the bridge was originally written against.
> **Nothing has run on a physical device**, and the Simulator does not reproduce
> JIT-less V8, so treat every claim about on-device behaviour as unverified.
> Start by running `ios/probe.cjs` on a real iPhone (see *M0* below).
>
> **If picking this back up, re-check the distribution decision first.** Three
> routes were considered and only the TestFlight one is blocked:
> 1. **Thin client** — the phone's browser connects to the user's desktop backend
>    over LAN or Tailscale. Needs no Apple account at all, and the desktop already
>    prints a tokenised URL for it at startup. Monitoring keeps running 24/7
>    because the PC does the work, which the embedded-backend app cannot do (iOS
>    suspends it when backgrounded). Functionally the strongest option; the cost
>    is that the user's PC must be on and reachable.
> 2. **Sideloading (AltStore/SideStore)** — users sign the `.ipa` with their own
>    free Apple ID, so no developer identity is involved. Free Apple IDs cap at 3
>    apps expiring every 7 days, and setup is fiddly.
> 3. **Ad-hoc** — rejected: the team name sits in `embedded.mobileprovision`
>    inside the IPA and anyone can unzip it, which defeats the point.

The iPhone app runs the **same backend as the desktop app, on the phone itself**.
A small Swift shell embeds a real Node.js runtime ([nodejs-mobile]), starts the
esbuild-bundled backend on a background thread, and points a `WKWebView` at
`http://127.0.0.1:47853` — which the backend serves the React frontend from. No
server of ours is ever in the message path; Discord and Telegram are connected to
directly from the device.

Distribution is **TestFlight only** — this app is not intended for the App Store.

## The one thing to know before changing anything

nodejs-mobile runs V8 **without JIT**, which means **WebAssembly does not exist**
on the device. Node 18's global `fetch` is undici, and undici parses HTTP with a
WASM module, so `fetch()` dies with `WebAssembly is not defined`.

Everything outbound therefore goes through `backend/src/utils/http.ts`
(`appFetch`), which uses global fetch where it exists and `node:https` where it
doesn't. **Do not reintroduce a bare `fetch()` call in the backend.**
`ios/build-backend.mjs` greps the built bundle for `WebAssembly` and fails the
build if any dependency brings it back.

## Prerequisites

- Xcode 15+ and an Apple Developer Program membership ($99/yr) for TestFlight.
- [XcodeGen]: `brew install xcodegen` — the `.xcodeproj` is generated, not committed.
- **NodeMobile.xcframework**, downloaded from the [nodejs-mobile releases] page
  (v18.20.4, matching the `target: node18` in the build script) and unzipped to
  `ios/App/NodeMobile.xcframework`. It is ~90 MB of prebuilt binary, so it is not
  in the repo.

## Build

```bash
# From the repo root — compiles the backend, builds the frontend, bundles both
# into ios/App/Trenchcord/Resources/
npm run build:ios-payload

cd ios/App
xcodegen generate      # produces Trenchcord.xcodeproj
open Trenchcord.xcodeproj
```

Set your Team ID in Xcode (Signing & Capabilities) or in `project.yml`, then run.
Re-run `npm run build:ios-payload` after any backend or frontend change — the
Xcode build fails fast if the payload is missing, but it cannot tell that it is
merely *stale*.

The Simulator is fine for UI work. Anything touching sockets, timing or memory
must be checked on a **physical device**: the Simulator does not reproduce the
JIT-less V8 the real runtime uses.

**Simulator port caveat:** the Simulator shares the Mac's loopback interface,
so if the desktop Trenchcord app is running it already owns `127.0.0.1:47853`
and the simulated app's backend would die with EADDRINUSE — worse, health
checks against 47853 answer from the *desktop* backend and look green.
Simulator builds therefore listen on **47854** (`#if targetEnvironment(simulator)`
in `NodeManager.swift`); physical devices keep 47853.

## M0: capability probe

Before trusting the whole stack on a new nodejs-mobile version, run
`ios/probe.cjs` instead of the backend — point `NodeManager.backendScript` at it
temporarily — and read the results in the Xcode console. It checks raw TCP to a
Telegram DC, `node:https`, WSS to Discord, Ed25519 verification, filesystem
access, and MTProto-shaped bignum throughput, then prints **GO** or **NO-GO**.

## How the pieces fit

| Piece | Role |
|---|---|
| `TrenchcordApp.swift` | SwiftUI entry point; forwards foreground events |
| `NodeManager.swift` | Environment, starts Node, polls `/health`, token handoff, resume nudge |
| `WebView.swift` | `WKWebView`; injects the platform flag, sends external links to Safari |
| `NodeRunner.h/.mm` | Bridge to `node_start()`, the C entry point NodeMobile.framework exports |
| `build-backend.mjs` | esbuild → single CJS file, with the WebAssembly guard |
| `sync-payload.mjs` | Copies `frontend/dist` into the app bundle |

The shell passes the same environment the Electron app does, plus three iOS-only
variables (see `backend/src/platform.ts` and `backend/src/security/localAccess.ts`):

- `TRENCHCORD_PLATFORM=ios` — blanks `dashboardUrl`, drops `approve_url`, and
  labels the device as iOS in the account dashboard.
- `TRENCHCORD_DEVICE_NAME` — the real device name, since `os.hostname()` returns
  something meaningless under nodejs-mobile.
- `TRENCHCORD_TRUST_LOOPBACK=0` — on iOS *every* app shares `127.0.0.1`, so
  arriving from loopback proves nothing about who is asking. The shell reads
  `local-token` from the data directory and authorises the web view with
  `/?token=…`, which the backend swaps for an HttpOnly cookie and redirects away.

## Getting your data onto the phone

Nothing syncs. On the desktop app: **Settings → Backup & Restore → Export**, then
AirDrop the JSON to the phone, save it to Files, and pick it from the app's first
screen. A local-mode export deliberately includes Discord tokens and Telegram
sessions. The Slotshark API token and the cloud device token are always stripped.

Discord user tokens work from multiple devices at once. **Telegram sessions do
not**: a session is one MTProto auth key, and Telegram revokes it with
`AUTH_KEY_DUPLICATED` when two devices use it concurrently — logging BOTH the
phone and the computer out. The iOS import flow therefore asks what to do when
a backup contains a Telegram session: log in fresh on the phone (recommended —
the imported API ID/hash carry over, so it's just phone number + code, and the
device appears as its own entry in Telegram's Active Sessions), or move the
session, for users who are abandoning the desktop install.

## What the iOS build deliberately does not have

- **Billing of any kind.** No pricing, no checkout, no link to
  `dashboard.trenchcord.app`. A subscription is still required; the phone shows a
  pairing code and the user approves it from a computer. This is App Store
  guideline 3.1.1 — Beta App Review applies it even though we never ship to the
  store.
- ~~**Trading.**~~ Trading and sniping are **enabled** on iOS as of 2026-08-04
  (previously hidden). The Slotshark API token is still stripped from settings
  exports, so it must be entered on the phone under Settings → Trading. Be
  aware this is the feature most likely to draw App Review scrutiny (one-tap
  spending of real SOL through a third-party API); sniping additionally only
  fires while the app is foregrounded, since iOS suspends the process otherwise
  — see *Background behaviour* below.
- **Split panes and popouts.** One chat at a time; rooms switch from the sidebar.
- **Background monitoring.** See below — this one is a platform limit, not a choice.
- **HTTP proxy for Discord.** undici is unavailable, and exports strip the setting.

## Background behaviour — set expectations with testers

iOS suspends the whole process within seconds of the app leaving the screen, so
**Trenchcord only monitors while it is open and in the foreground.** There are no
alerts while the phone is locked or the app is backgrounded. (Pushover
notifications still arrive from a desktop install, if one is running.)

On return to the foreground the shell calls `POST /api/system/resume`, which
forces an immediate Telegram health probe and a Discord heartbeat check with a
short ACK deadline, so dead sockets are detected in seconds rather than up to a
minute. Discord reconnects with RESUME, so nothing in the gap is lost.

Do **not** add a background-audio or location keepalive to work around this. It
is a well-known review rejection, and for a beta it is not worth the risk.

## TestFlight

> **Blocker for public release: the account must be an Organization.**
>
> TestFlight shows a **DEVELOPER** line to testers, and on an Individual
> membership that is the holder's **legal name** — verified directly in the
> TestFlight app, not inferred. Apple does not accept a DBA, trade name or alias
> for individuals, so there is no way to change what it says without changing the
> membership type.
>
> Converting is supported and **non-destructive**: Account Holder → Membership
> Details → *Convert to Organization*. The Apple ID, Team ID, certificates and
> app records all survive; only the seller name changes. It requires a real legal
> entity, its D-U-N-S number, and that you are a founder/co-founder; Apple may ask
> for business documents.
>
> The D-U-N-S number is a free business identifier from Dun & Bradstreet that
> Apple uses to confirm the entity exists — request or look one up with
> [Apple's own tool](https://developer.apple.com/enroll/duns-lookup/), never by
> paying D&B. Allow up to 5 business days for D&B to issue it and 2 more for Apple
> to receive the record. Delays almost always come from the entity name or address
> not matching the incorporation paperwork exactly.
>
> Register the entity to a business or registered-agent address rather than a home
> address: D&B company records are publicly searchable, so a home address here
> would trade one disclosure for a worse one.
>
> **This blocks only step 5 below.** Steps 1–4 — including all on-device QA
> through internal TestFlight — work fine on the existing individual account,
> because internal testers are your own team members who already know who you
> are. Start the entity and D-U-N-S paperwork now and keep building against
> internal builds; convert before opening the public link.

1. **Enrol** in the Apple Developer Program — see the blocker above on membership
   type, which is the long pole for public distribution.
2. **App Store Connect**: create the app record with bundle ID `app.trenchcord.ios`.
3. **Archive** in Xcode (Product → Archive) and upload from the Organizer.
   `Info.plist` already declares `NSAllowsLocalNetworking` (loopback HTTP) and
   `ITSAppUsesNonExemptEncryption=false` (only standard TLS/MTProto crypto, which
   is exempt), so the upload asks no compliance questions.
4. **Internal testing** (up to 100 testers on your team) is instant, needs no
   review, and is not publicly visible — use it for device QA.
5. **External testing / public link** needs **Beta App Review** for the first
   build of each version string, typically 24–48h. Up to 10,000 testers.
   Do not open this until the account is an Organization.
6. **Builds expire 90 days after upload.** Bump `CURRENT_PROJECT_VERSION` and
   re-upload roughly every 80 days even when nothing changed.

### If you decide against forming an entity

Ad-hoc distribution is the fallback: no App Store, no TestFlight, no public
listing carrying a seller name. It is capped at 100 devices per membership year,
which roughly matches the current user base, but you collect each tester's UDID
by hand, re-sign annually, and the install flow is markedly worse than a
TestFlight link. The cap counts registrations rather than active users, so device
churn eats into it.

### Notes for the review team

Suggested text — the important part is the demo path, since a reviewer has no
Discord account, no Telegram account and no subscription:

> Trenchcord is a companion app for an existing desktop product. It aggregates
> the user's own Discord and Telegram messages, which are fetched directly from
> those services to the device; no account data passes through our servers.
>
> The app contains no purchases, prices, or payment links. A subscription is
> required and is managed entirely outside the app.
>
> To evaluate without an account, tap **"Preview with sample data"** on the first
> screen for a full walkthrough with simulated messages. Normal use requires the
> user's own credentials, imported from their desktop installation.

That button appears on the gate only in the iOS build and sets a `localStorage`
flag that loads the same sample dataset as the web demo
(`frontend/src/demo/demoStore.ts`).

## Known risks

- **nodejs-mobile is not actively released.** v18.20.4 (Oct 2024) is current, and
  Node 18 is past upstream EOL, so the runtime gets no security patches. The
  server is loopback-only behind a token and accepts nothing inbound, which is
  what makes this tolerable for a beta. Watch the repo for a Node 20/22 build.
- **JIT-less performance** is unmeasured on device beyond the probe. The first
  Telegram connection does a pure-JS DH handshake and may take a few seconds.
- **Discord and Telegram user-token automation** violates *their* terms of
  service. That exposure already exists on desktop; the App Review surface is new.
- **Publishing under an Individual membership discloses the holder's legal name**
  to every tester. See the blocker at the top of the TestFlight section — this is
  a release gate, not a footnote.

[nodejs-mobile]: https://github.com/nodejs-mobile/nodejs-mobile
[nodejs-mobile releases]: https://github.com/nodejs-mobile/nodejs-mobile/releases
[XcodeGen]: https://github.com/yonaskolb/XcodeGen
