import React, { useCallback, useEffect, useRef, useState } from "react";
import { isDesktop } from "../api";
import { useTranscriber } from "../useTranscriber";
import { CoachMode } from "../electron";
import ProviderNotice from "../components/ProviderNotice";

const MODES: { mode: CoachMode; label: string; hint: string }[] = [
  { mode: "say", label: "What do I say?", hint: "Suggest my next line" },
  { mode: "answer", label: "Answer the question", hint: "They just asked me something" },
  { mode: "followup", label: "Follow-up", hint: "A sharp question to ask" },
  { mode: "objection", label: "Handle pushback", hint: "Prep for the objection" },
];

const Live: React.FC = () => {
  const desktop = isDesktop();
  const transcriber = useTranscriber("english");

  const [active, setActive] = useState(false);
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const lastAutoIdxRef = useRef(0);
  const lastSuggestLenRef = useRef(0);
  const transcriptRef = useRef("");

  // Keep a rolling transcript string for context (last ~2000 chars).
  const fullText = transcriber.segments.map((s) => s.text).join(" ");
  transcriptRef.current = fullText.slice(-2000);

  const trigger = useCallback(
    (mode: CoachMode) => {
      if (!window.electron) return;
      if (!transcriptRef.current.trim()) {
        setError("No conversation captured yet — start listening first.");
        return;
      }
      setError(null);
      setSuggestion("");
      setBusy(true);
      busyRef.current = true;
      lastSuggestLenRef.current = transcriptRef.current.length;
      window.electron.coach(transcriptRef.current, mode);
    },
    []
  );

  // Subscribe to streamed suggestions + the global ⌘J trigger.
  useEffect(() => {
    if (!window.electron) return;
    const offDelta = window.electron.onCoachDelta((t) => setSuggestion((s) => s + t));
    const offDone = window.electron.onCoachDone(() => {
      setBusy(false);
      busyRef.current = false;
    });
    const offErr = window.electron.onCoachError((msg) => {
      setError(msg);
      setBusy(false);
      busyRef.current = false;
    });
    const offTrig = window.electron.onCoachTrigger(() => {
      if (activeRef.current) trigger("say");
    });
    return () => {
      offDelta();
      offDone();
      offErr();
      offTrig();
    };
  }, [trigger]);

  // Immediate auto-answer: when the other person finishes on a question, jump on it.
  useEffect(() => {
    if (!autoMode || busyRef.current || !activeRef.current) return;
    const segs = transcriber.segments;
    if (segs.length <= lastAutoIdxRef.current) return;
    const latest = segs[segs.length - 1]?.text ?? "";
    lastAutoIdxRef.current = segs.length;
    if (/\?\s*$/.test(latest) || /\b(what|how|why|when|where|who|could you|can you|tell me|thoughts)\b/i.test(latest)) {
      trigger("answer");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriber.segments, autoMode]);

  // Always-on copilot: every few seconds, refresh the suggestion if the
  // conversation has moved on meaningfully since the last one.
  useEffect(() => {
    if (!autoMode || !active) return;
    const id = window.setInterval(() => {
      if (busyRef.current) return;
      const grew = transcriptRef.current.length - lastSuggestLenRef.current;
      if (grew >= 60) trigger("say");
    }, 9000);
    return () => window.clearInterval(id);
  }, [autoMode, active, trigger]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    transcriber.stop();
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, [transcriber]);

  const start = useCallback(async () => {
    setError(null);
    setSuggestion("");
    transcriber.reset();
    lastAutoIdxRef.current = 0;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const tracks = [...display.getTracks()];
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      let mixed = false;
      if (display.getAudioTracks().length > 0) {
        ctx.createMediaStreamSource(display).connect(dest);
        mixed = true;
      }
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        ctx.createMediaStreamSource(mic).connect(dest);
        tracks.push(...mic.getAudioTracks());
        mixed = true;
      } catch {
        /* mic denied */
      }
      tracksRef.current = tracks;
      audioCtxRef.current = ctx;
      // We only need audio; stop the video track to save resources.
      display.getVideoTracks().forEach((t) => t.stop());

      if (!mixed) {
        setError("No audio captured. When sharing, enable system/tab audio.");
        return;
      }
      startTimeRef.current = Date.now();
      transcriber.start(dest.stream, () => (Date.now() - startTimeRef.current) / 1000);
      activeRef.current = true;
      setActive(true);
    } catch {
      setError("Couldn't start audio capture. Grant screen-sharing permission and enable audio.");
    }
  }, [transcriber]);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!desktop) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Live copilot</h1>
        </header>
        <div className="card">
          <p>The live meeting copilot runs in the <strong>desktop app</strong>. Launch it with <code>npm run dev</code> and press <kbd>⌘\</kbd>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page live">
      <ProviderNotice />
      <div className="live-head">
        <div>
          <h1>Live copilot</h1>
          <p className="muted small">
            {active ? "Listening to your meeting" : "Start to capture the conversation"}
            {transcriber.status === "loading" && " · loading model…"}
            {transcriber.pending > 0 && " · transcribing…"}
          </p>
        </div>
        {!active ? (
          <button className="btn btn--primary" onClick={start}>
            ● Start
          </button>
        ) : (
          <button className="btn btn--danger" onClick={stop}>
            ■ Stop
          </button>
        )}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="suggestion-card">
        <div className="suggestion-head">
          <span className="badge badge--live">SUGGESTION</span>
          {busy && <span className="muted small">thinking…</span>}
        </div>
        <div className="suggestion-body">
          {suggestion || (
            <span className="muted">
              {active
                ? "Hit a button below (or ⌘J) and I'll tell you what to say."
                : "Start listening, then ask me what to say."}
            </span>
          )}
        </div>
      </div>

      <div className="mode-row">
        {MODES.map((m) => (
          <button key={m.mode} className="btn mode-btn" disabled={busy || !active} onClick={() => trigger(m.mode)} title={m.hint}>
            {m.label}
          </button>
        ))}
      </div>

      <label className="field--check auto-toggle">
        <input type="checkbox" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
        <span>Always-on copilot — keep suggesting as the conversation moves (and auto-answer questions)</span>
      </label>

      <details className="mt">
        <summary>Live transcript</summary>
        <div className="transcript-live">{fullText || <span className="muted">Listening…</span>}</div>
      </details>
    </div>
  );
};

export default Live;
