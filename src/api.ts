import { invoke } from "@tauri-apps/api/core";
import { MeetingRecord } from "./types";

export const api = {
  startRecording:    () => invoke<void>("start_recording"),
  stopRecording:     () => invoke<void>("stop_recording"),

  // Streaming AI — emits "ai-chunk" events, resolves with full text
  // history: completed [user, assistant] message pairs for multi-turn context
  askAiStream: (
    question: string,
    useScreen: boolean,
    history: [string, string][] = [],
  ) => invoke<string>("ask_ai_stream", { question, useScreen, history }),

  generateNotes:     ()                   => invoke<string>("generate_notes"),
  getTranscript:     ()                   => invoke<string[]>("get_transcript"),
  clearSession:      ()                   => invoke<void>("clear_session"),
  captureScreenshot: ()                   => invoke<string>("capture_screenshot"),

  // DynamoDB
  saveMeeting:   (meeting: MeetingRecord, userEmail: string) =>
    invoke<void>("save_meeting", { meeting, userEmail }),
  getMeetings:   (userEmail: string) =>
    invoke<MeetingRecord[]>("get_meetings", { userEmail }),
  deleteMeeting: (meetingId: string, userEmail: string) =>
    invoke<void>("delete_meeting", { meetingId, userEmail }),
};
