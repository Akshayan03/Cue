import React, { useEffect, useState } from "react";
import { HashRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Record from "./pages/Record";
import Assistant from "./pages/Assistant";
import Live from "./pages/Live";
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
      {desktop && (
        <div className="overlay-bar">
          <span className="overlay-title">
            <span className="brand-dot" /> Cue
          </span>
          <span className="overlay-hint">⌘\ hide · ⌘↵ ask · ⌘J what to say · ⌘⇧\ click-through</span>
          <button className="overlay-close" onClick={() => window.electron?.hide()}>
            ✕
          </button>
        </div>
      )}
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={desktop ? <Navigate to="/assistant" replace /> : <Home transcriptCount={savedTranscripts.length} />}
          />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/live" element={<Live />} />
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
    </Router>
  );
};

export default App;
