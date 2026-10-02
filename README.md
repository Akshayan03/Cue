# Cue

**Your AI meeting copilot.** A translucent, always-on-top overlay that:

- floats over **any** app (not a browser tab),
- toggles with a **global hotkey**,
- uses **OS-level capture protection** (compatibility varies by sharing app and operating system),
- listens to your meeting and tells you **what to say next** (`⌘J`),
- answers questions about your **screen, live audio, and conversation context** in one command bar,
- surfaces **dynamic insights** and automatically answers direct questions,
- records your screen + system audio, transcribes **on-device**, and generates AI meeting briefs.

Local-first: recordings and transcripts are stored on your machine. Relevant text and optional
screenshots are sent to Claude for AI features, including automatic live answers when enabled.

## Interview preparation (development build)

Every interview starts with a preparation screen:

1. Paste or upload your résumé and the job description (PDF, DOCX, TXT, or Markdown; up to
   10 MB / 30,000 characters per document). Scanned PDFs need their text pasted manually.
2. Add facts, dictate notes with **Speak**, and chat with Cue to rehearse or build a briefing.
3. Choose **Interviewer / call audio** for remote calls, or **Microphone** for in-person
   conversations. Call mode does not mix in your microphone.
4. Start the session. Cue carries the documents and prep conversation into live answers.
   Auto-answer detects questions and prompts such as “tell me about…” after an audio pause.
   You can also type a question or use `⌘J`. Turn on screen context (◫) for coding rounds:
   every answer then includes a screenshot of the display under your cursor, so when the
   interviewer says "solve this problem", Cue reads it and replies with the approach, full code,
   and complexity. It needs Screen Recording permission and is off by default.

