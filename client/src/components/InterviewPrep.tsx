import React, { useCallback, useEffect, useRef, useState } from "react";
import { AudioSource, InterviewContext } from "../interview";
import { useInterviewAI } from "../useInterviewAI";
import { useTranscriber } from "../useTranscriber";
import { openInterviewAudio, stopAudioCapture } from "../callAudio";
import { useAudioHealth } from "../useAudioHealth";
import AudioStatus from "./AudioStatus";

interface Props {
  context: InterviewContext;
  setContext: React.Dispatch<React.SetStateAction<InterviewContext>>;
  ai: ReturnType<typeof useInterviewAI>;
  audioSource: AudioSource;
  setAudioSource: (source: AudioSource) => void;
  starting: boolean;
  onStart: () => void;
  onReset: () => void;
}

export default function InterviewPrep({ context, setContext, ai, audioSource, setAudioSource, starting, onStart, onReset }: Props) {
  const [connection, setConnection] = useState("Checking your Claude account…");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkingAudio, setCheckingAudio] = useState(false);
  const [checkStream, setCheckStream] = useState<MediaStream | null>(null);
  const checkStreamRef = useRef<MediaStream | null>(null);
  const checkGeneration = useRef(0);
  const audioHealth = useAudioHealth(checkStream);
  const streamRef = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const baseText = useRef("");
  const voice = useTranscriber("english");
  const voiceText = [...voice.segments.map(s => s.text), voice.interim].filter(Boolean).join(" ");
  const cancelAudioCheck = useCallback(() => {
    checkGeneration.current++;
    stopAudioCapture(checkStreamRef.current);
    checkStreamRef.current = null;
  }, []);

  const checkConnection = () => {
    setReady(false);
    setConnection("Checking your Claude account…");
    window.electron?.checkInterviewConnection().then((result) => {
      if (!alive.current) return;
      setReady(true);
      setConnection(`Claude account · ${result.subscription} · Opus 5.5`);
    }).catch((e) => {
      if (alive.current) setConnection(e.message || "Sign in to Claude Code to continue.");
    });
  };

  useEffect(() => {
    alive.current = true;
    checkConnection();
    return () => {
      alive.current = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      cancelAudioCheck();
    };
  }, [cancelAudioCheck]); // connection is checked once per preparation screen

  const stopCheck = useCallback(() => {
    cancelAudioCheck();
    setCheckStream(null);
    setCheckingAudio(false);
  }, [cancelAudioCheck]);
  useEffect(() => { stopCheck(); }, [audioSource, stopCheck]);

  const testAudio = async () => {
    if (checkingAudio || checkStream) { stopCheck(); return; }
    const generation = ++checkGeneration.current;
    setCheckingAudio(true);
    setError(null);
    try {
      const stream = await openInterviewAudio(audioSource);
      if (!alive.current || generation !== checkGeneration.current) { stopAudioCapture(stream); return; }
      checkStreamRef.current = stream;
      setCheckStream(stream);
    } catch (e) {
      if (alive.current && generation === checkGeneration.current) setError(e instanceof Error ? e.message : "Couldn't check audio.");
    } finally { if (alive.current && generation === checkGeneration.current) setCheckingAudio(false); }
  };

  useEffect(() => {
    if (recording) setMessage(`${baseText.current}${voiceText}`);
  }, [recording, voiceText]);

  const setField = (key: keyof InterviewContext, value: string) => setContext(prev => ({ ...prev, [key]: value }));

  const importFile = async (key: "resume" | "jobDescription") => {
    setImporting(true);
    setError(null);
    try {
      const document = await window.electron?.importDocument();
      if (document && alive.current) setField(key, document.text);
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Couldn't read this document."); }
    finally { if (alive.current) setImporting(false); }
  };

  const toggleVoice = async () => {
    if (dictating) return;
    setError(null);
    setDictating(true);
    try {
      if (recording) {
        setRecording(false);
        const pending = voice.finish();
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const segments = await pending;
        if (alive.current) setMessage(`${baseText.current}${segments.map(s => s.text).join(" ")}`);
      } else {
        if (window.electron?.ensureMic && await window.electron.ensureMic() !== "granted") throw new Error("Allow Microphone access for Cue in System Settings.");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!alive.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        baseText.current = message.trim() ? `${message.trim()} ` : "";
        voice.reset();
        await voice.start(stream, () => 0);
        if (alive.current) setRecording(true);
      }
    } catch (e) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (alive.current) { setRecording(false); setError(e instanceof Error ? e.message : "Couldn't use the microphone."); }
    } finally { if (alive.current) setDictating(false); }
  };

  const send = (prompt = message) => {
    if (!prompt.trim() || ai.busy || recording || dictating || !ready) return;
    ai.respond({ context, question: prompt.trim(), kind: "prep" });
    setMessage("");
  };
  const disabled = starting || ai.busy || recording || dictating || importing || checkingAudio;
  const hasPrep = Boolean(context.title || context.resume || context.jobDescription || context.notes || ai.history.length);
  const reset = () => {
    if (window.confirm("Clear your résumé, job description, notes, and prep chat to start a new interview?")) onReset();
  };

  return <section className="interview-prep">
    <header className="prep-heading">
      {hasPrep && <button className="btn btn--ghost prep-reset" onClick={reset} disabled={disabled}>New interview</button>}
      <span className="eyebrow">Before you go live</span>
      <h1>Give Cue your story.</h1>
      <p>Your experience. Their role. Answers that connect the two.</p>
    </header>
    <div className={ready ? "connection-card connection-card--ready" : "connection-card"}>
      <span>{ready ? "●" : "○"} {connection}</span>
      {!ready && <button className="btn btn--ghost" onClick={checkConnection}>Recheck</button>}
    </div>
    <p className="small muted">Uses your signed-in Claude account. Opus 5.5 access is confirmed when a response succeeds.</p>
    <label className="field">
      <span>Interview / role</span>
      <input value={context.title} maxLength={200} onChange={e => setField("title", e.target.value)} placeholder="Senior engineer · Company name" />
    </label>
    {(["resume", "jobDescription"] as const).map(key => <section className="prep-document" key={key}>
      <div className="card-head">
        <label htmlFor={`prep-${key}`}>{key === "resume" ? "Your résumé" : "Job description"}</label>
        <button className="btn btn--ghost" disabled={importing || starting} onClick={() => importFile(key)}>Upload</button>
      </div>
      <textarea id={`prep-${key}`} rows={4} maxLength={30000} value={context[key]} onChange={e => setField(key, e.target.value)} placeholder={key === "resume" ? "Paste your experience, projects, and achievements…" : "Paste the role, requirements, and company context…"} />
      <div className="document-meta"><span>PDF, DOCX, TXT, MD · up to 10 MB</span><span>{context[key].length.toLocaleString()} / 30,000</span></div>
    </section>)}
    <details className="prep-notes">
      <summary>Background & talking points {context.notes && "· added"}</summary>
      <label className="field mt"><span>Facts Cue should know</span><textarea rows={4} maxLength={12000} value={context.notes} onChange={e => setField("notes", e.target.value)} placeholder="Your strongest projects, real metrics, career goals, and anything not in the résumé…" /></label>
    </details>
    <section className="prep-conversation">
      <div className="card-head"><h2>Talk it through</h2><span className="badge">Opus 5.5</span></div>
      <p className="small muted">Explain your background, rehearse an answer, or ask for likely questions. This conversation carries into the session.</p>
      <button className="chip mt" disabled={!ready || disabled} onClick={() => send("Build my interview brief using my resume and this job description. Identify my strongest real examples, likely interview questions, and missing details you need from me.")}>✦ Build my interview brief</button>
      {ai.history.length > 0 && <div className="prep-chat-log">{ai.history.map((turn, i) => <div key={i} className={`prep-turn prep-turn--${turn.role}`}><span>{turn.role === "user" ? "You" : "Cue"}</span><p>{turn.text}</p></div>)}</div>}
      {ai.busy && <div className="prep-turn" aria-live="polite"><span>Cue</span><p>{ai.answer || "Thinking through your background…"}</p></div>}
      {ai.error && <div role="alert" className="alert alert--error">{ai.error}<button className="btn btn--ghost" onClick={ai.retry} disabled={disabled}>Retry response</button></div>}
      <textarea aria-label="Prep message" rows={3} value={message} disabled={recording || dictating} maxLength={6000} onChange={e => setMessage(e.target.value)} placeholder="Tell Cue what matters, or use the microphone…" onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
      <div className="prep-chat-actions">
        <button className={recording ? "btn btn--danger" : "btn"} onClick={toggleVoice} disabled={dictating || ai.busy || starting || Boolean(checkStream) || checkingAudio}>{dictating ? "Finishing…" : recording ? "Stop dictating" : "Speak"}</button>
        <button className="btn btn--primary" onClick={() => send()} disabled={!message.trim() || !ready || disabled}>Send</button>
      </div>
      {recording && <p className="small muted">{voice.status === "loading" ? "Preparing on-device speech recognition…" : "Listening — your words appear above."}</p>}
      {voice.error && <div className="alert alert--error">{voice.error}</div>}
    </section>
    {error && <div role="alert" className="alert alert--error">{error}</div>}
    <label className="field"><span>Listen to</span><select value={audioSource} onChange={e => setAudioSource(e.target.value as AudioSource)} disabled={starting || recording || dictating}><option value="system">Teams / Zoom / call audio (headphones OK)</option><option value="microphone">Microphone / in-person conversation</option></select></label>
    <section className="audio-check">
      <div className="card-head"><h2>Check your audio</h2><button className="btn" disabled={starting || recording || dictating} onClick={testAudio}>{checkingAudio ? "Cancel audio check" : checkStream ? "Stop audio check" : audioSource === "system" ? "Test call audio" : "Test microphone"}</button></div>
      <p className="small muted">{audioSource === "system" ? "Works with headphones or speakers. Play the Teams/Zoom speaker test and the meter should move. Your microphone isn't used." : "Microphone mode hears the room, not an interviewer playing through headphones. Use call audio for remote interviews."}</p>
      {checkStream && <AudioStatus health={audioHealth} source={audioSource} />}
      <p className="small faint">This check measures sound levels locally. It does not save audio or send it to AI. Call mode captures other apps' audio too; pause music and notifications.</p>
    </section>
    <div className="prep-launch">
      <p className="small muted">Your prep is saved on this Mac until you start a new interview. It isn't added to your meeting library. With Auto on, your prep and the recent transcript are sent to Claude when a question is detected. Audio is transcribed on-device.</p>
      {(!context.resume || !context.jobDescription) && <p className="small faint">Add your résumé and the job description so answers use your real experience.</p>}
      <button className="btn btn--primary btn--lg" disabled={!ready || disabled} onClick={() => { stopCheck(); onStart(); }}>{starting ? "Starting…" : "Start interview session →"}</button>
    </div>
  </section>;
}
