const { contextBridge, ipcRenderer } = require("electron");

// Safe bridge between the overlay UI (renderer) and the native main process.
contextBridge.exposeInMainWorld("electron", {
  isElectron: true,

  // Window controls
  hide: () => ipcRenderer.invoke("window:hide"),
  quit: () => ipcRenderer.invoke("window:quit"),
  toggleClickThrough: () => ipcRenderer.invoke("clickthrough:toggle"),

  // Screen-aware streaming assistant
  ask: (question, includeScreen = true) =>
    ipcRenderer.invoke("ask", { question, includeScreen }),
  onAskDelta: (cb) => {
    const h = (_e, t) => cb(t);
    ipcRenderer.on("ask:delta", h);
    return () => ipcRenderer.removeListener("ask:delta", h);
  },
  onAskDone: (cb) => {
    const h = (_e, t) => cb(t);
    ipcRenderer.on("ask:done", h);
    return () => ipcRenderer.removeListener("ask:done", h);
  },
  onAskError: (cb) => {
    const h = (_e, t) => cb(t);
    ipcRenderer.on("ask:error", h);
    return () => ipcRenderer.removeListener("ask:error", h);
  },
  onAskFocus: (cb) => {
    const h = () => cb();
    ipcRenderer.on("ask:focus", h);
    return () => ipcRenderer.removeListener("ask:focus", h);
  },

  // Live meeting copilot — streamed "what do I say" suggestions
  coach: (transcript, mode) => ipcRenderer.invoke("coach", { transcript, mode }),
  onCoachDelta: (cb) => {
    const h = (_e, t) => cb(t);
    ipcRenderer.on("coach:delta", h);
    return () => ipcRenderer.removeListener("coach:delta", h);
  },
  onCoachDone: (cb) => {
    const h = (_e, t) => cb(t);
    ipcRenderer.on("coach:done", h);
    return () => ipcRenderer.removeListener("coach:done", h);
  },
  onCoachError: (cb) => {
    const h = (_e, t) => cb(t);
    ipcRenderer.on("coach:error", h);
    return () => ipcRenderer.removeListener("coach:error", h);
  },
  onCoachTrigger: (cb) => {
    const h = () => cb();
    ipcRenderer.on("coach:trigger", h);
    return () => ipcRenderer.removeListener("coach:trigger", h);
  },
  onClickThroughChanged: (cb) => {
    const h = (_e, v) => cb(v);
    ipcRenderer.on("clickthrough:changed", h);
    return () => ipcRenderer.removeListener("clickthrough:changed", h);
  },

  // Structured meeting brief
  summarize: (payload) => ipcRenderer.invoke("summarize", payload),

  // Provider settings (CLI vs. own API key) + onboarding status
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (payload) => ipcRenderer.invoke("settings:set", payload),
});
