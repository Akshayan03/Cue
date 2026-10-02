import { MeetingBrief } from "./types";
import { InterviewContext, ChatTurn } from "./interview";

export type PrivacyPane = "audio" | "screen";
export type CoachMode = "say" | "answer" | "followup" | "objection";

export interface ElectronAPI {
  isElectron: true;
  platform?: string;
  checkInterviewConnection: () => Promise<{ connected: boolean; model: string; version: string; subscription: string }>;
  claudeStatus?: () => Promise<ClaudeStatus>;
  installClaude?: () => Promise<void>;
  loginClaude?: () => Promise<ClaudeStatus>;
  submitClaudeLoginCode?: (code: string) => Promise<void>;
  openClaudeLogin?: () => Promise<void>;
  cancelClaudeLogin?: () => Promise<void>;
  onClaudeLoginUrl?: (cb: () => void) => () => void;
  audioSupport: () => Promise<{ platform: string; supported: boolean; screenPermission: string }>;
  prepareAudioCapture: () => Promise<void>;
  promptAudioPermission?: () => Promise<void>;
  openPrivacySettings?: (pane: PrivacyPane) => Promise<void>;
  checkScreen?: () => Promise<string | null>;
  importDocument: () => Promise<{ name: string; text: string } | null>;
  respond: (payload: { id: string; context: InterviewContext; history: ChatTurn[]; transcript?: string; question: string; kind: "prep" | "live"; mode?: CoachMode; includeScreen?: boolean }) => Promise<void>;
  cancelResponse: (id?: string) => Promise<void>;
  onSessionStream: (cb: (event: { id: string; type: "delta" | "done" | "error"; text: string }) => void) => () => void;
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
  onSessionClear?: (cb: () => void) => () => void;
  summarize: (payload: { title: string; transcript: string }) => Promise<MeetingBrief>;
  workerSource?: () => Promise<string>;
  ensureMic?: () => Promise<"granted" | "denied">;
  getSettings: () => Promise<ProviderSettings>;
  setSettings: (payload: {
    provider?: "cli" | "api";
    apiKey?: string;
    apiModel?: string;
    coachProfile?: "general" | "sales" | "interview" | "coding";
    customInstructions?: string;
  }) => Promise<ProviderSettings>;
}

/** Where the user is in connecting their Claude account. */
export interface ClaudeStatus {
  step: "install" | "update" | "signin" | "ready";
  version?: string;
  subscription?: string;
}

export interface ProviderSettings {
  cliModel?: string;
  provider: "cli" | "api";
  hasApiKey: boolean;
  apiModel: string;
  /** Whether the Claude Code CLI was found on this machine. */
  cliFound?: boolean;
  /** Whether OS secure storage is available for the API key. */
  encryptionAvailable?: boolean;
  /** The provider that will actually be used right now. */
  effective: "cli" | "api";
  coachProfile?: "general" | "sales" | "interview" | "coding";
  customInstructions?: string;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
