import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Transcript } from "../types";
import { saveRecording } from "../storage";
import { useTranscriber } from "../useTranscriber";

interface RecordProps {
  setSavedTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>>;
}

function fmt(totalSec: number): string {
  const s = Math.floor(totalSec % 60);
  const m = Math.floor(totalSec / 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
}

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
];

const Record: React.FC<RecordProps> = ({ setSavedTranscripts }) => {
  const navigate = useNavigate();
  const [language, setLanguage] = useState("english");
  const transcriber = useTranscriber(language);

  const [captureMic, setCaptureMic] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const recordingRef = useRef(false);

  const getElapsed = useCallback(() => (Date.now() - startTimeRef.current) / 1000, []);

  const cleanupStreams = useCallback(() => {
    tracksRef.current.forEach((tr) => tr.stop());
    tracksRef.current = [];
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    transcriber.stop();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    cleanupStreams();
  }, [cleanupStreams, transcriber]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (recordedBlob) {
      setRecordedBlob(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    transcriber.reset();
    chunksRef.current = [];

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const tracks: MediaStreamTrack[] = [...display.getTracks()];

      // Mix system/tab audio + mic into one track so the recording AND the
      // transcript hear everyone.
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      let mixedAny = false;

      if (display.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(display).connect(dest);
        mixedAny = true;
      }
      if (captureMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioCtx.createMediaStreamSource(mic).connect(dest);
          tracks.push(...mic.getAudioTracks());
          mixedAny = true;
        } catch {
          /* mic denied — continue */
        }
      }

      const combined = new MediaStream();
      display.getVideoTracks().forEach((t) => combined.addTrack(t));
      if (mixedAny) dest.stream.getAudioTracks().forEach((t) => combined.addTrack(t));

      tracksRef.current = tracks;
      audioCtxRef.current = audioCtx;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = display;

      const recorder = new MediaRecorder(combined, { mimeType: pickMimeType() });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: pickMimeType() });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };
      recorder.start(1000);

      display.getVideoTracks()[0].addEventListener("ended", () => stopRecording());

      startTimeRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed(getElapsed()), 250);

      // Feed the mixed audio to the local Whisper transcriber.
      if (mixedAny) transcriber.start(dest.stream, getElapsed);

      recordingRef.current = true;
      setRecording(true);
    } catch (err) {
      setError("Couldn't start screen capture. Grant screen-sharing permission and pick a screen, window, or tab.");
      cleanupStreams();
    }
  }, [captureMic, recordedBlob, previewUrl, transcriber, stopRecording, cleanupStreams, getElapsed]);

  useEffect(
    () => () => {
      if (recordingRef.current) stopRecording();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const liveText = transcriber.segments.map((s) => s.text).join(" ");

  const save = async () => {
    const content = liveText.trim();
    if (!name.trim()) return setError("Give this meeting a name first.");
    if (!recordedBlob && !content) return setError("Nothing to save yet.");

    const id = Date.now();
    if (recordedBlob) {
      try {
        await saveRecording(id, recordedBlob);
      } catch {
        setError("Couldn't store the recording locally, but the transcript was saved.");
      }
    }

    const transcript: Transcript = {
      id,
      name: name.trim(),
      content,
      segments: transcriber.segments,
      date: new Date().toISOString(),
      durationSec: Math.round(elapsed),
      hasRecording: Boolean(recordedBlob),
      brief: null,
    };
    setSavedTranscripts((prev) => [transcript, ...prev]);
    navigate("/library");
  };

  const discard = () => {
    setRecordedBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    transcriber.reset();
    setName("");
    setElapsed(0);
    setError(null);
  };

  const modelLoading = transcriber.status === "loading";

  return (
    <div className="page">
      {error && <div className="alert alert--error">{error}</div>}
      {transcriber.error && <div className="alert alert--error">Transcription: {transcriber.error}</div>}

      {!recording && !recordedBlob && (
        <section>
          <div className="switch-row">
            <div>
              <div className="switch-label">Transcript language</div>
              <div className="switch-sub">Speech is transcribed on-device — audio never leaves your machine</div>
            </div>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="switch-row">
            <div>
              <div className="switch-label">Record my microphone</div>
              <div className="switch-sub">Mix your voice into the recording and transcript</div>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={captureMic}
              onChange={(e) => setCaptureMic(e.target.checked)}
            />
          </div>
          <div className="btn-row">
            <button className="btn btn--primary btn--lg" onClick={startRecording}>
              Start recording
            </button>
          </div>
          <p className="small faint mt">
            First recording downloads a small speech model (~40&nbsp;MB), then it's cached. When
            sharing a tab, tick <em>"Share tab audio"</em> to capture other participants.
          </p>
        </section>
      )}

      {recording && (
        <section className="card">
          <div className="rec-bar">
            <span className="rec-dot" /> Recording
            <span className="rec-timer">{fmt(elapsed)}</span>
            <button className="btn btn--danger" onClick={stopRecording}>
              Stop
            </button>
          </div>
          <video ref={liveVideoRef} className="preview" autoPlay muted playsInline />
          <h3>
            Live transcript{" "}
            {modelLoading && (
              <span className="muted small">
                · loading model {transcriber.progress > 0 ? `${Math.round(transcriber.progress * 100)}%` : "…"}
              </span>
            )}
            {!modelLoading && transcriber.pending > 0 && <span className="muted small">· transcribing…</span>}
          </h3>
          <div className="transcript-live">
            {liveText || <span className="muted">{modelLoading ? "Preparing Whisper…" : "Listening…"}</span>}
          </div>
        </section>
      )}

      {!recording && recordedBlob && (
        <section className="card">
          <h2>Review &amp; save</h2>
          {previewUrl && <video src={previewUrl} className="preview" controls playsInline />}
          {transcriber.pending > 0 && <p className="muted small">Finishing transcription…</p>}
          <label className="field">
            <span>Meeting name</span>
            <input
              type="text"
              placeholder="e.g. Q3 Planning sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="muted small">
            Length {fmt(elapsed)} · {transcriber.segments.length} transcript segments
          </p>
          <div className="btn-row">
            <button className="btn btn--primary" onClick={save}>
              Save to library
            </button>
            <button className="btn" onClick={discard}>
              Discard
            </button>
          </div>
          {liveText && (
            <details className="mt">
              <summary>Preview transcript</summary>
              <p className="transcript-live">{liveText}</p>
            </details>
          )}
        </section>
      )}
    </div>
  );
};

export default Record;
