export interface TranscriptEvent {
  text: string;
  is_final: boolean;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

export type AIMode = "interview" | "meeting" | "notes";
export type AIModel = "gpt-4o-mini" | "gpt-4o";
export type AppView = "overlay" | "notes" | "settings";
