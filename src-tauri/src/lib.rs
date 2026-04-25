mod audio;
mod commands;
mod deepgram;
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
            // Load persisted API keys into AppState
            {
                use tauri::Manager;
                use tauri_plugin_store::StoreExt;
                let app_state = app.state::<AppState>();
                if let Ok(store) = app.handle().store("settings.json") {
                    if let Some(ok) = store
                        .get("openai_key")
                        .and_then(|v| v.as_str().map(String::from))
                    {
                        *app_state.openai_key.lock().unwrap() = ok;
                    }
                    if let Some(dk) = store
                        .get("deepgram_key")
                        .and_then(|v| v.as_str().map(String::from))
                    {
                        *app_state.deepgram_key.lock().unwrap() = dk;
                    }
                }
            }

            // Make the overlay invisible to screen capture APIs on Windows
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                use windows::Win32::UI::WindowsAndMessaging::{
                    SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
                };

                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        // hwnd is windows 0.61 HWND — now matches the crate version we use
                        unsafe {
                            let _ = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
                        }
                    }
                }
            }

            // Register global hotkeys
            use tauri::Emitter;
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
            let app_handle = app.handle().clone();
            app.global_shortcut().on_shortcuts(
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
            )?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_settings,
            commands::get_settings,
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
