import { Transcript } from "./types";
import { emptyContext, InterviewContext } from "./interview";

const TRANSCRIPTS_KEY = "cue.transcripts";
const INTERVIEW_PREP_KEY = "cue.interviewPrep";

/** Interview prep (résumé, job description, notes, prep chat) survives
 * restarts and tab switches, so live answers always have it. */
export function loadInterviewPrep(): InterviewContext {
  try {
    const saved = JSON.parse(localStorage.getItem(INTERVIEW_PREP_KEY) || "null");
    if (!saved || typeof saved !== "object") return emptyContext();
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return {
      title: text(saved.title),
      resume: text(saved.resume),
      jobDescription: text(saved.jobDescription),
      notes: text(saved.notes),
      briefing: text(saved.briefing),
      prepConversation: Array.isArray(saved.prepConversation)
        ? saved.prepConversation.filter((t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
        : [],
    };
  } catch {
    return emptyContext();
  }
}

export function saveInterviewPrep(context: InterviewContext): void {
  try {
    localStorage.setItem(INTERVIEW_PREP_KEY, JSON.stringify(context));
  } catch (e) {
    console.error("Couldn't persist interview prep:", e);
  }
}

export function clearInterviewPrep(): void {
  try { localStorage.removeItem(INTERVIEW_PREP_KEY); } catch { /* storage unavailable */ }
}
const LEGACY_TRANSCRIPTS_KEY = "transcribai.transcripts"; // pre-rebrand key

/** Transcript metadata + text + brief live in localStorage (small, synchronous). */
export function loadTranscripts(): Transcript[] {
  try {
    let raw = localStorage.getItem(TRANSCRIPTS_KEY);
    // One-time migration from the old "transcribai" key so existing users keep
    // their saved meetings after the rebrand to Cue.
    if (raw === null) {
      const legacy = localStorage.getItem(LEGACY_TRANSCRIPTS_KEY);
      if (legacy !== null) {
        localStorage.setItem(TRANSCRIPTS_KEY, legacy);
        localStorage.removeItem(LEGACY_TRANSCRIPTS_KEY);
        raw = legacy;
      }
    }
    return raw ? (JSON.parse(raw) as Transcript[]) : [];
  } catch {
    return [];
  }
}

export function saveTranscripts(transcripts: Transcript[]): void {
  try {
    localStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(transcripts));
  } catch (e) {
    // Quota exceeded — keep the app alive; the in-memory copy is still intact.
    console.error("Couldn't persist transcripts:", e);
  }
}

// ---- Recording blobs (large) live in IndexedDB ----

const DB_NAME = "transcribai";
const STORE = "recordings";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(id: number, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getRecording(id: number): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

export async function deleteRecording(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
