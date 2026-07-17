import { useCallback, useEffect, useRef, useState } from "react";
import { TranscriptSegment } from "./types";

const SAMPLE_RATE = 16000; // Whisper expects 16 kHz mono
// Rolling-window streaming: keep the current stretch of speech in one buffer,
// re-transcribe the WHOLE window every few seconds (replacing the interim
// text), and only commit it as a final segment once the window is full. This
// gives Whisper full context every pass — no words chopped at chunk
// boundaries, no burst-y transcript, no backlog when inference runs slow
// (a new pass simply isn't scheduled until the previous one finishes).
const WINDOW_MAX_S = 20; // hard cap: commit the window once it grows past this
const PAUSE_COMMIT_S = 8; // prefer committing at a silence once this long
const MIN_NEW_AUDIO_S = 2; // don't re-run until this much new audio arrived
const MIN_COMMIT_SAMPLES = SAMPLE_RATE * 1; // ignore sub-1s tails on stop
const QUIET_RMS = 0.01; // block RMS below this counts as silence
const QUIET_BLOCKS = 3; // ~0.75s of consecutive quiet blocks = a pause

// Whisper sometimes emits these for silence/music — filter them out.
const NOISE = /^\s*(\[.*\]|\(.*\)|you|thanks for watching\.?)\s*$/i;

export type TranscriberStatus = "idle" | "loading" | "ready" | "error";

function modelFor(language: string): string {
  return language === "english" ? "Xenova/whisper-tiny.en" : "Xenova/whisper-tiny";
}

