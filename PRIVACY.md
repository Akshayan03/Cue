# Privacy Policy

**Last updated: June 30, 2026**

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

The only time your data leaves your machine is when **you** ask Cue to use an AI feature,
in which case the relevant content is sent to **Anthropic** (the provider of Claude) for
processing — see "Data sent to Anthropic" below.

## What Cue stores on your device

- **Recordings** (screen + audio) are stored locally in your browser/Electron storage
  (IndexedDB) on your machine.
- **Transcripts and meeting briefs** are stored locally (localStorage) on your machine.
- **Your Anthropic API key** (if you choose the API-key option instead of the Claude Code
  CLI) is stored locally, encrypted at rest using your operating system's secure storage
  (via Electron `safeStorage`, which uses Keychain on macOS / DPAPI on Windows).

You can delete any of this at any time from within the App, and uninstalling the App
removes it.

## Audio and screen capture

- **Microphone, system audio, and screen capture** are only active while you explicitly
  start a recording or a live session, and stop when you stop it.
- **Speech-to-text transcription runs fully on your device** using an on-device Whisper
  model. Audio is **not** sent to any server for transcription. (The first time you
  transcribe, the App downloads the model file from a public CDN — only the model is
  downloaded; none of your audio is uploaded.)

## Data sent to Anthropic (only when you use an AI feature)

When you use the "Ask about my screen", "Live copilot", or "Meeting brief" features, the
following is sent to Anthropic to generate a response:

- **Screen assistant:** a screenshot of your primary display plus your typed/spoken
  question.
- **Live copilot:** a rolling window of the recent meeting transcript text.
- **Meeting brief:** the meeting transcript text.

Depending on the option you chose during setup, this is transmitted either:

1. **Via the Claude Code CLI** installed on your machine and signed in with your own
   Anthropic account; or
2. **Via the Anthropic API** using an API key you supplied.

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
