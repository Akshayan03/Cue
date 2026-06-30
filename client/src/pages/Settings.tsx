import React, { useEffect, useState } from "react";
import { isDesktop } from "../api";
import { ProviderSettings } from "../electron";

/** Provider setup: use the local Claude Code CLI, or your own Anthropic API key.
 *  No key is bundled and nothing is sent to a Cue server — the key is stored
 *  encrypted on your machine via the OS keychain. */
const Settings: React.FC = () => {
  const desktop = isDesktop();
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [provider, setProvider] = useState<"cli" | "api">("cli");
  const [apiKey, setApiKey] = useState("");
  const [apiModel, setApiModel] = useState("claude-sonnet-5");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electron) return;
    window.electron.getSettings().then((s) => {
      setSettings(s);
      setProvider(s.provider);
      setApiModel(s.apiModel || "claude-sonnet-5");
    });
  }, []);

  if (!desktop) {
    return (
      <div className="page">
        <header className="page-head">
          <h1>Settings</h1>
        </header>
        <div className="card">
          <p>Provider settings are configured in the desktop app.</p>
        </div>
      </div>
    );
  }

  const save = async () => {
    if (!window.electron) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const payload: { provider: "cli" | "api"; apiModel?: string; apiKey?: string } = {
        provider,
        apiModel,
      };
      // Only send the key field if the user typed one (avoids clobbering a saved key).
      if (provider === "api" && apiKey.trim()) payload.apiKey = apiKey.trim();
      const next = await window.electron.setSettings(payload);
      setSettings(next);
      setApiKey("");
      setStatus("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!window.electron) return;
    const next = await window.electron.setSettings({ apiKey: "" });
    setSettings(next);
    setStatus("API key removed.");
  };

  const cliReady = settings?.cliFound;
  const apiReady = settings?.hasApiKey;
  const ready = provider === "api" ? apiReady : cliReady;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="muted small">How Cue reaches Claude. Your choice stays on this device.</p>
      </header>

      <div className="card">
        <h2 className="card-title">AI provider</h2>

        <label className="provider-opt">
          <input
            type="radio"
            name="provider"
            checked={provider === "cli"}
            onChange={() => setProvider("cli")}
          />
          <span>
            <strong>Claude Code CLI</strong>
            <span className="muted small block">
              Uses the Claude Code app you've installed and signed in with your own account. No API
              key needed.{" "}
              {settings &&
                (cliReady ? (
                  <span className="ok">✓ Detected on this machine</span>
                ) : (
                  <span className="warn">
                    Not found —{" "}
                    <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noreferrer">
                      install Claude Code
                    </a>{" "}
                    and run <code>claude</code> once to sign in.
                  </span>
                ))}
            </span>
          </span>
        </label>

        <label className="provider-opt">
          <input
            type="radio"
            name="provider"
            checked={provider === "api"}
            onChange={() => setProvider("api")}
          />
          <span>
            <strong>Anthropic API key</strong>
            <span className="muted small block">
              Bring your own key from{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              . Stored encrypted on this device — never sent anywhere except Anthropic.{" "}
              {settings && apiReady && <span className="ok">✓ A key is saved</span>}
            </span>
          </span>
        </label>

        {provider === "api" && (
          <div className="api-fields">
            <input
              type="password"
              className="text-input"
              placeholder={apiReady ? "Saved — type a new key to replace it" : "sk-ant-…"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            <input
              type="text"
              className="text-input"
              placeholder="Model id (e.g. claude-sonnet-5)"
              value={apiModel}
              onChange={(e) => setApiModel(e.target.value)}
            />
            {settings?.encryptionAvailable === false && (
              <div className="alert alert--error">
                Secure storage isn't available on this system, so an API key can't be saved safely.
                Use the Claude Code CLI option instead.
              </div>
            )}
            {apiReady && (
              <button className="btn btn--ghost" onClick={clearKey} type="button">
                Remove saved key
              </button>
            )}
          </div>
        )}

        {error && <div className="alert alert--error">{error}</div>}
        {status && <div className="alert alert--ok">{status}</div>}

        <div className="settings-actions">
          <button className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {settings && (
            <span className="muted small">
              {ready ? `Active: ${provider === "api" ? "API key" : "Claude Code CLI"}` : "Not set up yet"}
            </span>
          )}
        </div>
      </div>

      <p className="muted small">
        By using AI features you agree to the{" "}
        <a href="https://github.com/Akshayan03/Cue/blob/main/TERMS.md" target="_blank" rel="noreferrer">
          Terms
        </a>{" "}
        and{" "}
        <a href="https://github.com/Akshayan03/Cue/blob/main/PRIVACY.md" target="_blank" rel="noreferrer">
          Privacy Policy
        </a>
        . You're responsible for obtaining consent before recording anyone.
      </p>
    </div>
  );
};

export default Settings;
