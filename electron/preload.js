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
  onClickThroughChanged: (cb) => {
    const h = (_e, v) => cb(v);
    ipcRenderer.on("clickthrough:changed", h);
    return () => ipcRenderer.removeListener("clickthrough:changed", h);
  },

  // Structured meeting brief
  summarize: (payload) => ipcRenderer.invoke("summarize", payload),
});
