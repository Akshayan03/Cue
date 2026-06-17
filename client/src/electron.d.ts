import { MeetingBrief } from "./types";

export type CoachMode = "say" | "answer" | "followup" | "objection";

export interface ElectronAPI {
  isElectron: true;
  hide: () => Promise<void>;
  quit: () => Promise<void>;
  toggleClickThrough: () => Promise<void>;
  ask: (question: string, includeScreen?: boolean) => Promise<void>;
  onAskDelta: (cb: (text: string) => void) => () => void;
  onAskDone: (cb: (text: string) => void) => () => void;
  onAskError: (cb: (text: string) => void) => () => void;
  onAskFocus: (cb: () => void) => () => void;
  onClickThroughChanged: (cb: (on: boolean) => void) => () => void;
  coach: (transcript: string, mode: CoachMode) => Promise<void>;
  onCoachDelta: (cb: (text: string) => void) => () => void;
  onCoachDone: (cb: (text: string) => void) => () => void;
  onCoachError: (cb: (text: string) => void) => () => void;
  onCoachTrigger: (cb: () => void) => () => void;
  summarize: (payload: { title: string; transcript: string }) => Promise<MeetingBrief>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
