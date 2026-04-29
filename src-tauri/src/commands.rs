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
        return Err("Deepgram API key not configured. Contact your administrator.".into());
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

// ── AI (streaming — primary path) ────────────────────────────────────────────

#[tauri::command]
pub async fn ask_ai_stream(
    question: String,
    use_screen: bool,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let key = state.openai_key.lock().unwrap().clone();
    if key.is_empty() {
        return Err("OpenAI API key not configured. Contact your administrator.".into());
    }

    let transcript = {
        let buf = state.transcript_buffer.lock().unwrap();
        let start = buf.len().saturating_sub(20);
        buf[start..].join("\n")
    };

    // Only block when the question is empty (auto-assist mode) and there's no transcript.
    // When the user types a direct question, pass the transcript as context but don't require it.
    if transcript.is_empty() && question.trim().is_empty() {
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

    let app_clone = app.clone();
    let client = OpenAIClient::new(key);

    let result = client
        .ask_stream(
            &transcript,
            &question,
            screenshot.as_deref(),
            move |token| {
                let _ = app_clone.emit("ai-chunk", &token);
            },
        )
        .await;

    match result {
        Ok(full_text) => {
            let _ = app.emit("ai-stream-done", ());
            Ok(full_text)
        }
        Err(e) => {
            let _ = app.emit("ai-stream-error", &e);
            Err(e)
        }
    }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn generate_notes(state: State<'_, AppState>) -> Result<String, String> {
    let key = state.openai_key.lock().unwrap().clone();
    if key.is_empty() {
        return Err("OpenAI API key not configured.".into());
    }

    let transcript = {
        let buf = state.transcript_buffer.lock().unwrap();
        buf.join("\n")
    };

    if transcript.is_empty() {
        return Err("No transcript to summarize.".into());
    }

    let client = OpenAIClient::new(key);
    client.generate_notes(&transcript).await
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

// ── DynamoDB ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_meeting(
    meeting: crate::dynamodb::MeetingRecord,
    user_email: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let client = state.dynamo_client.lock().unwrap().clone();
    match client {
        Some(c) => crate::dynamodb::save_meeting(&c, &user_email, &meeting).await,
        None    => Err("DynamoDB not configured — add AWS credentials to .cargo/config.toml".into()),
    }
}

#[tauri::command]
pub async fn get_meetings(
    user_email: String,
    state: State<'_, AppState>,
) -> Result<Vec<crate::dynamodb::MeetingRecord>, String> {
    let client = state.dynamo_client.lock().unwrap().clone();
    match client {
        Some(c) => crate::dynamodb::get_meetings(&c, &user_email).await,
        None    => Err("DynamoDB not configured — add AWS credentials to .cargo/config.toml".into()),
    }
}

#[tauri::command]
pub async fn delete_meeting(
    meeting_id: String,
    user_email: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let client = state.dynamo_client.lock().unwrap().clone();
    match client {
        Some(c) => crate::dynamodb::delete_meeting(&c, &user_email, &meeting_id).await,
        None    => Err("DynamoDB not configured — add AWS credentials to .cargo/config.toml".into()),
    }
}
