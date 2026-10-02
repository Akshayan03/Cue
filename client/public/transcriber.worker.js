// Local speech-to-text worker. Runs Whisper entirely on-device via transformers.js
// (WebAssembly/WebGPU). No API key, no server — the model is fetched from a CDN once
// and cached by the browser. Loaded as a static file so it bypasses the app bundler.

import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

// Always pull models from the HF hub (we have no local model files bundled).
env.allowLocalModels = false;

let asrPromise = null;
let currentModel = null;

function getASR(model) {
  if (!asrPromise || currentModel !== model) {
    currentModel = model;
    asrPromise = pipeline("automatic-speech-recognition", model, {
      progress_callback: (p) => self.postMessage({ type: "progress", data: p }),
    });
  }
  return asrPromise;
}

self.onmessage = async (e) => {
  const d = e.data;
  try {
    if (d.type === "load") {
      await getASR(d.model);
      self.postMessage({ type: "ready" });
      return;
    }
    if (d.type === "audio") {
      const asr = await getASR(d.model);
      // .en models are English-only and reject language/task options.
      const opts = d.model.endsWith(".en")
        ? { chunk_length_s: 30 }
        : { chunk_length_s: 30, language: d.language, task: "transcribe" };
      const out = await asr(d.audio, opts);
      // Echo gen/final so the hook can drop stale results and know whether
      // this pass commits the window or just refreshes the interim text.
      self.postMessage({ type: "text", text: (out.text || "").trim(), t: d.t, gen: d.gen, final: d.final });
    }
  } catch (err) {
    self.postMessage({ type: "error", error: String(err && err.message ? err.message : err), gen: d.gen });
  }
};
