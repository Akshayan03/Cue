import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isDesktop, summarize } from "../api";
import { useTranscriber } from "../useTranscriber";
import { useInterviewAI } from "../useInterviewAI";
import { AudioSource, emptyContext, InterviewContext, latestQuestion, questionKey } from "../interview";
import { CoachMode } from "../electron";
import { Transcript } from "../types";
import InterviewPrep from "../components/InterviewPrep";
import { openInterviewAudio, stopAudioCapture } from "../callAudio";
import { useAudioHealth } from "../useAudioHealth";
import AudioStatus from "../components/AudioStatus";
import { clearInterviewPrep, loadInterviewPrep, saveInterviewPrep } from "../storage";

interface LiveProps { setSavedTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>> }
const ACTIONS: { mode: CoachMode; label: string; title: string }[] = [
  { mode: "answer", label: "Answer", title: "Answer the latest question (⌘J)" },
  { mode: "followup", label: "Ask them", title: "A question you can ask the interviewer" },
  { mode: "objection", label: "Pushback", title: "Respond to a concern they raised" },
];
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

const Live: React.FC<LiveProps> = ({ setSavedTranscripts }) => {
  const navigate = useNavigate();
  const transcriber = useTranscriber("english");
  // Prep is saved on disk, so a restart or tab switch never drops the résumé.
  const [savedPrep] = useState(loadInterviewPrep);
  const ai = useInterviewAI(savedPrep.prepConversation);
  const { respond, clear } = ai;
  const [phase, setPhase] = useState<"prep" | "live">("prep");
  const [context, setContext] = useState<InterviewContext>(() => ({ ...savedPrep, prepConversation: undefined }));
  const [audioSource, setAudioSource] = useState<AudioSource>("system");
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [capture, setCapture] = useState<MediaStream | null>(null);
  const audioHealth = useAudioHealth(capture);
  const [elapsed, setElapsed] = useState(0);
  const [question, setQuestion] = useState("");
  const [autoMode, setAutoMode] = useState(true);
  const [includeScreen, setIncludeScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askedQuestion, setAskedQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const reconnectingRef = useRef(false);
  const alive = useRef(true);
  const startedAt = useRef(0);
  const frozenContext = useRef<InterviewContext>(emptyContext());
  const answeredKeys = useRef<string[]>([]);
  const transcriptRef = useRef("");
  const triggerRef = useRef<(mode: CoachMode) => void>(() => {});
  const fullText = [...transcriber.segments.map(s => s.text), transcriber.interim].filter(Boolean).join(" ");
  transcriptRef.current = fullText;
  const detectedQuestion = latestQuestion(fullText);

  const stopTracks = useCallback(() => {
    tracksRef.current.forEach(t => t.stop());
    tracksRef.current = [];
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; activeRef.current = false; stopTracks(); };
  }, [stopTracks]);

  // Only prep-time chat is saved; live answers never become "prep facts".
  useEffect(() => {
    if (phase === "prep") saveInterviewPrep({ ...context, prepConversation: ai.history });
  }, [phase, context, ai.history]);

  const resetPrep = () => {
    clear();
    setContext(emptyContext());
    clearInterviewPrep();
  };

  useEffect(() => {
    document.body.classList.toggle("session-active", phase === "live");
    return () => document.body.classList.remove("session-active");
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  const trigger = useCallback((mode: CoachMode, override?: string) => {
    if (!activeRef.current || ending) return;
    const currentQuestion = override || latestQuestion(transcriptRef.current) || "Suggest my next response based on the conversation.";
    if (!transcriptRef.current.trim()) { setError("Waiting for conversation audio. You can also type a question below."); return; }
    setError(null);
    setCopied(false);
    setAskedQuestion(currentQuestion);
    const key = questionKey(currentQuestion);
    answeredKeys.current = [...answeredKeys.current.slice(-19), key];
    respond({ context: frozenContext.current, transcript: transcriptRef.current.slice(-18000), question: currentQuestion, kind: "live", mode });
  }, [respond, ending]);
  triggerRef.current = trigger;

  // A stable transcription plus an audio pause triggers the answer. A question
  // arriving during generation is reconsidered when the current answer finishes.
  useEffect(() => {
    if (phase !== "live" || !autoMode || ending || reconnecting || ["ended", "muted", "suspended", "error"].includes(audioHealth.state) || ai.busy || transcriber.speaking || transcriber.pending || !detectedQuestion) return;
    const key = questionKey(detectedQuestion);
    if (answeredKeys.current.includes(key)) return;
    const timer = window.setTimeout(() => trigger("answer", detectedQuestion), 650);
    return () => window.clearTimeout(timer);
  }, [phase, autoMode, ending, reconnecting, audioHealth.state, ai.busy, detectedQuestion, transcriber.speaking, transcriber.pending, trigger]);

  useEffect(() => {
    const off = window.electron?.onCoachTrigger(() => triggerRef.current("answer"));
    const offFocus = window.electron?.onAskFocus(() => inputRef.current?.focus());
    return () => { off?.(); offFocus?.(); };
  }, []);

  useEffect(() => window.electron?.onSessionClear?.(() => {
    clear();
    setQuestion("");
    setAskedQuestion("");
    // Clearing the answer preserves preparation and the saved transcript.
    const key = questionKey(latestQuestion(transcriptRef.current));
    answeredKeys.current = key ? [key] : [];
  }), [clear]);

  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      await window.electron?.checkInterviewConnection();
      if (!alive.current) return;
      const stream = await openInterviewAudio(audioSource);
      if (!alive.current) { stream.getTracks().forEach(t => t.stop()); return; }
      // Keep the display source alive: stopping its video track can terminate
      // loopback audio too. This video is never recorded or uploaded.
      tracksRef.current = stream.getTracks();
      setCapture(stream);
      frozenContext.current = { ...context, prepConversation: [...ai.history] };
      transcriber.reset();
      startedAt.current = Date.now();
      await transcriber.start(new MediaStream(stream.getAudioTracks()), () => (Date.now() - startedAt.current) / 1000);
      if (!alive.current) { stopTracks(); return; }
      await window.electron?.setSettings({ provider: "cli", coachProfile: "interview" });
      if (!alive.current) { transcriber.stop(); stopTracks(); return; }
      ai.cancel();
      setAskedQuestion("");
      setElapsed(0);
      answeredKeys.current = [];
      activeRef.current = true;
      setPhase("live");
    } catch (e) {
      transcriber.stop();
      stopTracks();
      setCapture(null);
      if (alive.current) setError(e instanceof Error ? e.message : "Couldn't start audio capture.");
    } finally {
      startingRef.current = false;
      if (alive.current) setStarting(false);
    }
  };

  const reconnectAudio = async () => {
    if (reconnectingRef.current || !activeRef.current) return;
    reconnectingRef.current = true;
    setReconnecting(true);
    setError(null);
    let next: MediaStream | null = null;
    try {
      next = await openInterviewAudio(audioSource);
      if (!alive.current || !activeRef.current) { stopAudioCapture(next); return; }
      await transcriber.replaceStream(new MediaStream(next.getAudioTracks()));
      if (!alive.current || !activeRef.current) { stopAudioCapture(next); return; }
      stopTracks();
      tracksRef.current = next.getTracks();
      setCapture(next);
    } catch (e) {
      stopAudioCapture(next);
      if (alive.current && activeRef.current) setError(e instanceof Error ? e.message : "Couldn't reconnect audio. Your transcript and preparation are unchanged.");
    } finally {
      reconnectingRef.current = false;
      if (alive.current) setReconnecting(false);
    }
  };

  const endSession = async () => {
    if (ending || !activeRef.current) return;
    activeRef.current = false;
    setEnding(true);
    ai.cancel();
    const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
    const pending = transcriber.finish();
    stopTracks();
    setCapture(null);
    let segments = transcriber.segments;
    let content = transcriptRef.current.trim();
    try {
      segments = await pending;
      content = segments.map(s => s.text).join(" ");
    } catch {
      if (transcriber.interim) segments = [...segments, { t: Math.max(0, durationSec - 1), text: transcriber.interim }];
    }
    if (!alive.current) return;
    if (!content) {
      setPhase("prep");
      setEnding(false);
      setError("No speech was captured. Check your selected audio source before starting again.");
      return;
    }
    const id = Date.now();
    const title = frozenContext.current.title || `Interview · ${new Date().toLocaleDateString()}`;
    setSavedTranscripts(prev => [{ id, name: title, content, segments, date: new Date().toISOString(), durationSec, hasRecording: false, brief: null }, ...prev]);
    navigate("/library");
    summarize({ title, transcript: content }).then(brief => setSavedTranscripts(prev => prev.map(t => t.id === id ? { ...t, brief } : t))).catch(() => {});
  };

  const ask = () => {
    if (!question.trim() || ending) return;
    setCopied(false);
    setAskedQuestion(question.trim());
    ai.respond({ context: frozenContext.current, transcript: fullText.slice(-18000), question: question.trim(), kind: "live", includeScreen });
    setQuestion("");
  };

  const missingPrep = [!frozenContext.current.resume && "résumé", !frozenContext.current.jobDescription && "job description"].filter(Boolean).join(" or ");
  // Show the audio panel only when something needs fixing; a normal pause between questions isn't a problem.
  const audioProblem = ["ended", "muted", "suspended", "error"].includes(audioHealth.state) || (!audioHealth.hasSignal && (audioHealth.state === "quiet" || audioHealth.deviceChanged));
  const status = ending ? "Finishing…" : transcriber.status === "loading" ? "Loading speech…" : audioProblem ? "Check audio" : audioHealth.hasSignal ? "Listening" : "Waiting for audio";
  const shownQuestion = askedQuestion || detectedQuestion;
  const waitingText = detectedQuestion ? (autoMode ? "Answering when they finish…" : "Press Answer or ⌘J to respond.") : "Cue answers automatically when the interviewer asks a question.";

  if (!isDesktop()) return <div className="page"><h1>Interview copilot</h1><div className="card">Open Cue on your desktop to prepare and start a live interview session.</div></div>;
  return <div className="page live live--session">
    {error && <div role="alert" className="alert alert--error">{error}</div>}
    {phase === "prep" ? <InterviewPrep context={context} setContext={setContext} ai={ai} audioSource={audioSource} setAudioSource={setAudioSource} starting={starting} onStart={start} onReset={resetPrep} /> : <>
      <div className="session-bar">
        <span className="drag-grip" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        <span className={`session-state ${audioProblem && !ending ? "session-state--warn" : "session-state--live"}`}><span className="pulse-dot" />{status}</span>
        <span className="session-timer">{clock(elapsed)}</span>
        <button className="session-icon" onClick={reconnectAudio} disabled={reconnecting || ending} aria-label="Reconnect audio" title="Reconnect audio">{reconnecting ? "…" : "↻"}</button>
        <button className="session-end" onClick={endSession} disabled={ending}>End</button>
      </div>
      {missingPrep && <p className="live-note">No {missingPrep} loaded, so answers will be general. Add it in prep before your next session.</p>}
      {!ending && audioProblem && <section className="live-audio"><AudioStatus health={audioHealth} source={audioSource} /></section>}
      {transcriber.error && <div role="alert" className="alert alert--error">{transcriber.error}</div>}
      {ai.error && <div role="alert" className="alert alert--error">{ai.error}<button className="btn btn--ghost" onClick={ai.retry} disabled={ending}>Retry answer</button></div>}
      <section className="assist-card assist-card--active" aria-busy={ai.busy}>
        {shownQuestion && <p className="heard-question">{shownQuestion}</p>}
        <div className="assist-body" aria-live="polite">{askedQuestion ? ai.answer || (ai.busy ? "Preparing your answer…" : "Ready for the next question.") : <span className="placeholder">{waitingText}</span>}</div>
        <div className="response-actions">{ai.busy ? <button className="btn btn--ghost" onClick={ai.cancel}>Stop</button> : askedQuestion && ai.answer && <button className="btn btn--ghost" onClick={() => { navigator.clipboard.writeText(ai.answer).then(() => setCopied(true)).catch(() => setError("Couldn't copy the answer.")); }}>{copied ? "Copied" : "Copy"}</button>}</div>
      </section>
      <div className="live-command"><input ref={inputRef} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ask(); } }} placeholder="Type a question…" aria-label="Ask Cue" /><button className={includeScreen ? "context-toggle context-toggle--on" : "context-toggle"} onClick={() => setIncludeScreen(v => !v)} aria-label="Include screen" aria-pressed={includeScreen} title="Include a screenshot with your next typed question">◫</button><button className="send-btn" onClick={ask} disabled={!question.trim() || ending} aria-label="Send question">↑</button></div>
      <div className="live-actions">
        {ACTIONS.map(action => <button key={action.mode} className="action-chip" disabled={ending} title={action.title} onClick={() => trigger(action.mode)}>{action.label}{action.mode === "answer" && <kbd>⌘J</kbd>}</button>)}
        <label className="auto-control" title="Answer automatically when a question is detected"><span>Auto</span><input type="checkbox" className="switch" checked={autoMode} onChange={e => setAutoMode(e.target.checked)} aria-label="Auto-answer" /></label>
      </div>
      <details className="plain transcript-drawer"><summary>Transcript <span>{fullText ? `${fullText.split(/\s+/).length} words` : ""}</span></summary><div className="transcript-live">{fullText || "Waiting for speech from the selected audio source…"}</div></details>
    </>}
  </div>;
};

export default Live;
