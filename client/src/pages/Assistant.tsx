import React, { useEffect, useRef, useState } from "react";
import { isDesktop } from "../api";

const Assistant: React.FC = () => {
  const [question, setQuestion] = useState("");
  const [includeScreen, setIncludeScreen] = useState(true);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const desktop = isDesktop();

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
          placeholder="Ask about what's on your screen…  (⌘↵ to send)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="ask-controls">
          <label className="field--check">
            <input
              type="checkbox"
              checked={includeScreen}
              onChange={(e) => setIncludeScreen(e.target.checked)}
            />
            <span>Include screen</span>
          </label>
          <button className="btn btn--primary" onClick={ask} disabled={busy}>
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {(answer || busy) && (
        <div className="answer">
          {answer || <span className="muted">Looking at your screen…</span>}
        </div>
      )}
    </div>
  );
};

export default Assistant;
