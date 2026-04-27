use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http, protocol::Message},
};

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct TranscriptWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct Alternative {
    pub transcript: String,
    pub confidence: f64,
    #[serde(default)]
    pub words: Vec<TranscriptWord>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Channel {
    pub alternatives: Vec<Alternative>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
pub struct DeepgramResult {
    #[serde(rename = "type")]
    pub kind: String,
    pub channel: Option<Channel>,
    #[serde(default)]
    pub is_final: bool,
    #[serde(default)]
    pub speech_final: bool,
}

pub async fn run_deepgram(
    api_key: String,
    sample_rate: u32,
    mut audio_rx: UnboundedReceiver<Vec<u8>>,
    on_transcript: impl Fn(String, bool) + Send + 'static,
    stop_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    // Build the URL without the token — auth goes in the Authorization header.
    // Using IntoClientRequest lets tungstenite generate the WebSocket handshake
    // headers (Upgrade, Sec-WebSocket-Key, etc.) so we only need to add ours.
    let url = format!(
        "wss://api.deepgram.com/v1/listen\
         ?model=nova-2\
         &encoding=linear16\
         &sample_rate={sample_rate}\
         &channels=1\
         &smart_format=true\
         &interim_results=true\
         &utterance_end_ms=1000\
         &vad_events=true"
    );

    let mut request = url.into_client_request().map_err(|e| e.to_string())?;
    request.headers_mut().insert(
        http::header::AUTHORIZATION,
        http::HeaderValue::from_str(&format!("Token {api_key}"))
            .map_err(|e| e.to_string())?,
    );

    let (ws_stream, _) = connect_async(request).await.map_err(|e| {
        let s = e.to_string();
        if s.contains("401") || s.contains("Unauthorized") {
            "Deepgram 401: API key is invalid or revoked. Check DEEPGRAM_KEY in .env.local / .cargo/config.toml".to_string()
        } else {
            s
        }
    })?;
    let (mut write, mut read) = ws_stream.split();

    // Send audio frames
    tokio::spawn(async move {
        while !stop_flag.load(Ordering::Relaxed) {
            match audio_rx.recv().await {
                Some(chunk) => {
                    if write.send(Message::Binary(chunk)).await.is_err() {
                        break;
                    }
                }
                None => break,
            }
        }
        let close = serde_json::json!({"type":"CloseStream"});
        let _ = write.send(Message::Text(close.to_string())).await;
    });

    // Read transcripts
    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(result) = serde_json::from_str::<DeepgramResult>(&text) {
                    if result.kind == "Results" {
                        if let Some(ch) = &result.channel {
                            if let Some(alt) = ch.alternatives.first() {
                                if !alt.transcript.is_empty() {
                                    on_transcript(alt.transcript.clone(), result.is_final);
                                }
                            }
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(_) => break,
            _ => {}
        }
    }

    Ok(())
}
