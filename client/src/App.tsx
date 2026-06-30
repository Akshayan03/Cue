import React, { useEffect, useState } from "react";
import { HashRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Record from "./pages/Record";
import Assistant from "./pages/Assistant";
import Live from "./pages/Live";
import Settings from "./pages/Settings";
import TranscriptLibrary from "./pages/TranscriptLibrary";
import { Transcript } from "./types";
import { isDesktop } from "./api";
import { loadTranscripts, saveTranscripts } from "./storage";

// Re-export so existing imports of `Transcript` from "../App" keep working.
export type { Transcript } from "./types";

const App = () => {
  const [savedTranscripts, setSavedTranscripts] = useState<Transcript[]>(loadTranscripts);
  const desktop = isDesktop();

  useEffect(() => {
    saveTranscripts(savedTranscripts);
  }, [savedTranscripts]);

  // In the desktop overlay, the body is transparent so the window floats.
  useEffect(() => {
    if (desktop) document.body.classList.add("overlay");
  }, [desktop]);

  return (
    <Router>
      <div className="shell">
        {desktop && (
          <div className="dragbar">
            <span className="dragbar-brand">
              <span className="brand-dot" /> Cue
            </span>
            <span className="dragbar-hint">⌘J what to say · ⌘\ hide</span>
            <button className="dragbar-close" onClick={() => window.electron?.hide()} title="Hide (⌘\)">
              ✕
            </button>
          </div>
        )}
        <div className="body-row">
          <Navbar />
          <main className="app-main">
            <Routes>
              <Route
                path="/"
                element={desktop ? <Navigate to="/assistant" replace /> : <Home transcriptCount={savedTranscripts.length} />}
              />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/live" element={<Live />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/record" element={<Record setSavedTranscripts={setSavedTranscripts} />} />
              <Route
                path="/library"
                element={
                  <TranscriptLibrary
                    savedTranscripts={savedTranscripts}
                    setSavedTranscripts={setSavedTranscripts}
                  />
                }
              />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
};

export default App;
