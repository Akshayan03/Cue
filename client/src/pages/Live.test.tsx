import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Live from "./Live";
import { summarize } from "../api";

const mockTranscriber = {
  segments: [{ t: 0, text: "Tell me about a difficult project" }], interim: "", speaking: false,
  status: "ready", pending: 0, error: null, progress: 1,
  reset: jest.fn(), start: jest.fn().mockResolvedValue(undefined), stop: jest.fn(),
  replaceStream: jest.fn().mockResolvedValue(undefined),
  finish: jest.fn().mockResolvedValue([{ t: 0, text: "Tell me about a difficult project" }, { t: 10, text: "Final spoken words" }]),
};
jest.mock("../useTranscriber", () => ({ useTranscriber: () => mockTranscriber }));
jest.mock("../useAudioHealth", () => ({ useAudioHealth: () => ({ state: "receiving", level: 45, hasSignal: true, deviceChanged: false }) }));
jest.mock("../api", () => ({ isDesktop: () => true, summarize: jest.fn().mockResolvedValue({ summary: "Test summary" }) }));

let emit: (event: any) => void;
let response: jest.Mock;
let audio: { stop: jest.Mock; addEventListener: jest.Mock; readyState: string; enabled: boolean };
let video: { stop: jest.Mock };
let display: { getTracks: () => any[]; getAudioTracks: () => any[] };
let save: jest.Mock;
beforeEach(() => {
  localStorage.clear();
  mockTranscriber.start.mockResolvedValue(undefined);
  mockTranscriber.replaceStream.mockResolvedValue(undefined);
  mockTranscriber.finish.mockResolvedValue([{ t: 0, text: "Tell me about a difficult project" }, { t: 10, text: "Final spoken words" }]);
  (summarize as jest.Mock).mockResolvedValue({ summary: "Test summary" });
  let next = 0;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => `live-${++next}` } });
  global.MediaStream = class { constructor(public tracks: unknown[]) {} } as any;
  audio = { stop: jest.fn(), addEventListener: jest.fn(), readyState: "live", enabled: true };
  video = { stop: jest.fn() };
  display = { getTracks: () => [audio, video], getAudioTracks: () => [audio] };
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getDisplayMedia: jest.fn().mockResolvedValue(display), getUserMedia: jest.fn() } });
  response = jest.fn().mockResolvedValue(undefined);
  save = jest.fn();
  window.electron = {
    checkInterviewConnection: jest.fn().mockResolvedValue({ connected: true, model: "claude-opus-5-5", subscription: "max" }),
    claudeStatus: jest.fn().mockResolvedValue({ step: "ready", version: "2.1.287 (Claude Code)", subscription: "max" }),
    respond: response, cancelResponse: jest.fn().mockResolvedValue(undefined),
    onSessionStream: (listener: typeof emit) => { emit = listener; return jest.fn(); },
    onSessionClear: () => jest.fn(), onCoachTrigger: () => jest.fn(), onAskFocus: () => jest.fn(),
    setSettings: jest.fn().mockResolvedValue({}),
  } as any;
});
afterEach(() => { delete window.electron; jest.clearAllMocks(); });
const renderLive = () => render(<MemoryRouter initialEntries={["/live"]}><Routes><Route path="/live" element={<Live setSavedTranscripts={save} />} /><Route path="/library" element={<p>Saved library</p>} /></Routes></MemoryRouter>);

test("prep documents and chat carry into automatic answers; session end saves finalized audio", async () => {
  renderLive();
  await screen.findByText(/Claude account · max/);
  expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your résumé"), { target: { value: "Built an inventory service" } });
  fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "Backend engineer with reliability experience" } });
  fireEvent.change(screen.getByLabelText("Prep message"), { target: { value: "I led two engineers, not ten." } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  act(() => emit({ id: "live-1", type: "done", text: "Let's use your inventory project." }));
  fireEvent.click(screen.getByRole("button", { name: /Start interview session/ }));
  await screen.findByRole("button", { name: "End" });
  await waitFor(() => expect(response).toHaveBeenCalledTimes(2), { timeout: 2500 });
  const liveRequest = response.mock.calls[1][0];
  expect(liveRequest.kind).toBe("live");
  expect(liveRequest.context.resume).toBe("Built an inventory service");
  expect(liveRequest.context.jobDescription).toContain("reliability");
  expect(liveRequest.context.prepConversation[0].text).toBe("I led two engineers, not ten.");
  expect(liveRequest.question).toBe("Tell me about a difficult project");
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(video.stop).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "End" }));
  await screen.findByText("Saved library");
  const saved = save.mock.calls[0][0]([])[0];
  expect(saved.content).toContain("Final spoken words");
  expect(saved).not.toHaveProperty("resume");
  expect(audio.stop).toHaveBeenCalled();
  expect(video.stop).toHaveBeenCalled();
});

test("missing call audio is surfaced without silently switching on the microphone", async () => {
  display.getAudioTracks = () => [];
  Object.assign(window.electron!, { platform: "darwin", promptAudioPermission: jest.fn().mockResolvedValue(undefined), openPrivacySettings: jest.fn().mockResolvedValue(undefined) });
  renderLive();
  await screen.findByText(/Claude account · max/);
  fireEvent.click(screen.getByRole("button", { name: /Start interview session/ }));
  await screen.findByText(/No call audio was shared/);
  expect(window.electron?.promptAudioPermission).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
  expect(window.electron?.openPrivacySettings).toHaveBeenCalledWith("audio");
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(video.stop).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "End" })).not.toBeInTheDocument();
});

