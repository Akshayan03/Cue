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
  getSettings: () => Promise<ProviderSettings>;
  setSettings: (payload: {
    provider?: "cli" | "api";
    apiKey?: string;
    apiModel?: string;
  }) => Promise<ProviderSettings>;
}

export interface ProviderSettings {
  provider: "cli" | "api";
  hasApiKey: boolean;
  apiModel: string;
  /** Whether the Claude Code CLI was found on this machine. */
  cliFound?: boolean;
  /** Whether OS secure storage is available for the API key. */
  encryptionAvailable?: boolean;
  /** The provider that will actually be used right now. */
  effective: "cli" | "api";
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
