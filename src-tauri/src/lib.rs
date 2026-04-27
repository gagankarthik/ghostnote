mod audio;
mod commands;
mod deepgram;
mod keys;
mod openai;
mod screenshot;

use std::sync::{atomic::AtomicBool, Arc, Mutex};

pub struct AppState {
    pub openai_key: Mutex<String>,
    pub deepgram_key: Mutex<String>,
    pub is_recording: Arc<AtomicBool>,
    pub stop_flag: Mutex<Option<Arc<AtomicBool>>>,
    pub transcript_buffer: Arc<Mutex<Vec<String>>>,
}

/// Read a KEY=value pair from a .env-style file string.
fn parse_env_value(content: &str, key: &str) -> String {
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix(key) {
            if let Some(val) = rest.strip_prefix('=') {
                let val = val.trim().trim_matches('"').trim_matches('\'');
                // Skip placeholder values
                if !val.is_empty()
                    && !val.starts_with("your-")
                    && !val.ends_with("-here")
                    && val != "sk-..."
                {
                    return val.to_string();
                }
            }
        }
    }
    String::new()
}

/// Load API keys from .env.local in the project root.
/// In dev builds CARGO_MANIFEST_DIR points to src-tauri/, so parent = project root.
/// In release builds the path likely won't exist on the user's machine; that's fine —
/// release builds use keys baked via option_env!() in keys.rs.
fn load_keys_from_dotenv() -> (String, String) {
    // CARGO_MANIFEST_DIR is resolved at compile time to the src-tauri directory.
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let env_file = manifest_dir
        .parent()
        .map(|p| p.join(".env.local"))
        .filter(|p| p.exists());

    if let Some(path) = env_file {
        if let Ok(content) = std::fs::read_to_string(&path) {
            // .env.local uses VITE_ prefix for the frontend; we read the same vars.
            let openai = parse_env_value(&content, "VITE_OPENAI_KEY");
            let deepgram = parse_env_value(&content, "VITE_DEEPGRAM_KEY");
            if !openai.is_empty() && !deepgram.is_empty() {
                return (openai, deepgram);
            }
        }
    }
    (String::new(), String::new())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        openai_key: Mutex::new(String::new()),
        deepgram_key: Mutex::new(String::new()),
        is_recording: Arc::new(AtomicBool::new(false)),
        stop_flag: Mutex::new(None),
        transcript_buffer: Arc::new(Mutex::new(Vec::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(state)
        .setup(|app| {
            use tauri::Manager;

            // ── Load API keys ────────────────────────────────────────────────
            // 1. .env.local in project root  (dev mode — read at runtime)
            // 2. option_env!() baked keys    (release builds via keys.rs)
            {
                let app_state = app.state::<AppState>();

                let (env_openai, env_deepgram) = load_keys_from_dotenv();
                let baked_openai   = keys::OPENAI_KEY.to_string();
                let baked_deepgram = keys::DEEPGRAM_KEY.to_string();

                // Priority: .env.local > baked-in (no store — keys come from code only)
                let openai_key   = if !env_openai.is_empty()   { env_openai   } else { baked_openai   };
                let deepgram_key = if !env_deepgram.is_empty() { env_deepgram } else { baked_deepgram };

                *app_state.openai_key.lock().unwrap()   = openai_key;
                *app_state.deepgram_key.lock().unwrap() = deepgram_key;
            }

            // ── Invisible overlay (exclude from screen capture) ──────────────
            #[cfg(target_os = "windows")]
            {
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
                };
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        unsafe {
                            let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
                        }
                    }
                }
            }

            // ── Global hotkeys ───────────────────────────────────────────────
            use tauri::Emitter;
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            let app_handle = app.handle().clone();
            // Non-fatal: another process may hold Ctrl+Enter; log and continue.
            if let Err(e) = app.global_shortcut().on_shortcuts(
                ["CommandOrControl+Enter", "CommandOrControl+Shift+H"],
                move |_app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let s = shortcut.to_string();
                        if s.contains("Shift") {
                            let _ = app_handle.emit("toggle-visibility", ());
                        } else {
                            let _ = app_handle.emit("hotkey-ask-ai", ());
                        }
                    }
                },
            ) {
                eprintln!("[ghostnote] shortcut registration failed (another app may hold Ctrl+Enter): {e}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_recording,
            commands::stop_recording,
            commands::ask_ai,
            commands::generate_notes,
            commands::get_transcript,
            commands::clear_session,
            commands::capture_screenshot,
            commands::set_opacity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ghostnote");
}
