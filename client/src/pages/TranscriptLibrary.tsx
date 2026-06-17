import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Transcript, MeetingBrief } from "../types";
import { getRecording, deleteRecording } from "../storage";
import { summarize } from "../api";

interface Props {
  savedTranscripts: Transcript[];
  setSavedTranscripts: React.Dispatch<React.SetStateAction<Transcript[]>>;
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function briefToText(t: Transcript): string {
  const b = t.brief;
  const lines = [`# ${t.name}`, new Date(t.date).toLocaleString(), ""];
  if (b) {
    lines.push("## Summary", b.summary, "");
    if (b.key_points.length) lines.push("## Key points", ...b.key_points.map((p) => `- ${p}`), "");
    if (b.decisions.length) lines.push("## Decisions", ...b.decisions.map((d) => `- ${d}`), "");
    if (b.action_items.length)
      lines.push("## Action items", ...b.action_items.map((a) => `- [${a.owner}] ${a.task}`), "");
    if (b.follow_up_questions.length)
      lines.push("## Follow-up questions", ...b.follow_up_questions.map((q) => `- ${q}`), "");
  }
  lines.push("## Transcript", t.content);
  return lines.join("\n");
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TranscriptLibrary: React.FC<Props> = ({ savedTranscripts, setSavedTranscripts }) => {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const selected = savedTranscripts.find((t) => t.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return savedTranscripts;
    return savedTranscripts.filter(
      (t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)
    );
  }, [query, savedTranscripts]);

  // Load the recording blob from IndexedDB when a meeting is opened.
  useEffect(() => {
    let revoked: string | null = null;
    setVideoUrl(null);
    if (selected?.hasRecording) {
      getRecording(selected.id).then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          revoked = url;
          setVideoUrl(url);
        }
      });
    }
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [selected?.id, selected?.hasRecording]);

  const updateBrief = (id: number, brief: MeetingBrief) =>
    setSavedTranscripts((prev) => prev.map((t) => (t.id === id ? { ...t, brief } : t)));

  const generateBrief = async (t: Transcript) => {
    setGenError(null);
    if (!t.content.trim()) {
      setGenError("This meeting has no transcript text to summarize.");
      return;
    }
    setGenerating(true);
    try {
      const brief = await summarize({ title: t.name, transcript: t.content });
      updateBrief(t.id, brief);
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : "Failed to generate brief."
      );
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (t: Transcript) => {
    if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;
    if (t.hasRecording) await deleteRecording(t.id).catch(() => {});
    setSavedTranscripts((prev) => prev.filter((x) => x.id !== t.id));
    if (selectedId === t.id) setSelectedId(null);
  };

  if (selected) {
    const b = selected.brief;
    return (
      <div className="page">
        <button className="btn btn--ghost" onClick={() => setSelectedId(null)}>
          ← Back to library
        </button>
        <header className="page-head">
          <h1>{selected.name}</h1>
          <p className="muted">
            {new Date(selected.date).toLocaleString()} · {fmtDuration(selected.durationSec)}
          </p>
        </header>

        {videoUrl && (
          <section className="card">
            <video src={videoUrl} className="preview" controls playsInline />
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>AI brief</h2>
            {!generating && (
              <button className="btn btn--primary" onClick={() => generateBrief(selected)}>
                {b ? "Regenerate" : "Generate brief"}
              </button>
            )}
          </div>
          {genError && <div className="alert alert--error">{genError}</div>}
          {generating && <p className="muted">Asking Claude to read the transcript…</p>}
          {!generating && !b && (
            <p className="muted">No brief yet. Generate one to get a summary, decisions, and action items.</p>
          )}
          {b && !generating && (
            <div className="brief">
              <p>{b.summary}</p>
              {b.action_items.length > 0 && (
                <>
                  <h3>Action items</h3>
                  <ul className="checklist">
                    {b.action_items.map((a, i) => (
                      <li key={i}>
                        <strong>{a.owner}</strong> — {a.task}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {b.decisions.length > 0 && (
                <>
                  <h3>Decisions</h3>
                  <ul>{b.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </>
              )}
              {b.key_points.length > 0 && (
                <>
                  <h3>Key points</h3>
                  <ul>{b.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </>
              )}
              {b.follow_up_questions.length > 0 && (
                <>
                  <h3>Open questions</h3>
                  <ul>{b.follow_up_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Transcript</h2>
            <button
              className="btn btn--ghost"
              onClick={() => download(`${selected.name}.txt`, briefToText(selected))}
            >
              Export .txt
            </button>
          </div>
          {selected.segments.length > 0 ? (
            <ul className="segments">
              {selected.segments.map((s, i) => (
                <li key={i}>
                  <span className="ts">{fmtDuration(Math.round(s.t))}</span> {s.text}
                </li>
              ))}
            </ul>
          ) : (
            <p>{selected.content || <span className="muted">No transcript captured.</span>}</p>
          )}
        </section>

        <button className="btn btn--danger" onClick={() => remove(selected)}>
          Delete meeting
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Library</h1>
        <p className="muted">{savedTranscripts.length} saved meeting{savedTranscripts.length === 1 ? "" : "s"}</p>
      </header>

      {savedTranscripts.length > 0 && (
        <input
          className="search"
          type="search"
          placeholder="Search meetings and transcripts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {savedTranscripts.length === 0 ? (
        <div className="card empty">
          <p>No meetings yet.</p>
          <Link className="btn btn--primary" to="/record">
            Record your first meeting
          </Link>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((t) => (
            <button key={t.id} className="meeting-card" onClick={() => setSelectedId(t.id)}>
              <div className="meeting-card__top">
                <h3>{t.name}</h3>
                {t.brief && <span className="badge">AI brief</span>}
              </div>
              <p className="muted small">
                {new Date(t.date).toLocaleDateString()} · {fmtDuration(t.durationSec)}
                {t.hasRecording ? " · 🎥" : ""}
              </p>
              <p className="snippet">{t.content.slice(0, 120) || "No transcript"}</p>
            </button>
          ))}
          {filtered.length === 0 && <p className="muted">No matches for "{query}".</p>}
        </div>
      )}
    </div>
  );
};

export default TranscriptLibrary;