test("with the screen on, every answer includes it; missing Screen Recording turns it off and offers the fix", async () => {
  const checkScreen = jest.fn().mockResolvedValueOnce("Cue can't see your screen yet. Turn on Electron in System Settings.").mockResolvedValue(null);
  Object.assign(window.electron!, { platform: "darwin", checkScreen, openPrivacySettings: jest.fn().mockResolvedValue(undefined) });
  renderLive();
  await screen.findByText(/Claude account · max/);
  fireEvent.click(screen.getByRole("button", { name: /Start interview session/ }));
  await screen.findByRole("button", { name: "End" });
  await waitFor(() => expect(response).toHaveBeenCalledTimes(1), { timeout: 2500 });
  expect(response.mock.calls[0][0].includeScreen).toBe(false);
  const toggle = screen.getByRole("button", { name: "Include screen" });
  fireEvent.click(toggle);
  await screen.findByText(/can't see your screen/);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Open System Settings" }));
  expect(window.electron?.openPrivacySettings).toHaveBeenCalledWith("screen");
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute("aria-pressed", "true"));
  fireEvent.click(screen.getByRole("button", { name: /^Answer/ }));
  expect(response).toHaveBeenCalledTimes(2);
  expect(response.mock.calls[1][0]).toMatchObject({ kind: "live", mode: "answer", includeScreen: true });
});

test("the pre-call audio check captures system audio without starting AI or transcription", async () => {
  renderLive();
  await screen.findByText(/Claude account · max/);
  fireEvent.click(screen.getByRole("button", { name: "Test call audio" }));
  await screen.findByLabelText("Call audio level");
  expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledTimes(1);
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  expect(mockTranscriber.start).not.toHaveBeenCalled();
  expect(response).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop audio check" }));
  expect(audio.stop).toHaveBeenCalled();
  expect(video.stop).toHaveBeenCalled();
});

test("reconnecting call audio preserves the session, preparation, and transcript", async () => {
  renderLive();
  await screen.findByText(/Claude account · max/);
  fireEvent.change(screen.getByLabelText("Your résumé"), { target: { value: "My actual experience" } });
  fireEvent.click(screen.getByRole("button", { name: /Start interview session/ }));
  await screen.findByRole("button", { name: "End" });
  const replacement = { ...audio, stop: jest.fn() };
  (navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValueOnce({ getTracks: () => [replacement], getAudioTracks: () => [replacement] });
  fireEvent.click(screen.getByRole("button", { name: "Reconnect audio" }));
  await waitFor(() => expect(mockTranscriber.replaceStream).toHaveBeenCalledTimes(1));
  expect(audio.stop).toHaveBeenCalled();
  expect(replacement.stop).not.toHaveBeenCalled();
  expect(mockTranscriber.reset).toHaveBeenCalledTimes(1);
  expect(mockTranscriber.start).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/No résumé/)).not.toBeInTheDocument();
  expect(screen.getByText(/No job description loaded/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "End" })).toBeInTheDocument();
});

test("prep survives leaving the page and is sent with live answers; New interview clears it", async () => {
  const first = renderLive();
  await screen.findByText(/Claude account · max/);
  fireEvent.change(screen.getByLabelText("Your résumé"), { target: { value: "Led the payments migration at Acme" } });
  fireEvent.change(screen.getByLabelText("Job description"), { target: { value: "Staff engineer, payments" } });
  fireEvent.change(screen.getByLabelText("Prep message"), { target: { value: "The migration cut checkout errors by 30%." } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  act(() => emit({ id: "live-1", type: "done", text: "Lead with the migration." }));
  first.unmount();

  renderLive();
  await screen.findByText(/Claude account · max/);
  expect(screen.getByLabelText("Your résumé")).toHaveValue("Led the payments migration at Acme");
  expect(screen.getByText("The migration cut checkout errors by 30%.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Start interview session/ }));
  await screen.findByRole("button", { name: "End" });
  await waitFor(() => expect(response).toHaveBeenCalledTimes(2), { timeout: 2500 });
  const liveRequest = response.mock.calls[1][0];
  expect(liveRequest.context.resume).toBe("Led the payments migration at Acme");
  expect(liveRequest.context.prepConversation[0].text).toBe("The migration cut checkout errors by 30%.");
  expect(screen.queryByText(/answers will be general/)).not.toBeInTheDocument();
});

test("New interview asks first, then clears saved prep", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
  const view = renderLive();
  await screen.findByText(/Claude account · max/);
  fireEvent.change(screen.getByLabelText("Your résumé"), { target: { value: "Old company résumé" } });
  fireEvent.click(screen.getByRole("button", { name: "New interview" }));
  expect(screen.getByLabelText("Your résumé")).toHaveValue("Old company résumé");
  fireEvent.click(screen.getByRole("button", { name: "New interview" }));
  expect(screen.getByLabelText("Your résumé")).toHaveValue("");
  view.unmount();
  renderLive();
  await screen.findByText(/Claude account · max/);
  expect(screen.getByLabelText("Your résumé")).toHaveValue("");
  expect(confirm).toHaveBeenCalledTimes(2);
  confirm.mockRestore();
});
