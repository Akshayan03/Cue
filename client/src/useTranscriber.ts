import { useCallback, useEffect, useRef, useState } from "react";
import { TranscriptSegment } from "./types";

const SAMPLE_RATE = 16000; // Whisper expects 16 kHz mono
const CHUNK_SECONDS = 6;
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;
const MIN_FLUSH_SAMPLES = SAMPLE_RATE * 1; // don't bother transcribing <1s tails

// Whisper sometimes emits these for silence/music — filter them out.
const NOISE = /^\s*(\[.*\]|\(.*\)|you|thanks for watching\.?)\s*$/i;

export type TranscriberStatus = "idle" | "loading" | "ready" | "error";

function modelFor(language: string): string {
  return language === "english" ? "Xenova/whisper-tiny.en" : "Xenova/whisper-tiny";
}

export function useTranscriber(language: string) {
  const [status, setStatus] = useState<TranscriberStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const chunkRef = useRef<Float32Array>(new Float32Array(CHUNK_SAMPLES));
  const offsetRef = useRef(0);
  const chunkStartRef = useRef(0);
  const getElapsedRef = useRef<() => number>(() => 0);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const url = `${process.env.PUBLIC_URL || ""}/transcriber.worker.js`;
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
        setPending((n) => Math.max(0, n - 1));
        const text: string = d.text;
        if (text && !NOISE.test(text)) {
          setSegments((prev) => [...prev, { t: d.t as number, text }]);
        }
      } else if (d.type === "error") {
        setPending((n) => Math.max(0, n - 1));
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
    };
    workerRef.current = worker;
    return worker;
  }, []);

  const flush = useCallback((force = false) => {
    const len = offsetRef.current;
    if (len === 0) return;
    if (!force && len < CHUNK_SAMPLES) return;
    if (force && len < MIN_FLUSH_SAMPLES) {
      offsetRef.current = 0;
      return;
    }
    const out = chunkRef.current.slice(0, len);
    offsetRef.current = 0;
    setPending((n) => n + 1);
    ensureWorker().postMessage(
      { type: "audio", audio: out, t: chunkStartRef.current, model: modelFor(language), language },
      [out.buffer]
    );
  }, [ensureWorker, language]);

  const start = useCallback(
    (audioStream: MediaStream, getElapsed: () => number) => {
      setError(null);
      setSegments([]);
      setPending(0);
      offsetRef.current = 0;
      getElapsedRef.current = getElapsed;

      const worker = ensureWorker();
      setStatus((s) => (s === "ready" ? s : "loading"));
      worker.postMessage({ type: "load", model: modelFor(language) });

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(audioStream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;

      proc.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let read = 0;
        while (read < input.length) {
          if (offsetRef.current === 0) {
            chunkStartRef.current = Math.max(0, getElapsedRef.current());
          }
          const space = CHUNK_SAMPLES - offsetRef.current;
          const n = Math.min(space, input.length - read);
          chunkRef.current.set(input.subarray(read, read + n), offsetRef.current);
          offsetRef.current += n;
          read += n;
          if (offsetRef.current >= CHUNK_SAMPLES) flush();
        }
      };

      // Route through a muted gain node so the processor runs without echoing audio.
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(proc);
      proc.connect(silent);
      silent.connect(ctx.destination);
    },
    [ensureWorker, flush, language]
  );

  const stop = useCallback(() => {
    flush(true); // transcribe whatever is left
    procRef.current?.disconnect();
    procRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, [flush]);

  const reset = useCallback(() => {
    setSegments([]);
    setError(null);
    setPending(0);
    offsetRef.current = 0;
  }, []);

  useEffect(
    () => () => {
      procRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
      workerRef.current?.terminate();
    },
    []
  );

  return { status, progress, pending, error, segments, start, stop, reset };
}
