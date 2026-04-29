export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: "error" | "success" | "info";
}

export interface MeetingRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  wordCount: number;
  questionCount: number;
  preview: string;
}

export interface AuthUser {
  email: string;
  accessToken: string;
  refreshToken: string;
}

export type AIMode   = "interview" | "meeting" | "notes";
export type AIModel  = "gpt-4o-mini" | "gpt-4o";
export type AppView  = "main" | "settings";
export type AppState = "loading" | "auth" | "history" | "meeting";
