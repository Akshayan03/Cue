import React, { useCallback, useEffect, useRef, useState } from "react";
import { ClaudeStatus } from "../electron";

const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Connects the user's Claude account without a terminal: install Claude Code,
 * then sign in through the browser. `manage` adds a "Sign in again" action
 * once connected, for switching accounts or renewing an expired login. */
export default function ClaudeConnect({ onReady, manage = false }: { onReady?: (status: ClaudeStatus) => void; manage?: boolean }) {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [busy, setBusy] = useState<"install" | "signin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLink, setHasLink] = useState(false);
  const [code, setCode] = useState("");
  const alive = useRef(true);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const apply = useCallback((next: ClaudeStatus) => {
    if (!alive.current) return;
    setStatus(next);
    if (next.step === "ready") onReadyRef.current?.(next);
  }, []);

  const check = useCallback(async () => {
    setError(null);
    setStatus(null);
    try { apply(await window.electron!.claudeStatus!()); }
    catch (e) { if (alive.current) { setStatus({ step: "install" }); setError(message(e, "Couldn't check for Claude Code.")); } }
  }, [apply]);

  useEffect(() => {
    alive.current = true;
    check();
    return () => {
      alive.current = false;
      window.electron?.cancelClaudeLogin?.();
    };
  }, [check]);

  const install = async () => {
    setBusy("install");
    setError(null);
    try {
      await window.electron!.installClaude!();
      if (alive.current) await check();
    } catch (e) { if (alive.current) setError(message(e, "Claude Code didn't install. Try again.")); }
    finally { if (alive.current) setBusy(null); }
  };

  const signIn = async () => {
    setBusy("signin");
    setError(null);
    setHasLink(false);
    setCode("");
    const off = window.electron?.onClaudeLoginUrl?.(() => setHasLink(true));
    try { apply(await window.electron!.loginClaude!()); }
    catch (e) { if (alive.current) setError(message(e, "Sign-in didn't finish. Try again.")); }
    finally { off?.(); if (alive.current) setBusy(null); }
  };

  const submitCode = () => {
    if (!code.trim()) return;
    window.electron?.submitClaudeLoginCode?.(code.trim());
    setCode("");
  };

  if (status?.step === "ready" && busy !== "signin") {
    return <div className="connection-card connection-card--ready">
      <span>● Claude account · {status.subscription} · Opus 5.5</span>
      {manage && <button className="btn btn--ghost" onClick={signIn}>Sign in again</button>}
    </div>;
  }

  const step = status?.step;
  return <section className="claude-connect" aria-label="Connect your Claude account">
    <div className="claude-connect-head">
      <strong>Connect your Claude account</strong>
      {step && step !== "ready" && <span className="small muted">Step {step === "signin" ? 2 : 1} of 2</span>}
    </div>
    {!status && <p>Checking for Claude…</p>}
    {(step === "install" || step === "update") && <>
      <p>{step === "update"
        ? `Your Claude Code${status?.version ? ` (${status.version.split(" ")[0]})` : ""} is too old for Opus 5.5. Updating takes about 2 minutes.`
        : "Cue answers with your own Claude account through Claude Code, Anthropic's free helper app. Cue installs it for you in about 2 minutes, with no admin password."}</p>
      <div className="claude-connect-actions">
        <button className="btn btn--primary" onClick={install} disabled={busy !== null}>
          {busy === "install" ? (step === "update" ? "Updating Claude Code…" : "Installing Claude Code…") : (step === "update" ? "Update Claude Code" : "Install Claude Code")}
        </button>
      </div>
    </>}
    {(step === "signin" || busy === "signin") && <>
      {busy === "signin"
        ? <p>Finish signing in in your browser. Cue connects automatically when you're done.</p>
        : <p>Sign in with the Claude account you already pay for (Pro, Max, Team, or Enterprise).</p>}
      <div className="claude-connect-actions">
        {busy === "signin"
          ? <>
            {hasLink && <button className="btn" onClick={() => window.electron?.openClaudeLogin?.()}>Open sign-in page again</button>}
            <button className="btn btn--ghost" onClick={() => window.electron?.cancelClaudeLogin?.()}>Cancel</button>
          </>
          : <button className="btn btn--primary" onClick={signIn}>Sign in with Claude</button>}
      </div>
      {busy === "signin" && <div className="claude-connect-code">
        <input className="text-input" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submitCode(); }} placeholder="Claude showed a code? Paste it here" aria-label="Sign-in code" autoComplete="off" />
        <button className="btn" onClick={submitCode} disabled={!code.trim()}>Connect</button>
      </div>}
    </>}
    {error && <div role="alert" className="alert alert--error">{error}<button className="btn btn--ghost" onClick={check}>Check again</button></div>}
  </section>;
}
