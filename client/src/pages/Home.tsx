import React from "react";
import { Link } from "react-router-dom";

interface HomeProps {
  transcriptCount: number;
}

const Home: React.FC<HomeProps> = ({ transcriptCount }) => {
  return (
    <div className="page">
      <section className="hero">
        <h1>
          Meet <span className="grad">Cue</span> — your meeting copilot
        </h1>
        <p className="muted">
          An always-on overlay that listens to your calls, tells you what to say in real time, and
          turns every meeting into a clean recap. Invisible to screen-share. Powered by your Claude
          login — no API key.
        </p>
        <div className="btn-row">
          <Link className="btn btn--primary btn--lg" to="/live">
            ✨ Start live copilot
          </Link>
          <Link className="btn btn--lg" to="/assistant">
            Ask about my screen
          </Link>
        </div>
      </section>

      <section className="features">
        <div className="feature">
          <h3>🗣️ What do I say?</h3>
          <p className="muted">Cue hears the conversation and suggests your next line — answers, follow-ups, comebacks — on demand or automatically.</p>
        </div>
        <div className="feature">
          <h3>👁️ Screen-aware</h3>
          <p className="muted">Ask about whatever's on your screen — by typing or by voice — and get a streamed answer over any app.</p>
        </div>
        <div className="feature">
          <h3>📝 Records &amp; recaps</h3>
          <p className="muted">Capture screen + audio, transcribe on-device with Whisper, and get an AI brief with action items.</p>
        </div>
        <div className="feature">
          <h3>🔒 Private by default</h3>
          <p className="muted">Transcription runs locally and the overlay never appears in screen-share. {transcriptCount > 0 ? `${transcriptCount} meeting${transcriptCount === 1 ? "" : "s"} saved.` : ""}</p>
        </div>
      </section>
    </div>
  );
};

export default Home;
