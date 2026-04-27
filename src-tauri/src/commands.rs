use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use crate::{openai::OpenAIClient, AppState};

// ── Recording ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_recording(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if state.is_recording.load(Ordering::Relaxed) {
        return Ok(());
    }

    let deepgram_key = state.deepgram_key.lock().unwrap().clone();
    if deepgram_key.is_empty() {
        return Err("Deepgram API key not set. Open ⚙ Settings and paste your key.".into());
    }

    let (audio_tx, audio_rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let stop_flag = Arc::new(AtomicBool::new(false));
    *state.stop_flag.lock().unwrap() = Some(stop_flag.clone());

    state.transcript_buffer.lock().unwrap().clear();

    let audio_fmt = crate::audio::start_capture(audio_tx, stop_flag.clone())
        .map_err(|e| format!("Audio capture failed: {e}"))?;

    state.is_recording.store(true, Ordering::Relaxed);
    let _ = app.emit("recording-state", true);

    let app_clone = app.clone();
    let transcript_buf = state.transcript_buffer.clone();

    tokio::spawn(async move {
        let on_transcript = move |text: String, is_final: bool| {
            let _ = app_clone.emit(
                "transcript",
                serde_json::json!({ "text": text, "is_final": is_final }),
            );
            if is_final && !text.is_empty() {
                let mut buf = transcript_buf.lock().unwrap();
                buf.push(text);
                let len = buf.len();
                if len > 200 {
                    buf.drain(0..len - 200);
                }
            }
        };

        if let Err(e) = crate::deepgram::run_deepgram(
            deepgram_key,
            audio_fmt.sample_rate,
            audio_rx,
            on_transcript,
            stop_flag,
        )
        .await
        {
            let _ = app.emit("recording-error", e);
        }
        let _ = app.emit("recording-state", false);
    });

    Ok(())
}

#[tauri::command]
pub fn stop_recording(state: State<AppState>) {
    if let Some(flag) = state.stop_flag.lock().unwrap().as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
    state.is_recording.store(false, Ordering::Relaxed);
}

// ── AI ────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn ask_ai(
    question: String,
    mode: String,
    model: String,
    use_screen: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let key = state.openai_key.lock().unwrap().clone();
    if key.is_empty() {
        return Err("OpenAI API key not set. Open ⚙ Settings and paste your key.".into());
    }

    let transcript = {
        let buf = state.transcript_buffer.lock().unwrap();
        let start = buf.len().saturating_sub(15);
        buf[start..].join(" ")
    };

    if transcript.is_empty() {
        return Err("No transcript yet — start recording first.".into());
    }

    let screenshot = if use_screen {
        match crate::screenshot::capture_screenshot_base64() {
            Ok(img) => Some(img),
            Err(e) => {
                eprintln!("[screenshot] {e}");
                None
            }
        }
    } else {
        None
    };

    let _ = app.emit("ai-thinking", true);

    let client = OpenAIClient::new(key);
    let result = client
        .ask_with_mode(&transcript, &question, &mode, &model, screenshot.as_deref())
        .await;

    let _ = app.emit("ai-thinking", false);

    match result {
        Ok(answer) => {
            let _ = app.emit("ai-response", &answer);
            Ok(answer)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn generate_notes(
    model: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let key = state.openai_key.lock().unwrap().clone();
    if key.is_empty() {
        return Err("OpenAI API key not set.".into());
    }

    let transcript = {
        let buf = state.transcript_buffer.lock().unwrap();
        buf.join(" ")
    };

    if transcript.is_empty() {
        return Err("No transcript to summarize.".into());
    }

    let client = OpenAIClient::new(key);
    client.generate_notes(&transcript, &model).await
}

#[tauri::command]
pub fn get_transcript(state: State<AppState>) -> Vec<String> {
    state.transcript_buffer.lock().unwrap().clone()
}

#[tauri::command]
pub fn clear_session(state: State<AppState>) {
    state.transcript_buffer.lock().unwrap().clear();
}

#[tauri::command]
pub fn capture_screenshot() -> Result<String, String> {
    crate::screenshot::capture_screenshot_base64()
}

// ── Window ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn set_opacity(_opacity: f64, _app: AppHandle) -> Result<(), String> {
    Ok(())
}