Interview preparation and live answers use **`claude-opus-5-5` through your Claude Code
subscription login**, without an API-key fallback. Cue installs Claude Code (2.1.280 or newer)
and signs you in from the app; see [Connecting to Claude](#connecting-to-claude). An
account-status check does not prove that an OAuth token is still valid; a successful response
verifies access. If your login expires, choose **Sign in again** in Settings.

Live responses stream with low effort; prep uses medium effort. Time to first text is measured
in the UI, not guaranteed: model access, network conditions, Claude usage limits, and local
speech recognition all affect latency. Live answers are written to be said as-is: first person,
grounded in your résumé, notes, and prep chat, and tied to the job description, with no
placeholder brackets. Cue won't invent employers, metrics, or projects that aren't in your
material, so the more real detail you add in prep, the more specific the answers.

Your résumé, job description, notes, and prep chat are saved locally, so they survive restarts
and switching tabs. **New interview** clears them. The meeting library saves only the
transcript and generated meeting brief. Auto-answer sends the relevant transcript and prep to
Claude. The CLI runs without project settings, hooks, MCP servers, or session persistence.
Audio transcription is local. Only use capture where you have the required permission.

### Teams / Zoom with headphones

Select **Teams / Zoom / call audio (headphones OK)**, not Microphone. Cue uses digital system
audio loopback; it does not need the interviewer's voice to play through your speakers. This
build uses Electron 44.5.1, with the macOS system-audio permission description included.
macOS 14.2+ or Windows is required for this capture path. On macOS it uses a Core Audio tap
and needs only the **System Audio Recording** permission, not Screen Recording. Allow Cue
when macOS asks. If no prompt appears and the meter stays still, add Cue under
**Privacy & Security → Screen & System Audio Recording → System Audio Recording Only** and
reopen Cue. Being switched on in the main Screen & System Audio Recording list isn't enough.

Before relying on a session:

1. Join the meeting with computer audio, not phone-only audio. Headphones, AirPods, or
   speakers all work, because Cue captures the audio before it reaches any output device.
2. In Cue, click **Test call audio**. In Teams, use its device speaker/test-call feature; in
   Zoom, use **Test Speaker**. Confirm Cue says **Receiving call audio** and the meter moves.
3. Stop the check, then start the interview. Confirm actual speech appears in **Transcript**.
   A moving meter proves audio capture, not speech-recognition accuracy.

The check only measures local sound levels; it does not save audio, transcribe it, or send it
to AI. During the interview, the status dot shows **Listening**, and the audio panel only appears
when something needs attention. If capture stops or you change headsets, use the **↻** reconnect
button; preparation and the transcript are preserved. Silence can simply mean
the other person isn't speaking, so the app reports it as a check, not a definitive failure.
Call mode captures system-wide application audio, not only the meeting: pause music and mute
unneeded notification sounds. It does not capture your microphone; use the separate microphone
mode only for in-person conversations. Test your actual headset/app combination before a call.

References: [Electron capture permissions](https://www.electronjs.org/docs/latest/api/desktop-capturer),
[Teams audio settings](https://support.microsoft.com/en-us/teams/notifications-settings/manage-your-device-settings-in-microsoft-teams),
[Zoom audio test](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0062765).

## Download

**[⬇ Download page](https://akshayan03.github.io/Cue/)** · [all releases](https://github.com/Akshayan03/Cue/releases/latest)

**macOS, easiest:** open Terminal, paste this, and press Return. It downloads the right build for
your Mac, installs it in Applications, and opens Cue:

```bash
curl -fsSL https://akshayan03.github.io/Cue/install.sh | bash
```

**macOS, manual:** download the `.zip` for your chip (`arm64` = Apple Silicon, plain = Intel),
unzip, and drag **Cue.app** to Applications. Cue isn't notarized yet, so the first time you open
it macOS says it can't verify the developer: click **Done**, then go to **System Settings →
Privacy & Security** and click **Open Anyway**.

**Windows:** run `Cue-Setup-<version>.exe`. If SmartScreen warns (the build is unsigned), choose
*More info → Run anyway*.

### Connecting to Claude

The first time you open Cue, it walks you through connecting your own Claude account, with no
Terminal:

1. **Install Claude Code:** click the button and Cue runs Anthropic's official installer (about
   2 minutes, no admin password).
2. **Sign in with Claude:** approve in your browser and Cue connects automatically. If claude.ai
   shows you a code instead, paste it into Cue.

Use the Claude account you already pay for (Pro, Max, Team, or Enterprise). Claude Code 2.1.280 or
newer is required; Cue offers to update an older copy. If your login expires, choose **Sign in
again** in Settings.

Alternatively, paste **your own Anthropic API key** from
[console.anthropic.com](https://console.anthropic.com/settings/keys) in Settings. It's stored
**encrypted on your device** via the OS keychain and is sent only to Anthropic, never to any Cue
server. The API key applies to the screen assistant and meeting briefs; interview prep and live
interview responses always use your Claude subscription with Opus 5.5.

**Nothing is bundled:** there's no shared or built-in API key.

> ⚖️ **Before you record anyone, read [`TERMS.md`](./TERMS.md) and [`PRIVACY.md`](./PRIVACY.md).**
> Recording meetings can be subject to all-party-consent (wiretapping) laws. You are responsible
> for obtaining any consent required where you are. Cue is provided "as is" with no warranty.

## Hotkeys

| Shortcut | Action |
|---|---|
| `⌘ \` | Show / hide the overlay |
| `⌘ J` | Request a live answer using your preparation and conversation |
| `⌘ ↵` | Show overlay and focus the "ask about my screen" box |
| `⌘ R` | Clear the current answer/chat; preserve interview preparation and transcript |
| `⌘ ←` / `⌘ →` | Move the overlay left or right |
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

On macOS, `npm run dev` launches Electron through LaunchServices so it asks for call-audio
permission itself; it appears as **Electron** under System Audio Recording Only. Starting the
Electron binary directly from a terminal makes macOS check the terminal app instead, which
silently blocks call audio.

Run checks with `npm test` and `CI=true npm test --prefix client -- --watchAll=false --runInBand`.

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

1. **Improve speech recognition accuracy.** Live interview answers already use the transcript
   and preparation. Evaluate larger on-device speech models and WebGPU, especially for technical
   terms, accents, and noisy calls.
2. **Calendar integration.** Pull meeting titles/attendees from Google Calendar so briefs
   are pre-titled and action items can be attributed to real people.
3. **Auto-send the brief.** After a meeting, email the brief or post it to Slack/Notion.
4. **Cloud sync + accounts.** Right now everything is per-browser. Add auth + a database
   (and object storage for recordings) to access meetings across devices.
5. **Chaptering & search across meetings.** Use Claude to chapter long recordings and
   enable semantic search over all transcripts.
6. **Live brief.** Stream the transcript to Claude during the meeting for real-time
   suggested questions and a running action-item list.
