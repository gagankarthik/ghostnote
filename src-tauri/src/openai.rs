use futures_util::StreamExt;
use serde_json::json;

pub struct OpenAIClient {
    api_key: String,
    client: reqwest::Client,
}

impl OpenAIClient {
    pub fn new(api_key: String) -> Self {
        OpenAIClient {
            api_key,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(45))
                .build()
                .unwrap_or_default(),
        }
    }

    // Single smart system prompt — no modes, no model selection, just useful + concise
    fn system_prompt() -> &'static str {
        "You are Ghostnote — a real-time AI assistant embedded in a live meeting.\n\
         Your job: give the most useful, actionable answer in the fewest words possible.\n\
         \n\
         RULES:\n\
         - Max 120 words total. Hard limit. Every word must earn its place.\n\
         - If it's a discussion point: surface the key insight or best next action\n\
         - If there's a decision to make: identify the options and recommend one\n\
         - If asked for follow-up questions: suggest 2-3 sharp, specific questions\n\
         - If the user asks a direct question: answer it directly and concisely\n\
         - Use **bold** only for key terms\n\
         - Use bullets (•) only when listing steps or options\n\
         - Never say 'Great question!', 'Certainly!', or any preamble\n\
         - Never explain what you're about to do — just do it\n\
         - Start with the most important thing immediately\n\
         - If the transcript is unclear, still try to help based on context"
    }

    // Non-streaming (used by generate_notes)
    async fn chat(&self, system: &str, user: &str, max_tokens: u32) -> Result<String, String> {
        let body = json!({
            "model": "gpt-4o-mini",
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ],
            "max_tokens": max_tokens,
            "temperature": 0.25
        });
        self.post_chat(body).await
    }

    async fn post_chat(&self, body: serde_json::Value) -> Result<String, String> {
        let resp = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 401 {
                return Err("OpenAI key rejected — check your API key.".into());
            }
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|j| j["error"]["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("HTTP {status}"));
            return Err(format!("OpenAI: {msg}"));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }

    // Streaming via SSE
    async fn post_chat_stream<F>(&self, body: serde_json::Value, on_chunk: F) -> Result<String, String>
    where
        F: Fn(String),
    {
        let resp = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 401 {
                return Err("OpenAI key rejected — check your API key.".into());
            }
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|j| j["error"]["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("HTTP {status}"));
            return Err(format!("OpenAI: {msg}"));
        }

        let mut byte_stream = resp.bytes_stream();
        let mut line_buf = String::new();
        let mut full_text = String::new();

        while let Some(chunk_result) = byte_stream.next().await {
            let bytes = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
            line_buf.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(newline_pos) = line_buf.find('\n') {
                let line = line_buf[..newline_pos].trim_end_matches('\r').to_string();
                line_buf = line_buf[newline_pos + 1..].to_string();

                if line.is_empty() { continue; }

                if let Some(data) = line.strip_prefix("data: ") {
                    let data = data.trim();
                    if data == "[DONE]" { return Ok(full_text); }
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(token) = parsed["choices"][0]["delta"]["content"].as_str() {
                            if !token.is_empty() {
                                full_text.push_str(token);
                                on_chunk(token.to_string());
                            }
                        }
                    }
                }
            }
        }
        Ok(full_text)
    }

    // Primary streaming ask — single smart prompt, no modes/models
    pub async fn ask_stream<F>(
        &self,
        transcript: &str,
        question: &str,
        screenshot_b64: Option<&str>,
        on_chunk: F,
    ) -> Result<String, String>
    where
        F: Fn(String),
    {
        let system = Self::system_prompt();

        let screen_hint = if screenshot_b64.is_some() {
            " [Screenshot of the current screen included for context.]"
        } else {
            ""
        };

        let user_text = if question.is_empty() {
            format!(
                "Live transcript{screen_hint}:\n{transcript}\n\nWhat should I say or do right now?"
            )
        } else {
            format!(
                "Live transcript{screen_hint}:\n{transcript}\n\nUser question: {question}"
            )
        };

        let body = match screenshot_b64 {
            Some(img) => json!({
                "model": "gpt-4o-mini",
                "stream": true,
                "messages": [
                    { "role": "system", "content": system },
                    {
                        "role": "user",
                        "content": [
                            { "type": "image_url", "image_url": { "url": format!("data:image/jpeg;base64,{}", img), "detail": "low" } },
                            { "type": "text", "text": user_text }
                        ]
                    }
                ],
                "max_tokens": 250,
                "temperature": 0.25
            }),
            None => json!({
                "model": "gpt-4o-mini",
                "stream": true,
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user_text }
                ],
                "max_tokens": 250,
                "temperature": 0.25
            }),
        };

        self.post_chat_stream(body, on_chunk).await
    }

    // Meeting notes — allowed to be longer
    pub async fn generate_notes(&self, transcript: &str) -> Result<String, String> {
        let system = "Generate clean, structured meeting notes. Be specific — use exact names, decisions, and numbers from the transcript.";

        let user = format!(
            "Transcript:\n{transcript}\n\n\
             Format:\n\
             ## Summary\n[2-3 sentences]\n\n\
             ## Key Decisions\n• [decision]\n\n\
             ## Action Items\n• [task] — [owner] by [date if mentioned]\n\n\
             ## Open Questions\n• [unresolved item]"
        );

        self.chat(system, &user, 700).await
    }
}
