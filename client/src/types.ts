export interface TranscriptSegment {
  /** Seconds from the start of the recording. */
  t: number;
  text: string;
}

export interface ActionItem {
  task: string;
  owner: string;
}

export interface MeetingBrief {
  summary: string;
  key_points: string[];
  decisions: string[];
  action_items: ActionItem[];
  follow_up_questions: string[];
}

export interface Transcript {
  id: number;
  name: string;
  /** Full plain-text transcript. */
  content: string;
  /** Timestamped segments, when available. */
  segments: TranscriptSegment[];
  /** ISO string; render with toLocaleString(). */
  date: string;
  /** Recording length in seconds. */
  durationSec: number;
  /** True if a video recording is stored in IndexedDB under this id. */
  hasRecording: boolean;
  /** AI-generated brief, once requested. */
  brief: MeetingBrief | null;
}
