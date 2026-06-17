import { MeetingBrief } from "./types";

export const isDesktop = (): boolean => Boolean(window.electron?.isElectron);

/** Generate a meeting brief — via Electron IPC when running as the desktop app,
 *  otherwise via the standalone server. */
export async function summarize(payload: { title: string; transcript: string }): Promise<MeetingBrief> {
  if (window.electron) {
    return window.electron.summarize(payload);
  }
  const res = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as MeetingBrief;
}
