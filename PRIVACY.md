# Privacy Policy

**Last updated: October 2, 2026**

> **⚠️ Placeholder notice:** This document is a good-faith starting point, not legal
> advice. Before you distribute Cue publicly, have a lawyer review it and replace every
> `[BRACKETED]` field. Items to fill in: `[LEGAL ENTITY NAME]`, `[CONTACT EMAIL]`,
> `[GOVERNING JURISDICTION]`.

This Privacy Policy explains how Cue ("the App", "we", "us"), provided by
`[LEGAL ENTITY NAME]`, handles your information. Cue is a desktop application that runs
on your own computer.

## The short version

Cue is **local-first**. Your recordings, transcripts, and meeting briefs are stored on
your own device and are **not** sent to us or stored on any server we operate. We do not
run a backend that receives your content, and we do not have accounts, analytics, or
tracking.

AI features send relevant content to **Anthropic** (the provider of Claude). This includes
automatic answers after detected interviewer questions when Auto-answer is enabled, as well
as requests you send manually — see "Data sent to Anthropic" below. Update checks and initial
speech-model downloads also make network requests without your meeting content.

## What Cue stores on your device

- **Recordings** (screen + audio) are stored locally in your browser/Electron storage
  (IndexedDB) on your machine.
- **Transcripts and meeting briefs** are stored locally (localStorage) on your machine.
- **Interview preparation** (résumé, job description, notes, and prep chat) is stored locally
  (localStorage) on your machine so it survives restarts. It is not added to the meeting library.
  **New interview** deletes it. Original documents you upload remain in their original location
  on your device.
- **Your Anthropic API key** (if you choose the API-key option instead of the Claude Code
  CLI) is stored locally, encrypted at rest using your operating system's secure storage
  (via Electron `safeStorage`, which uses Keychain on macOS / DPAPI on Windows).

You can delete saved meetings within the App. Uninstalling the App may leave application data
behind; it does not delete the original documents you selected.

## Audio and screen capture

- **Microphone, system audio, and screen capture** are active when you start a recording,
  a live session, dictation, or explicitly request screen context. Interview preparation
  dictation stops when you press Stop dictating or leave the screen. Remote-call mode listens
  to system audio; microphone mode listens to the microphone. Live interview mode does not
  save a video recording.
- **Audio checks** measure incoming sound levels locally without saving audio, transcribing it,
  or sending it to AI. Call audio is system-wide, so sounds from other apps may also be captured
  during a live session. A microphone is not requested in call-audio mode.
- **Speech-to-text transcription runs fully on your device** using an on-device Whisper
  model. Audio is **not** sent to any server for transcription. (The first time you
  transcribe, the App downloads the model file from a public CDN — only the model is
  downloaded; none of your audio is uploaded.)

## Data sent to Anthropic (only when you use an AI feature)

When you use the "Ask about my screen", "Live copilot", or "Meeting brief" features, the
following is sent to Anthropic to generate a response:

- **Screen assistant:** a screenshot of your primary display plus your typed/spoken
  question.
- **Interview prep / live copilot:** your supplied résumé, job description, notes, preparation
  chat, recent conversation, and a rolling window of the meeting transcript. With Auto-answer
  enabled, this is sent automatically after detected questions. A screenshot is included only
  when you enable screen context for a typed question.
- **Meeting brief:** the meeting transcript text.

Depending on the option you chose during setup, this is transmitted either:

1. **Via the Claude Code CLI** installed on your machine and signed in with your own
   Anthropic account; or
2. **Via the Anthropic API** using an API key you supplied.

Interview prep and live interview answers specifically use the Claude Code subscription login
and Opus 5.5, without falling back to an API key. Cue does not copy or export the CLI's OAuth
credentials. These requests disable CLI chat-session persistence, project settings, and hooks;
Anthropic's own processing and retention policies still apply.

In both cases your content is processed by Anthropic under **Anthropic's** terms and
privacy policy, not ours. Please review them at https://www.anthropic.com/legal. We do not
receive, store, or have access to this content.

## What we do **not** collect

We do not operate servers that receive your content. We do not collect analytics,
telemetry, advertising identifiers, or usage statistics. We do not sell or share personal
information.

## Update checks

If auto-update is enabled, the App contacts GitHub Releases to check whether a newer
version is available. This is a standard network request to GitHub and is subject to
GitHub's privacy practices. No personal content is included in this check.

## Children

Cue is not directed to children under 13 (or the minimum age in your jurisdiction) and we
do not knowingly collect their information.

## Your rights

Because your data lives on your own device, you control it directly — view, export, or
delete it within the App at any time. For questions about this policy, contact
`[CONTACT EMAIL]`.

## Changes to this policy

We may update this Privacy Policy. Material changes will be reflected by the "Last updated"
date above and noted in the release/changelog.
