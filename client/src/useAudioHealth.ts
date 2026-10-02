import { useEffect, useState } from "react";
import { AudioHealth, initialAudioHealth, monitorAudio } from "./callAudio";

export function useAudioHealth(stream: MediaStream | null) {
  const [health, setHealth] = useState<AudioHealth>(initialAudioHealth);
  useEffect(() => {
    setHealth(initialAudioHealth());
    if (!stream) return;
    try { return monitorAudio(stream, setHealth); }
    catch { setHealth({ ...initialAudioHealth(), state: "error" }); }
  }, [stream]);
  return health;
}
