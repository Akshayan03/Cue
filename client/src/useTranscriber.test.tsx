import { act, renderHook } from "@testing-library/react";
import { useTranscriber } from "./useTranscriber";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: any) => void) | null = null;
  onerror = null;
  postMessage = jest.fn();
  terminate = jest.fn();
  constructor() { FakeWorker.instances.push(this); }
  reply(data: object) { this.onmessage?.({ data }); }
}
let processor: { onaudioprocess?: (e: any) => void; connect: jest.Mock; disconnect: jest.Mock };
class FakeAudioContext {
  destination = {};
  createMediaStreamSource() { return { connect: jest.fn(), disconnect: jest.fn() }; }
  createScriptProcessor() { processor = { connect: jest.fn(), disconnect: jest.fn() }; return processor; }
  createGain() { return { gain: { value: 1 }, connect: jest.fn() }; }
  close() { return Promise.resolve(); }
}
const audioBlocks = (count: number, volume = 0.1) => {
  for (let i = 0; i < count; i++) processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(volume) } });
};
const lastAudio = (worker: FakeWorker) => worker.postMessage.mock.calls.map(call => call[0]).filter(message => message.type === "audio").pop();
beforeEach(() => {
  FakeWorker.instances = [];
  global.Worker = FakeWorker as any;
  global.AudioContext = FakeAudioContext as any;
});

test("finish waits for an in-flight interim and then returns the final spoken tail", async () => {
  const { result } = renderHook(() => useTranscriber("english"));
  await act(async () => { await result.current.start({} as MediaStream, () => 5); });
  const worker = FakeWorker.instances[0];
  act(() => audioBlocks(8));
  const interim = lastAudio(worker);
  expect(interim.final).toBe(false);
  let finished: Promise<any>;
  act(() => { finished = result.current.finish(); });
  let resolved = false;
  finished!.then(() => { resolved = true; });
  await act(async () => { await Promise.resolve(); });
  expect(resolved).toBe(false);
  act(() => worker.reply({ type: "text", gen: interim.gen, t: interim.t, final: false, text: "partial" }));
  const final = lastAudio(worker);
  expect(final.final).toBe(true);
  await act(async () => {
    worker.reply({ type: "text", gen: final.gen, t: final.t, final: true, text: "All final words [BLANK_AUDIO]" });
    expect(await finished).toEqual([{ t: 5, text: "All final words" }]);
  });
  expect(result.current.interim).toBe("");
});

test("a new recording ignores late worker results without clearing its pending inference", async () => {
  const { result } = renderHook(() => useTranscriber("english"));
  await act(async () => { await result.current.start({} as MediaStream, () => 0); });
  const oldWorker = FakeWorker.instances[0];
  act(() => audioBlocks(8));
  const old = lastAudio(oldWorker);
  act(() => { result.current.stop(); result.current.reset(); });
  await act(async () => { await result.current.start({} as MediaStream, () => 0); });
  act(() => audioBlocks(8));
  expect(result.current.pending).toBe(1);
  act(() => oldWorker.reply({ type: "text", gen: old.gen, t: 0, final: true, text: "stale words" }));
  expect(result.current.pending).toBe(1);
  expect(result.current.segments).toEqual([]);
  expect(oldWorker.terminate).toHaveBeenCalled();
});

test("short questions finalize at a pause and worker errors reject finalization", async () => {
  const { result } = renderHook(() => useTranscriber("english"));
  await act(async () => { await result.current.start({} as MediaStream, () => 0); });
  const worker = FakeWorker.instances[0];
  act(() => audioBlocks(8));
  const first = lastAudio(worker);
  act(() => audioBlocks(3, 0));
  act(() => worker.reply({ type: "text", gen: first.gen, t: 0, final: false, text: "Why this company?" }));
  expect(lastAudio(worker).final).toBe(true);
  expect(result.current.speaking).toBe(false);
  await act(async () => {
    const done = result.current.finish();
    const assertion = expect(done).rejects.toThrow("model unavailable");
    worker.reply({ type: "error", gen: first.gen, error: "model unavailable" });
    await assertion;
  });
});

test("replacing the input after a headset change retains previous segments and the worker", async () => {
  const { result } = renderHook(() => useTranscriber("english"));
  await act(async () => { await result.current.start({} as MediaStream, () => 0); });
  const worker = FakeWorker.instances[0];
  act(() => audioBlocks(8));
  const first = lastAudio(worker);
  act(() => worker.reply({ type: "text", gen: first.gen, t: 0, final: true, text: "Previous question" }));
  await act(async () => { await result.current.replaceStream({} as MediaStream); });
  expect(result.current.segments).toEqual([{ t: 0, text: "Previous question" }]);
  expect(FakeWorker.instances).toHaveLength(1);
  act(() => audioBlocks(8));
  const next = lastAudio(worker);
  act(() => worker.reply({ type: "text", gen: next.gen, t: 5, final: true, text: "New question after reconnect" }));
  expect(result.current.segments).toHaveLength(2);
});
