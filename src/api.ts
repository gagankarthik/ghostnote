import { invoke } from "@tauri-apps/api/core";

export const api = {
  saveSettings: (openai_key: string, deepgram_key: string) =>
    invoke<void>("save_settings", { openai_key, deepgram_key }),

  getSettings: () => invoke<[string, string]>("get_settings"),

  startRecording: () => invoke<void>("start_recording"),
  stopRecording: () => invoke<void>("stop_recording"),

  askAi: (question: string, mode: string, model: string, use_screen: boolean) =>
    invoke<string>("ask_ai", { question, mode, model, use_screen }),

  generateNotes: (model: string) => invoke<string>("generate_notes", { model }),
  getTranscript: () => invoke<string[]>("get_transcript"),
  clearSession: () => invoke<void>("clear_session"),
  captureScreenshot: () => invoke<string>("capture_screenshot"),
};
