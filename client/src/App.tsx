import React, { useEffect, useState } from "react";
import { HashRouter as Router, Navigate, NavLink, Route, Routes } from "react-router-dom";
import TabBar from "./components/Navbar";
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

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

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
          <div className="titlebar">
            <span className="wordmark">
              <span className="brand-dot" /> Cue
            </span>
            <span className="titlebar-status">⌘\ hide</span>
            <div className="actions">
              <NavLink
                to="/settings"
                className={({ isActive }) => (isActive ? "icon-btn icon-btn--active" : "icon-btn")}
                title="Settings"
              >
                <GearIcon />
              </NavLink>
              <button className="icon-btn" onClick={() => window.electron?.hide()} title="Hide (⌘\)">
                <CloseIcon />
              </button>
            </div>
          </div>
        )}
        <main className="app-main">
          <Routes>
            <Route
              path="/"
              element={desktop ? <Navigate to="/live" replace /> : <Home transcriptCount={savedTranscripts.length} />}
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
        <TabBar />
      </div>
    </Router>
  );
};

export default App;
