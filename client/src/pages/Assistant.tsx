import React, { useEffect, useRef, useState } from "react";
import { isDesktop } from "../api";
import { useTranscriber } from "../useTranscriber";

const Assistant: React.FC = () => {
  const [question, setQuestion] = useState("");
  const [includeScreen, setIncludeScreen] = useState(true);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const desktop = isDesktop();

  // Voice input: dictate the question with the local Whisper transcriber.
  const voice = useTranscriber("english");
  const [micOn, setMicOn] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const consumedRef = useRef(0);

  useEffect(() => {
    if (!window.electron) return;
    const offDelta = window.electron.onAskDelta((t) => setAnswer((a) => a + t));
    const offDone = window.electron.onAskDone(() => setBusy(false));
    const offErr = window.electron.onAskError((msg) => {
      setError(msg);
      setBusy(false);
    });
    const offFocus = window.electron.onAskFocus(() => inputRef.current?.focus());
    return () => {
      offDelta();
      offDone();
      offErr();
      offFocus();
    };
  }, []);

  // Append newly transcribed speech into the question box as you talk.
  useEffect(() => {
    const segs = voice.segments;
    if (segs.length > consumedRef.current) {
      const added = segs.slice(consumedRef.current).map((s) => s.text).join(" ");
      consumedRef.current = segs.length;
      setQuestion((q) => (q ? `${q} ${added}` : added).replace(/\s+/g, " "));
    }
  }, [voice.segments]);

  const toggleMic = async () => {
    if (micOn) {
      voice.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setMicOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      consumedRef.current = 0;
      voice.reset();
      voice.start(stream, () => 0);
      setMicOn(true);
    } catch {
      setError("Couldn't access the microphone.");
    }
  };

  const ask = async () => {
    if (!window.electron) return;
    setError(null);
    setAnswer("");
    setBusy(true);
    await window.electron.ask(question, includeScreen);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      ask();
    }
  };

  if (!desktop) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Screen assistant</h1>
        </header>
        <div className="card">
          <p>
            The live, screen-aware assistant runs in the <strong>desktop app</strong> — it needs to
            see your whole screen and stay invisible to screen-share, which a browser tab can't do.
          </p>
          <p className="muted small">
            Run <code>npm run dev</code> from the project root to launch the desktop overlay, then
            press <kbd>⌘\</kbd> to toggle it over any app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page assistant">
      <div className="ask-box">
        <textarea
          ref={inputRef}
          autoFocus
          rows={2}
          placeholder="Ask about your screen, or tap the mic to speak…  (⌘↵ to send)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="ask-controls">
          <div className="ask-controls-left">
            <button
              className={`btn mic-btn ${micOn ? "mic-btn--on" : ""}`}
              onClick={toggleMic}
              title="Dictate your question"
            >
              {micOn ? "● Listening…" : "🎤 Speak"}
            </button>
            <label className="field--check">
              <input
                type="checkbox"
                checked={includeScreen}
                onChange={(e) => setIncludeScreen(e.target.checked)}
              />
              <span>Include screen</span>
            </label>
          </div>
          <button className="btn btn--primary" onClick={ask} disabled={busy}>
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
        {micOn && voice.status === "loading" && (
          <p className="muted small">Loading speech model… first time only.</p>
        )}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {(answer || busy) && (
        <div className="answer">{answer || <span className="muted">Looking at your screen…</span>}</div>
      )}
    </div>
  );
};

export default Assistant;
