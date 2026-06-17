import React from "react";
import { Link } from "react-router-dom";

interface HomeProps {
  transcriptCount: number;
}

const Home: React.FC<HomeProps> = ({ transcriptCount }) => {
  return (
    <div className="page">
      <section className="hero">
        <h1>Your personal meeting assistant</h1>
        <p className="muted">
          Record your screen and audio, transcribe live, and get an AI brief with a summary,
          decisions, and action items — all stored privately on your machine.
        </p>
        <div className="btn-row">
          <Link className="btn btn--primary btn--lg" to="/record">
            ● Record a meeting
          </Link>
          <Link className="btn btn--lg" to="/library">
            Library{transcriptCount > 0 ? ` (${transcriptCount})` : ""}
          </Link>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <h3>🎥 Screen + audio capture</h3>
          <p className="muted">Record any tab, window, or your whole screen with system and mic audio mixed in.</p>
        </div>
        <div className="feature">
          <h3>📝 Live transcription</h3>
          <p className="muted">Watch the transcript build in real time with timestamps as you talk.</p>
        </div>
        <div className="feature">
          <h3>🤖 AI briefs</h3>
          <p className="muted">Claude turns each transcript into a summary, decisions, and owner-tagged action items.</p>
        </div>
        <div className="feature">
          <h3>🔒 Local-first</h3>
          <p className="muted">Recordings and transcripts live in your browser. Nothing is uploaded except the text you summarize.</p>
        </div>
      </section>
    </div>
  );
};

export default Home;
