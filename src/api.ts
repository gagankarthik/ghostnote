import { invoke } from "@tauri-apps/api/core";

export const api = {
  startRecording:    () => invoke<void>("start_recording"),
  stopRecording:     () => invoke<void>("stop_recording"),

  // Tauri v2 deserializes command args as camelCase — snake_case Rust params
  // map to camelCase JS keys (use_screen → useScreen, etc.)
  askAi: (question: string, mode: string, model: string, useScreen: boolean) =>
    invoke<string>("ask_ai", { question, mode, model, useScreen }),

  generateNotes:   (model: string)                        => invoke<string>("generate_notes", { model }),
  getTranscript:   ()                                     => invoke<string[]>("get_transcript"),
  clearSession:    ()                                     => invoke<void>("clear_session"),
  captureScreenshot: ()                                   => invoke<string>("capture_screenshot"),

};
