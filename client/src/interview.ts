export interface InterviewContext {
  title: string;
  resume: string;
  jobDescription: string;
  notes: string;
  briefing: string;
  prepConversation?: ChatTurn[];
}

export interface ChatTurn { role: "user" | "assistant"; text: string }
export type AudioSource = "system" | "microphone";
export const emptyContext = (): InterviewContext => ({ title: "", resume: "", jobDescription: "", notes: "", briefing: "" });

export function questionKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

// Whisper often omits punctuation. Detect interviewer prompts such as
// "Walk me through..." as well as conventional question forms.
export function latestQuestion(text: string): string {
  const recent = text.slice(-1400).trim();
  const sentences = recent.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 3); i--) {
    const s = sentences[i];
    if (s.split(/\s+/).length < 2) continue;
    if (/\?$/.test(s) || /^(?:(?:so|okay|great|now|next|and)[, ]+)*(?:what|why|how|when|where|which|who|can you|could you|would you|have you|do you|did you|are you|tell (?:me|us)|walk (?:me|us)|describe|explain|give (?:me|us)|talk (?:me|us) through)\b/i.test(s)) return s;
  }
  return "";
}
