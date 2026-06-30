import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/** Shown above the AI features when no provider is set up yet, so the first-run
 *  experience is a clear call to action instead of a raw "CLI not found" error. */
const ProviderNotice: React.FC = () => {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!window.electron) return;
    window.electron.getSettings().then((s) => {
      const ok = s.provider === "api" ? s.hasApiKey : Boolean(s.cliFound);
      setReady(ok);
    });
  }, []);

  if (ready === null || ready) return null;

  return (
    <div className="alert alert--warn">
      Cue isn't connected to Claude yet. <Link to="/settings">Set up a provider</Link> — use your
      Claude Code login or your own Anthropic API key.
    </div>
  );
};

export default ProviderNotice;
