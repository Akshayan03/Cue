import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isDesktop, summarize } from "../api";
import { useTranscriber } from "../useTranscriber";
import { CoachMode } from "../electron";
import { Transcript, TranscriptSegment } from "../types";
import ProviderNotice from "../components/ProviderNotice";

interface LiveProps {
  setSavedTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>>;
}

const ACTIONS: { mode: CoachMode; label: string; hint: string }[] = [
  { mode: "say", label: "What should I say?", hint: "Give me the strongest next line" },
  { mode: "answer", label: "Answer this", hint: "Answer the question I was just asked" },
  { mode: "followup", label: "Ask a follow-up", hint: "Surface a sharp next question" },
  { mode: "objection", label: "Handle pushback", hint: "Prepare for the likely objection" },
];

function clock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const Live: React.FC<LiveProps> = ({ setSavedTranscripts }) => {
  const desktop = isDesktop();
  const navigate = useNavigate();
  const transcriber = useTranscriber("english");

  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [suggestion, setSuggestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [responseKind, setResponseKind] = useState<"coach" | "ask">("coach");
  const [coachBusy, setCoachBusy] = useState(false);
  const [askBusy, setAskBusy] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [includeScreen, setIncludeScreen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const activeRef = useRef(false);
  const coachBusyRef = useRef(false);
  const lastAutoTextRef = useRef("");
  const lastSuggestLenRef = useRef(0);
  const transcriptRef = useRef("");
  const fullTranscriptRef = useRef("");
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const elapsedRef = useRef(0);
  const resetTranscriberRef = useRef(transcriber.reset);
  resetTranscriberRef.current = transcriber.reset;

  const fullText = [...transcriber.segments.map((s) => s.text), transcriber.interim]
    .filter(Boolean)
    .join(" ");
  fullTranscriptRef.current = fullText;
  transcriptRef.current = fullText.slice(-6000);
  segmentsRef.current = transcriber.segments;
  elapsedRef.current = elapsed;

  const displayText = responseKind === "ask" ? answer : suggestion;
  const displayBusy = responseKind === "ask" ? askBusy : coachBusy;

  const trigger = useCallback((mode: CoachMode) => {
    if (!window.electron) return;
    if (!transcriptRef.current.trim()) {
      setError("I need a little conversation context first. Start listening and try again.");
      return;
    }
    setError(null);
    setResponseKind("coach");
    setSuggestion("");
    setCoachBusy(true);
    coachBusyRef.current = true;
    lastSuggestLenRef.current = transcriptRef.current.length;
    window.electron.coach(transcriptRef.current, mode);
  }, []);

  const ask = useCallback(() => {
    if (!window.electron || askBusy) return;
    const typed = question.trim();
    if (!typed) {
      inputRef.current?.focus();
      return;
    }
    const meetingContext = transcriptRef.current.trim();
    const prompt = meetingContext
      ? `${typed}\n\nUse this live meeting transcript as additional context (most recent last):\n${meetingContext}`
      : typed;
    setError(null);
    setResponseKind("ask");
    setAnswer("");
    setAskBusy(true);
    window.electron.ask(prompt, includeScreen);
  }, [askBusy, includeScreen, question]);

  useEffect(() => {
    if (!window.electron) return;
    const offCoachDelta = window.electron.onCoachDelta((t) => setSuggestion((s) => s + t));
    const offCoachDone = window.electron.onCoachDone(() => {
      setCoachBusy(false);
      coachBusyRef.current = false;
    });
    const offCoachError = window.electron.onCoachError((msg) => {
      setError(msg);
      setCoachBusy(false);
      coachBusyRef.current = false;
    });
    const offAskDelta = window.electron.onAskDelta((t) => setAnswer((s) => s + t));
    const offAskDone = window.electron.onAskDone(() => setAskBusy(false));
    const offAskError = window.electron.onAskError((msg) => {
      setError(msg);
      setAskBusy(false);
    });
    const offAskFocus = window.electron.onAskFocus(() => inputRef.current?.focus());
    const offCoachTrigger = window.electron.onCoachTrigger(() => {
      if (activeRef.current) trigger("say");
    });
    const offClear = window.electron.onSessionClear?.(() => {
      resetTranscriberRef.current();
      setSuggestion("");
      setAnswer("");
      setQuestion("");
      setError(null);
      lastAutoTextRef.current = "";
      lastSuggestLenRef.current = 0;
    });
    return () => {
      offCoachDelta();
      offCoachDone();
      offCoachError();
      offAskDelta();
      offAskDone();
      offAskError();
      offAskFocus();
      offCoachTrigger();
      offClear?.();
    };
  }, [trigger]);

  useEffect(() => {
    if (!autoMode || coachBusyRef.current || !activeRef.current) return;
    const txt = fullText.trim();
    if (!txt || txt === lastAutoTextRef.current) return;
    if (/\?\s*$/.test(txt)) {
      lastAutoTextRef.current = txt;
      trigger("answer");
    }
  }, [fullText, autoMode, trigger]);

  useEffect(() => {
    if (!autoMode || !active) return;
    const id = window.setInterval(() => {
      if (coachBusyRef.current) return;
      const grew = transcriptRef.current.length - lastSuggestLenRef.current;
      if (grew >= 90) trigger("say");
    }, 10000);
    return () => window.clearInterval(id);
  }, [autoMode, active, trigger]);

  useEffect(() => {
    document.body.classList.toggle("session-active", active);
    return () => document.body.classList.remove("session-active");
  }, [active]);

  const cleanupCapture = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    transcriber.stop();
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, [transcriber]);

  const endSession = useCallback(() => {
    const content = fullTranscriptRef.current.trim();
    const durationSec = Math.max(1, Math.round(elapsedRef.current));
    const segments = [...segmentsRef.current];
    const interim = transcriber.interim.trim();
    if (interim) segments.push({ t: Math.max(0, durationSec - 1), text: interim });
    cleanupCapture();

    if (!content) return;
    const id = Date.now();
    const title = `Meeting · ${new Date().toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
    const meeting: Transcript = {
      id,
      name: title,
      content,
      segments,
      date: new Date().toISOString(),
      durationSec,
      hasRecording: false,
      brief: null,
    };
    setSavedTranscripts((prev) => [meeting, ...prev]);
    navigate("/library");

    // Cluely-style post-call notes: save immediately, then enrich in place.
    summarize({ title, transcript: content })
      .then((brief) => {
        setSavedTranscripts((prev) => prev.map((t) => (t.id === id ? { ...t, brief } : t)));
      })
      .catch(() => {
        // The transcript is already safe in the library; the user can retry there.
      });
  }, [cleanupCapture, navigate, setSavedTranscripts, transcriber.interim]);

  const start = useCallback(async () => {
    setError(null);
    setSuggestion("");
    setAnswer("");
    transcriber.reset();
    lastAutoTextRef.current = "";
    lastSuggestLenRef.current = 0;
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
      const micAllowed =
        !window.electron?.ensureMic || (await window.electron.ensureMic()) === "granted";
      if (micAllowed) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          ctx.createMediaStreamSource(mic).connect(dest);
          tracks.push(...mic.getAudioTracks());
          mixed = true;
        } catch {
          /* system audio can continue without the mic */
        }
      }
      tracksRef.current = tracks;
      audioCtxRef.current = ctx;
      display.getVideoTracks().forEach((t) => t.stop());

      if (!mixed) {
        setError("No audio was captured. Enable screen/system audio or microphone access, then try again.");
        tracks.forEach((t) => t.stop());
        ctx.close().catch(() => {});
        return;
      }
      startTimeRef.current = Date.now();
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = window.setInterval(() => {
        const next = (Date.now() - startTimeRef.current) / 1000;
        elapsedRef.current = next;
        setElapsed(next);
      }, 500);
      await transcriber.start(dest.stream, () => (Date.now() - startTimeRef.current) / 1000);
      activeRef.current = true;
      setActive(true);
    } catch {
      setError("Couldn't start the session. Allow screen/system audio and microphone access, then try again.");
    }
  }, [transcriber]);

  useEffect(
    () => () => {
      activeRef.current = false;
      tracksRef.current.forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    },
    []
  );

  const insight = useMemo(() => {
    const text = fullText.trim();
    if (!text) return "Start a session and Cue will surface questions, answers, and next steps here.";
    if (/\?\s*$/.test(text)) return "A question just landed — answer it directly or ask Cue for a stronger response.";
    if (/\b(price|pricing|budget|cost|expensive|concern|worry|risk)\b/i.test(text)) {
      return "Possible objection detected — clarify the concern before defending your position.";
    }
    if (/\b(next step|follow up|send|deadline|by (monday|tuesday|wednesday|thursday|friday))\b/i.test(text)) {
      return "A next step may be forming — confirm the owner and timing before the call ends.";
    }
    return "Conversation context is live. Cue is ready when you need the next line.";
  }, [fullText]);

  if (!desktop) {
    return (
      <div className="page">
        <header className="page-head"><h1>Live copilot</h1></header>
        <div className="card">
          <p>The real-time meeting overlay runs in the <strong>desktop app</strong>.</p>
        </div>
      </div>
    );
  }

  const status = !active
    ? "Ready"
    : transcriber.status === "loading"
    ? "Loading speech model…"
    : "Listening";

  return (
    <div className="page live live--session">
      <ProviderNotice />

      <div className="session-bar">
        <span className="drag-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        <span className={active ? "session-state session-state--live" : "session-state"}>
          {active && <span className="pulse-dot" />}
          {status}
        </span>
        <span className="session-timer">{clock(elapsed)}</span>
        <span className="privacy-pill" title="Hidden from screen sharing and recordings">◉ Invisible</span>
        {!active ? (
          <button className="session-start" onClick={start}>Start session</button>
        ) : (
          <button className="session-end" onClick={endSession}>End</button>
        )}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <section className={displayText || displayBusy ? "assist-card assist-card--active" : "assist-card"}>
        <div className="assist-head">
          <span className="eyebrow">{responseKind === "ask" ? "AI response" : "Live assist"}</span>
          {(displayText || displayBusy) && (
            <span className="context-badges">
              {fullText && <span>Heard conversation</span>}
              {responseKind === "ask" && includeScreen && <span>Viewed screen</span>}
            </span>
          )}
        </div>
        <div className="assist-body">
          {displayText || (
            displayBusy ? (
              <span className="thinking"><i /><i /><i /></span>
            ) : active ? (
              <span className="placeholder">Cue is listening. Ask anything or choose a live action below.</span>
            ) : (
              <span className="placeholder">Start a session to hear the conversation, answer questions, and create automatic notes.</span>
            )
          )}
        </div>
      </section>

      <div className="live-command">
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder="Ask about the screen, audio, or conversation…"
          aria-label="Ask Cue"
        />
        <button
          className={includeScreen ? "context-toggle context-toggle--on" : "context-toggle"}
          onClick={() => setIncludeScreen((v) => !v)}
          title={includeScreen ? "Screen context on" : "Screen context off"}
          aria-label="Toggle screen context"
        >
          ◫
        </button>
        <button className="send-btn" onClick={ask} disabled={askBusy || !question.trim()} title="Ask (⌘↵)">
          ↑
        </button>
      </div>

      <div className="live-actions" aria-label="Live actions">
        {ACTIONS.map((action, index) => (
          <button
            key={action.mode}
            className="action-chip"
            disabled={coachBusy || !active}
            onClick={() => trigger(action.mode)}
            title={action.hint}
          >
            {index === 0 && <span className="action-spark">✦</span>}
            {action.label}
            {index === 0 && <kbd>⌘J</kbd>}
          </button>
        ))}
      </div>

      <section className="insight-card">
        <div>
          <span className="eyebrow">Dynamic insight</span>
          <p>{insight}</p>
        </div>
        <label className="auto-control">
          <span>Auto</span>
          <input type="checkbox" className="switch" checked={autoMode} onChange={(e) => setAutoMode(e.target.checked)} />
        </label>
      </section>

      <details className="plain transcript-drawer">
        <summary>Live transcript <span>{fullText ? `${fullText.split(/\s+/).length} words` : ""}</span></summary>
        <div className="transcript-live">{fullText || <span className="faint">Nothing heard yet.</span>}</div>
      </details>

      {!active && fullText && <Link className="small" to="/library">Open meeting notes</Link>}
    </div>
  );
};

export default Live;
