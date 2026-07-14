# Cue

**Your AI meeting copilot.** A translucent, always-on-top overlay that:

- floats over **any** app (not a browser tab),
- toggles with a **global hotkey**,
- is **invisible to screen-share and recording** (it won't appear when you share your screen),
- listens to your meeting and tells you **what to say next** (`⌘J`),
- answers questions about **what's on your screen** in real time (Claude vision, streamed),
- records your screen + system audio, transcribes **on-device**, and generates AI meeting briefs.

Local-first: recordings and transcripts stay on your machine. Only the screenshot/text you
explicitly ask about is sent to Claude.

## Download

**[⬇ Download the latest release for macOS & Windows](https://github.com/Akshayan03/Cue/releases/latest)**

- **macOS:** download the `.zip` for your chip (`arm64` = Apple Silicon, plain = Intel), unzip,
  and drag **Cue.app** to Applications. The build isn't notarized yet, so macOS will claim the
  app is **"damaged"** — it isn't; clear the quarantine flag and it opens normally:

  ```bash
  xattr -cr /Applications/Cue.app
  ```
- **Windows:** run `Cue-Setup-<version>.exe`. SmartScreen may warn (unsigned) — choose
  *More info → Run anyway*.

### Connecting to Claude — two options

Cue reaches Claude one of two ways; pick either in **Settings** (the gear in the app):

1. **Claude Code CLI** — if you already have [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
   installed and signed in (`claude` once to log in), Cue uses it. No API key, no separate cost
   beyond your Claude subscription.
2. **Your own Anthropic API key** — paste a key from
   [console.anthropic.com](https://console.anthropic.com/settings/keys). It's stored **encrypted
   on your device** via the OS keychain and is sent only to Anthropic, never to any Cue server.

**Nothing is bundled** — there's no shared/built-in API key. On first launch, Cue detects whether
the CLI is present and walks you through whichever option you choose.

> ⚖️ **Before you record anyone, read [`TERMS.md`](./TERMS.md) and [`PRIVACY.md`](./PRIVACY.md).**
> Recording meetings can be subject to all-party-consent (wiretapping) laws. You are responsible
> for obtaining any consent required where you are. Cue is provided "as is" with no warranty.

## Hotkeys

| Shortcut | Action |
|---|---|
| `⌘ \` | Show / hide the overlay |
| `⌘ J` | **What do I say?** — instant live suggestion during a meeting |
| `⌘ ↵` | Show overlay and focus the "ask about my screen" box |
| `⌘ ⇧ \` | Toggle click-through (interact with the app underneath) |

## Architecture

- **`electron/`** — Native shell (main + preload). Creates the transparent always-on-top,
  content-protected overlay window, registers global hotkeys, captures the screen via
  `desktopCapturer`, and talks to Claude via the provider you pick in Settings — the
  **Claude Code CLI** (your existing login) or **your own Anthropic API key** (stored
  encrypted via the OS keychain). No separate server.
- **`client/`** — React UI rendered inside the overlay: the screen assistant, the recorder
  (`getDisplayMedia` + `MediaRecorder`, with system-audio loopback granted by the main process),
  the library, playback, and export.
- **`server/`** — *Optional.* Only used if you run the UI as a plain website in a browser
  instead of the desktop app.

## Running the desktop app

```bash
# Prereq: Claude Code installed and logged in once (`claude` then sign in).
# No API key, no .env required.

npm install                   # root (Electron)
yarn --cwd client install     # the React UI (client is a yarn project)

# Launch — starts the React dev server and the Electron overlay together
npm run dev
```

Press `⌘\` to summon the overlay over whatever you're doing.

## Packaging & releasing (downloadable app)

> **Requirement for end users:** Cue needs one of two things to reach Claude — either the
> **Claude Code CLI** signed in with the user's own account, **or** the user's own
> **Anthropic API key** (entered in Settings). There is no bundled API key, so each user
> brings their own access. The app guides them through this on first launch.

Build installers locally:

```bash
npm install
yarn --cwd client install
npm run dist        # current platform → release/
npm run dist:mac    # macOS .zip (arm64 + x64)
npm run dist:win    # Windows .exe (NSIS)
```

Output lands in `release/`. App icon, entitlements, and per-OS metadata live in `build/`.

### Code signing & notarization (do this before public distribution)

Unsigned builds work locally, but macOS Gatekeeper shows *"Cue is damaged / from an
unidentified developer"* and Windows SmartScreen warns. To ship trusted downloads:

- **macOS:** an Apple Developer ID certificate ($99/yr). Set `CSC_LINK`,
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`
  in your environment (or as GitHub secrets) and electron-builder signs + notarizes
  automatically. The hardened-runtime entitlements in `build/entitlements.mac.plist`
  are already configured for Electron + microphone capture.
- **Windows:** a code-signing certificate (`CSC_LINK` / `CSC_KEY_PASSWORD`).

### Automated releases + auto-update

`.github/workflows/release.yml` builds macOS and Windows artifacts and publishes them
to a GitHub Release whenever you push a version tag:

```bash
npm version patch        # bumps version, creates the tag
git push --follow-tags
```

The app checks that GitHub Release for updates on launch (via `electron-updater`) and
notifies the user when a new version is available. Link your download page at the
published `.zip` / `.exe` assets.

> **Transcription** runs **fully on-device** with Whisper (via `transformers.js`) — no API key,
> no audio ever leaves your machine. The first recording downloads a ~40 MB model from a CDN and
> caches it; after that it's instant and offline. This works identically in the desktop app and
> the browser. The screen-aware **assistant** uses Claude vision and works today.

## How to make it even better (roadmap)

These are the natural next steps, roughly in order of value:

1. **Feed the live transcript into the assistant.** Transcription already runs on-device. Next,
   stream those segments into the screen assistant so it can answer *"what did they just ask me?"*
   in real time during a call. For higher accuracy on long meetings, swap the `whisper-tiny` model
   for `whisper-base`/`small` (one string in `useTranscriber.ts`), or move STT to WebGPU.
2. **Calendar integration.** Pull meeting titles/attendees from Google Calendar so briefs
   are pre-titled and action items can be attributed to real people.
3. **Auto-send the brief.** After a meeting, email the brief or post it to Slack/Notion.
4. **Cloud sync + accounts.** Right now everything is per-browser. Add auth + a database
   (and object storage for recordings) to access meetings across devices.
5. **Chaptering & search across meetings.** Use Claude to chapter long recordings and
   enable semantic search over all transcripts.
6. **Live brief.** Stream the transcript to Claude during the meeting for real-time
   suggested questions and a running action-item list.
