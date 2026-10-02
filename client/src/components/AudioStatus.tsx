import React from "react";
import { AudioHealth, CALL_AUDIO_HELP } from "../callAudio";
import { AudioSource } from "../interview";

export default function AudioStatus({ health, source }: { health: AudioHealth; source: AudioSource }) {
  const call = source === "system";
  const labels = {
    waiting: health.hasSignal ? "Audio received · waiting for more" : "Waiting for audio…",
    receiving: call ? "Receiving call audio" : "Receiving microphone audio",
    quiet: health.hasSignal ? "No recent audio — this may be a pause" : "No audio detected yet",
    muted: "Audio track is muted or unavailable",
    ended: "Audio capture disconnected",
    suspended: "Audio engine paused — reconnect audio",
    error: "Audio check unavailable — reconnect audio",
  };
  const needsAttention = ["quiet", "muted", "ended", "suspended", "error"].includes(health.state);
  return <div className={`audio-status${needsAttention ? " audio-status--warn" : ""}`}>
    <div className="audio-status-head"><span role="status">{labels[health.state]}</span><span className="small faint">{call ? "System audio · mic off" : "Microphone"}</span></div>
    <meter aria-label={call ? "Call audio level" : "Microphone audio level"} min={0} max={100} value={health.level} />
    {health.deviceChanged && <p className="small muted">Audio devices changed. Play the Teams/Zoom speaker test again; reconnect if the meter stays still.</p>}
    {needsAttention && <p className="small muted">{call ? `If the interviewer or speaker test is playing and the meter stays still, reconnect audio. ${CALL_AUDIO_HELP}` : "Speak near the selected microphone. Check its permission and reconnect if the meter stays still."}</p>}
  </div>;
}