export function useTranscriber(language: string) {
  const [status, setStatus] = useState<TranscriberStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(0); // 1 while an inference is in flight
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  /** Latest transcription of the in-progress window — REPLACED on each pass. */
  const [interim, setInterim] = useState("");

  const workerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);

  // Rolling window of the current utterance (list of buffers, no realloc).
  const winRef = useRef<Float32Array[]>([]);
  const winLenRef = useRef(0);
  const winStartRef = useRef(0); // seconds since capture start
  const lastRunLenRef = useRef(0); // window length when the last pass started
  const postedLenRef = useRef(0); // window length included in the in-flight pass
  const busyRef = useRef(false);
  const activeRef = useRef(false);
  const quietBlocksRef = useRef(0);
  const inPauseRef = useRef(false); // trailing ~0.75s of the window is silence
  const genRef = useRef(0); // bumped on reset/start so stale results are dropped
  const getElapsedRef = useRef<() => number>(() => 0);
  const langRef = useRef(language);
  langRef.current = language;

  const maybeRun = useCallback((force = false) => {
    const worker = workerRef.current;
    if (!worker || busyRef.current) return;
    const len = winLenRef.current;
    if (len === 0) return;
    if (force && len < MIN_COMMIT_SAMPLES) {
      winRef.current = [];
      winLenRef.current = 0;
      return;
    }
    // Commit early at a natural pause so window boundaries land BETWEEN
    // sentences — a hard cut mid-word gets mis-heard by both passes.
    const final =
      force ||
      len >= SAMPLE_RATE * WINDOW_MAX_S ||
      (inPauseRef.current && len >= SAMPLE_RATE * PAUSE_COMMIT_S);
    const fresh = len - lastRunLenRef.current;
    if (!final && fresh < SAMPLE_RATE * MIN_NEW_AUDIO_S) return;

    const audio = new Float32Array(len);
    let off = 0;
    for (const b of winRef.current) {
      audio.set(b, off);
      off += b.length;
    }
    busyRef.current = true;
    setPending(1);
    postedLenRef.current = len;
    lastRunLenRef.current = len;
    worker.postMessage(
      {
        type: "audio",
        audio,
        t: winStartRef.current,
        gen: genRef.current,
        final,
        model: modelFor(langRef.current),
        language: langRef.current,
      },
      [audio.buffer]
    );
  }, []);

  const ensureWorker = useCallback(async () => {
    if (workerRef.current) return workerRef.current;
    let url = `${process.env.PUBLIC_URL || ""}/transcriber.worker.js`;
    // Packaged app: Chromium won't start module workers from the app://
    // scheme, so pull the source over IPC and boot from a blob: URL.
    if (window.location.protocol === "app:" && window.electron?.workerSource) {
      const src = await window.electron.workerSource();
      url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    }
    const worker = new Worker(url, { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === "progress") {
        if (d.data?.status === "progress" && typeof d.data.progress === "number") {
          setProgress(d.data.progress / 100);
        }
      } else if (d.type === "ready") {
        setStatus("ready");
        setProgress(1);
      } else if (d.type === "text") {
        busyRef.current = false;
        setPending(0);
        if (d.gen !== genRef.current) return; // from before a reset — drop
        // Strip inline noise annotations ([Music], [BLANK_AUDIO], …) Whisper
        // adds over silence — they pollute the transcript and hide a trailing
        // "?" from the auto-answer detector.
        const text: string = (d.text || "").replace(/\[[^\]]{0,30}\]/g, " ").replace(/\s+/g, " ").trim();
        const clean = text && !NOISE.test(text) ? text : "";
        if (d.final) {
          if (clean) setSegments((prev) => [...prev, { t: d.t as number, text: clean }]);
          // Drop the samples that pass covered; keep audio that arrived since.
          let drop = postedLenRef.current;
          const kept: Float32Array[] = [];
          for (const b of winRef.current) {
            if (drop >= b.length) {
              drop -= b.length;
              continue;
            }
            kept.push(drop > 0 ? b.subarray(drop) : b);
            drop = 0;
          }
          winRef.current = kept;
          winLenRef.current = kept.reduce((n, b) => n + b.length, 0);
          winStartRef.current = (d.t as number) + postedLenRef.current / SAMPLE_RATE;
          lastRunLenRef.current = 0;
          setInterim("");
        } else {
          setInterim(clean);
        }
        // Keep the loop going: finalize the tail after stop(), or pick up
        // audio that accumulated during this pass.
        if (!activeRef.current) {
          if (winLenRef.current >= MIN_COMMIT_SAMPLES) maybeRun(true);
        } else {
          maybeRun();
        }
      } else if (d.type === "error") {
        busyRef.current = false;
        setPending(0);
        setError(d.error);
        setStatus("error");
      }
    };
    // Surface load/parse failures (e.g. the worker script or the model CDN is
    // unreachable) instead of hanging forever on "loading model…".
    worker.onerror = (e: ErrorEvent) => {
      setError(
        e.message ||
          "The transcription engine failed to load. Check your internet connection (the speech model downloads on first use) and try again."
      );
      setStatus("error");
      setPending(0);
      busyRef.current = false;
    };
    workerRef.current = worker;
    return worker;
  }, [maybeRun]);

  const start = useCallback(
    async (audioStream: MediaStream, getElapsed: () => number) => {
      setError(null);
      setSegments([]);
      setInterim("");
      setPending(0);
      winRef.current = [];
      winLenRef.current = 0;
      lastRunLenRef.current = 0;
      busyRef.current = false;
      genRef.current += 1;
      getElapsedRef.current = getElapsed;

      setStatus((s) => (s === "ready" ? s : "loading"));
      let worker: Worker;
      try {
        worker = await ensureWorker();
      } catch (e) {
        setError("Couldn't start the transcription engine.");
        setStatus("error");
        return;
      }
      worker.postMessage({ type: "load", model: modelFor(langRef.current) });

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(audioStream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      activeRef.current = true;

      proc.onaudioprocess = (e) => {
        if (!activeRef.current) return;
        if (winLenRef.current === 0) {
          winStartRef.current = Math.max(0, getElapsedRef.current());
        }
        const data = e.inputBuffer.getChannelData(0);
        // Cheap pause detection: sampled RMS of each ~256ms block.
        let sum = 0;
        for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / (data.length / 16));
        quietBlocksRef.current = rms < QUIET_RMS ? quietBlocksRef.current + 1 : 0;
        inPauseRef.current = quietBlocksRef.current >= QUIET_BLOCKS;
        // Copy — the input buffer is reused by the audio pipeline.
        winRef.current.push(new Float32Array(data));
        winLenRef.current += data.length;
        maybeRun();
      };

      // Route through a muted gain node so the processor runs without echoing audio.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(proc);
      proc.connect(silent);
      silent.connect(ctx.destination);
    },
    [ensureWorker, maybeRun]
  );

  const stop = useCallback(() => {
    activeRef.current = false;
    procRef.current?.disconnect();
    procRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    // Finalize whatever is left; if a pass is in flight, the completion
    // handler chains the final run.
    if (!busyRef.current) maybeRun(true);
  }, [maybeRun]);

  const reset = useCallback(() => {
    setSegments([]);
    setInterim("");
    setError(null);
    setPending(0);
    winRef.current = [];
    winLenRef.current = 0;
    lastRunLenRef.current = 0;
    genRef.current += 1;
  }, []);

  useEffect(
    () => () => {
      activeRef.current = false;
      procRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
      workerRef.current?.terminate();
    },
    []
  );

  return { status, progress, pending, error, segments, interim, start, stop, reset };
}
