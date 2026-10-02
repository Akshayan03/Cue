import { monitorAudio, openInterviewAudio, AudioHealth } from "./callAudio";

class FakeTrack extends EventTarget {
  readyState = "live";
  enabled = true;
  muted = false;
  stop = jest.fn(() => { this.readyState = "ended"; });
}
let audio: FakeTrack, video: FakeTrack;
let media: EventTarget & { getDisplayMedia: jest.Mock; getUserMedia: jest.Mock };
let level = 0;
let contexts: FakeContext[];
class FakeContext {
  state = "running";
  destination = {};
  close = jest.fn().mockResolvedValue(undefined);
  resume = jest.fn().mockResolvedValue(undefined);
  constructor() { contexts.push(this); }
  createMediaStreamSource() { return { connect: jest.fn(), disconnect: jest.fn() }; }
  createAnalyser() { return { fftSize: 2048, connect: jest.fn(), disconnect: jest.fn(), getFloatTimeDomainData: (samples: Float32Array) => samples.fill(level) }; }
  createGain() { return { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() }; }
}
const stream = () => ({ getAudioTracks: () => [audio], getTracks: () => [audio, video] }) as unknown as MediaStream;
beforeEach(() => {
  jest.useFakeTimers();
  audio = new FakeTrack(); video = new FakeTrack(); level = 0; contexts = [];
  media = Object.assign(new EventTarget(), { getDisplayMedia: jest.fn().mockResolvedValue(stream()), getUserMedia: jest.fn().mockResolvedValue(stream()) });
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: media });
  global.AudioContext = FakeContext as any;
  global.MediaStream = class { constructor(public tracks: unknown[]) {} } as any;
  window.electron = { audioSupport: jest.fn().mockResolvedValue({ supported: true, screenPermission: "granted" }), prepareAudioCapture: jest.fn().mockResolvedValue(undefined), promptAudioPermission: jest.fn().mockResolvedValue(undefined), ensureMic: jest.fn().mockResolvedValue("granted") } as any;
});
afterEach(() => { jest.useRealTimers(); delete window.electron; });

test("call capture requests unprocessed system audio and never opens or mutes the microphone", async () => {
  expect(await openInterviewAudio("system")).toBeDefined();
  expect(window.electron?.prepareAudioCapture).toHaveBeenCalledTimes(1);
  expect((window.electron?.prepareAudioCapture as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(media.getDisplayMedia.mock.invocationCallOrder[0]);
  expect(media.getDisplayMedia.mock.calls[0][0]).toMatchObject({ systemAudio: "include", audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  expect(media.getUserMedia).not.toHaveBeenCalled();
  expect(window.electron?.ensureMic).not.toHaveBeenCalled();
  expect(audio.stop).not.toHaveBeenCalled();
  expect(video.stop).not.toHaveBeenCalled();
});

test("call audio does not depend on Screen Recording; unsupported systems and ended tracks are errors, never microphone fallbacks", async () => {
  (window.electron?.audioSupport as jest.Mock).mockResolvedValueOnce({ supported: true, screenPermission: "denied" });
  expect(await openInterviewAudio("system")).toBeDefined();
  (window.electron?.audioSupport as jest.Mock).mockResolvedValueOnce({ supported: false, screenPermission: "granted" });
  await expect(openInterviewAudio("system")).rejects.toThrow(/macOS 14\.2/);
  expect(media.getDisplayMedia).toHaveBeenCalledTimes(1);
  expect(window.electron?.promptAudioPermission).not.toHaveBeenCalled();
  audio.readyState = "ended";
  await expect(openInterviewAudio("system")).rejects.toThrow(/already ended.*System Audio Recording Only/);
  expect(window.electron?.promptAudioPermission).toHaveBeenCalledTimes(1);
  expect(video.stop).toHaveBeenCalled();
  expect(media.getUserMedia).not.toHaveBeenCalled();
});

test("a failed system capture prompts to open System Audio Recording settings", async () => {
  media.getDisplayMedia.mockRejectedValueOnce(new Error("Permission denied"));
  await expect(openInterviewAudio("system")).rejects.toThrow(/Permission denied.*System Audio Recording Only/);
  expect(window.electron?.promptAudioPermission).toHaveBeenCalledTimes(1);
});

test("microphone mode remains explicit and separate from system audio", async () => {
  await openInterviewAudio("microphone");
  expect(window.electron?.ensureMic).toHaveBeenCalledTimes(1);
  expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true });
  expect(media.getDisplayMedia).not.toHaveBeenCalled();
});

test("a live but silent track does not count as receiving audio; PCM drives the meter", () => {
  let health: AudioHealth;
  const stop = monitorAudio(stream(), next => { health = next; });
  expect(health!.state).toBe("waiting");
  jest.advanceTimersByTime(12500);
  expect(health!.state).toBe("quiet");
  expect(health!.hasSignal).toBe(false);
  level = 0.05;
  jest.advanceTimersByTime(100);
  expect(health!.state).toBe("receiving");
  expect(health!.level).toBeGreaterThan(0);
  expect(health!.hasSignal).toBe(true);
  level = 0;
  jest.advanceTimersByTime(12500);
  expect(health!.state).toBe("quiet");
  expect(health!.hasSignal).toBe(true);
  stop();
  expect(contexts[0].close).toHaveBeenCalled();
});

test("mute, ended, and device-change events are detected and cleaned up", () => {
  let health: AudioHealth;
  const stop = monitorAudio(stream(), next => { health = next; });
  audio.muted = true; audio.dispatchEvent(new Event("mute"));
  expect(health!.state).toBe("muted");
  media.dispatchEvent(new Event("devicechange"));
  expect(health!.deviceChanged).toBe(true);
  audio.readyState = "ended"; audio.dispatchEvent(new Event("ended"));
  expect(health!.state).toBe("ended");
  stop();
  expect(jest.getTimerCount()).toBe(0);
});
