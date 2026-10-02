import React, { useEffect, useRef, useState } from "react";
import { isDesktop } from "../api";
import { useTranscriber } from "../useTranscriber";
import ProviderNotice from "../components/ProviderNotice";

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
  const dictBaseRef = useRef(""); // question text present when dictation began

  // Release the microphone if the user navigates away mid-dictation.
  useEffect(
    () => () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    },
    []
  );

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

  // Live dictation: the transcriber re-transcribes the current window each
  // pass, so REPLACE the dictated part instead of appending segments.
  const voiceText = [...voice.segments.map((s) => s.text), voice.interim]
    .filter(Boolean)
    .join(" ");
  useEffect(() => {
    if (!micOn || !voiceText) return;
    setQuestion(`${dictBaseRef.current}${voiceText}`.replace(/\s+/g, " "));
  }, [voiceText, micOn]);

  const toggleMic = async () => {
    if (micOn) {
      voice.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setMicOn(false);
      return;
    }
    if (window.electron?.ensureMic && (await window.electron.ensureMic()) !== "granted") {
      setError(
        "Microphone access is blocked. Enable Cue in System Settings → Privacy & Security → Microphone, then try again."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      dictBaseRef.current = question.trim() ? `${question.trim()} ` : "";
      voice.reset();
      await voice.start(stream, () => 0);
      setMicOn(true);
    } catch {
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
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
      <ProviderNotice />
      <div className="cmd">
        <textarea
          ref={inputRef}
          autoFocus
          rows={2}
          placeholder="Ask about your screen…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className={micOn ? "icon-btn icon-btn--rec" : "icon-btn"}
          onClick={toggleMic}
          title={micOn ? "Stop dictating" : "Dictate your question"}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <button className="send-btn" onClick={ask} disabled={busy} title="Ask (⌘↵)">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>

      <div className="cmd-options">
        <label className="field--check">
          <input
            type="checkbox"
            className="switch"
            checked={includeScreen}
            onChange={(e) => setIncludeScreen(e.target.checked)}
          />
          <span className="small">Include a screenshot of my screen</span>
        </label>
        {micOn && voice.status === "loading" && (
          <span className="small faint">Loading speech model…</span>
        )}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {(answer || busy) && (
        <div className="mt">
          <div className="stage-head">
            <span className="eyebrow">Answer</span>
            {busy && !answer && (
              <span className="thinking">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
          <div className="answer">{answer || <span className="faint">Looking at your screen…</span>}</div>
        </div>
      )}
    </div>
  );
};

export default Assistant;
