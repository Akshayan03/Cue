import { AudioSource } from "./interview";

export const CALL_AUDIO_HELP = "On a Mac, turn on Cue under System Settings → Privacy & Security → Screen & System Audio Recording → System Audio Recording Only, then reopen Cue.";

export function stopAudioCapture(stream: MediaStream | null) {
  stream?.getTracks().forEach(track => track.stop());
}

/** One acquisition path for preflight, live sessions, and reconnect. */
export async function openInterviewAudio(source: AudioSource): Promise<MediaStream> {
  let stream: MediaStream;
  if (source === "system") {
    const support = await window.electron?.audioSupport?.();
    if (support && !support.supported) throw new Error("System call audio requires macOS 14.2+ or Windows. Microphone mode does not capture calls playing in headphones.");
    try {
      // Audio-only: the main process supplies Cue's own window as the video
      // source, so Screen Recording isn't needed. Keep that track alive for
      // the loopback's lifetime, but never render, record, or upload it.
      // No microphone audio is requested here.
      await window.electron?.prepareAudioCapture?.();
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 1, max: 1 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        systemAudio: "include",
      } as DisplayMediaStreamOptions);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Capture was cancelled.";
      throw new Error(`Couldn't capture call audio: ${reason} ${CALL_AUDIO_HELP}`);
    }
  } else {
    if (window.electron?.ensureMic && await window.electron.ensureMic() !== "granted") throw new Error("Allow Microphone access for Cue in System Settings.");
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  if (!stream.getAudioTracks().some(track => track.readyState === "live" && track.enabled)) {
    stopAudioCapture(stream);
    throw new Error(source === "system" ? `No call audio was shared, or its audio track already ended. macOS may be blocking system audio. ${CALL_AUDIO_HELP}` : "No active microphone audio track was returned.");
  }
  return stream;
}

export type AudioHealth = {
  state: "waiting" | "receiving" | "quiet" | "muted" | "ended" | "suspended" | "error";
  level: number;
  hasSignal: boolean;
  deviceChanged: boolean;
};
export const initialAudioHealth = (): AudioHealth => ({ state: "waiting", level: 0, hasSignal: false, deviceChanged: false });

/** Monitors actual PCM samples, not merely the existence of an audio track.
 * Audio is never recorded or sent to AI by this check. */
export function monitorAudio(stream: MediaStream, update: (health: AudioHealth) => void): () => void {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const silent = context.createGain();
  silent.gain.value = 0; // never play captured call audio back into the call
  source.connect(analyser);
  analyser.connect(silent);
  silent.connect(context.destination);
  const samples = new Float32Array(analyser.fftSize);
  const tracks = stream.getAudioTracks();
  let disposed = false;
  let lastSignal = Date.now();
  let hasSignal = false;
  let deviceChanged = false;
  let resumeFailed = false;
  if (context.state === "suspended") context.resume().catch(() => { resumeFailed = true; });
  const sample = () => {
    if (disposed) return;
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const live = tracks.filter(track => track.readyState === "live" && track.enabled);
    const muted = live.length > 0 && live.every(track => track.muted);
    if (rms >= 0.002 && context.state === "running" && live.length && !muted) { lastSignal = Date.now(); hasSignal = true; }
    const state: AudioHealth["state"] = !live.length ? "ended" : resumeFailed ? "error" : context.state !== "running" ? "suspended" : muted ? "muted" : hasSignal && Date.now() - lastSignal < 1500 ? "receiving" : Date.now() - lastSignal >= 12000 ? "quiet" : "waiting";
    const level = state === "receiving" ? Math.round(Math.max(0, Math.min(100, (20 * Math.log10(Math.max(rms, 0.00001)) + 60) / 60 * 100))) : 0;
    update({ state, level, hasSignal, deviceChanged });
  };
  const devicesChanged = () => { deviceChanged = true; hasSignal = false; lastSignal = Date.now(); sample(); };
  navigator.mediaDevices.addEventListener?.("devicechange", devicesChanged);
  tracks.forEach(track => ["ended", "mute", "unmute"].forEach(name => track.addEventListener(name, sample)));
  sample();
  const timer = window.setInterval(sample, 100);
  return () => {
    if (disposed) return;
    disposed = true;
    window.clearInterval(timer);
    navigator.mediaDevices.removeEventListener?.("devicechange", devicesChanged);
    tracks.forEach(track => ["ended", "mute", "unmute"].forEach(name => track.removeEventListener(name, sample)));
    source.disconnect(); analyser.disconnect(); silent.disconnect();
    context.close().catch(() => {});
  };
}
