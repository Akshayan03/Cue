import { act, renderHook } from "@testing-library/react";
import { useInterviewAI } from "./useInterviewAI";
import { emptyContext } from "./interview";

let emit: (event: { id: string; type: "delta" | "done" | "error"; text: string }) => void;
let respond: jest.Mock;
let cancel: jest.Mock;
beforeEach(() => {
  let next = 0;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => `request-${++next}` } });
  respond = jest.fn().mockResolvedValue(undefined);
  cancel = jest.fn().mockResolvedValue(undefined);
  window.electron = { respond, cancelResponse: cancel, onSessionStream: (listener: typeof emit) => { emit = listener; return jest.fn(); } } as any;
});
afterEach(() => { delete window.electron; });

test("streams first text, keeps prep history, and sends that history on the next request", () => {
  const { result } = renderHook(() => useInterviewAI());
  act(() => result.current.respond({ context: emptyContext(), kind: "prep", question: "I led two engineers" }));
  act(() => emit({ id: "request-1", type: "delta", text: "Use that real example." }));
  expect(result.current.answer).toBe("Use that real example.");
  expect(result.current.latency).not.toBeNull();
  act(() => emit({ id: "request-1", type: "done", text: "Use that real example." }));
  expect(result.current.busy).toBe(false);
  act(() => result.current.respond({ context: emptyContext(), kind: "live", question: "Tell me about leadership" }));
  expect(respond.mock.calls[1][0].history[0]).toEqual({ role: "user", text: "I led two engineers" });
});

test("superseded and cancelled requests cannot overwrite the newest answer", () => {
  const { result } = renderHook(() => useInterviewAI());
  const ask = (question: string) => result.current.respond({ context: emptyContext(), kind: "live", question });
  act(() => ask("old question"));
  act(() => ask("new question"));
  act(() => emit({ id: "request-1", type: "done", text: "stale answer" }));
  expect(result.current.answer).toBe("");
  act(() => emit({ id: "request-2", type: "delta", text: "current answer" }));
  expect(result.current.answer).toBe("current answer");
  act(() => result.current.cancel());
  act(() => emit({ id: "request-2", type: "delta", text: "ignore this" }));
  expect(result.current.answer).toBe("current answer");
  expect(cancel).toHaveBeenCalledWith("request-2");
});

test("authentication errors are displayed, not recorded as successful answers", () => {
  const { result } = renderHook(() => useInterviewAI());
  act(() => result.current.respond({ context: emptyContext(), kind: "prep", question: "Build a brief" }));
  act(() => emit({ id: "request-1", type: "error", text: "OAuth access token has expired" }));
  expect(result.current.error).toMatch(/expired/);
  expect(result.current.busy).toBe(false);
  expect(result.current.history).toEqual([]);
  act(() => result.current.retry());
  expect(respond.mock.calls[1][0].question).toBe("Build a brief");
  expect(respond.mock.calls[1][0].id).not.toBe("request-1");
});
