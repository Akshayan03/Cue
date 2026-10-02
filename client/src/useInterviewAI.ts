import { useCallback, useEffect, useRef, useState } from "react";
import { ChatTurn, InterviewContext } from "./interview";
import { CoachMode } from "./electron";

type InterviewRequest = { context: InterviewContext; question: string; kind: "prep" | "live"; transcript?: string; mode?: CoachMode; includeScreen?: boolean };

export function useInterviewAI(initialHistory: ChatTurn[] = []) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatTurn[]>(initialHistory);
  const [latency, setLatency] = useState<number | null>(null);
  const current = useRef<{ id: string; text: string; question: string; started: number } | null>(null);
  const historyRef = useRef<ChatTurn[]>(initialHistory);
  const lastOptions = useRef<InterviewRequest | null>(null);

  useEffect(() => {
    const off = window.electron?.onSessionStream((event) => {
      const request = current.current;
      if (!request || event.id !== request.id) return;
      if (event.type === "delta") {
        if (!request.text) setLatency(Date.now() - request.started);
        request.text += event.text;
        setAnswer(request.text);
      } else {
        if (event.type === "done") {
          const text = event.text || request.text;
          setAnswer(text);
          historyRef.current = [...historyRef.current, { role: "user", text: request.question }, { role: "assistant", text }].slice(-24) as ChatTurn[];
          setHistory(historyRef.current);
        } else setError(event.text);
        current.current = null;
        setBusy(false);
      }
    });
    return () => {
      off?.();
      if (current.current) window.electron?.cancelResponse(current.current.id).catch(() => {});
    };
  }, []);

  const cancel = useCallback(() => {
    if (current.current) window.electron?.cancelResponse(current.current.id).catch(() => {});
    current.current = null;
    setBusy(false);
  }, []);

  const respond = useCallback((options: InterviewRequest) => {
    if (!window.electron) return;
    lastOptions.current = options;
    const id = crypto.randomUUID();
    current.current = { id, text: "", question: options.question, started: Date.now() };
    setBusy(true);
    setAnswer("");
    setLatency(null);
    setError(null);
    window.electron.respond({ ...options, id, history: historyRef.current }).catch((e) => {
      if (current.current?.id !== id) return;
      setError(e instanceof Error ? e.message : "Couldn't reach Claude.");
      current.current = null;
      setBusy(false);
    });
  }, []);

  const retry = useCallback(() => {
    if (lastOptions.current) respond(lastOptions.current);
  }, [respond]);

  const clear = useCallback(() => {
    cancel();
    historyRef.current = [];
    lastOptions.current = null;
    setHistory([]);
    setAnswer("");
    setError(null);
    setLatency(null);
  }, [cancel]);

  return { answer, busy, error, history, latency, respond, cancel, clear, retry };
}
