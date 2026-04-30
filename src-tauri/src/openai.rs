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
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_default(),
        }
    }

    fn system_prompt() -> &'static str {
        "You are Cluely — an elite real-time AI assistant built for high-stakes meetings, \
         job interviews, sales calls, and technical discussions.\n\
         \n\
         ## Core Rules\n\
         - **Be accurate and specific.** Never give vague, hedged non-answers.\n\
         - **Use markdown formatting:** **bold** for key terms, bullet lists (- item) for \
           multiple points, numbered lists for steps. Use ## headers only in notes/summaries.\n\
         - **Start immediately** — no preamble, no \"Great question!\", no meta-commentary.\n\
         - **Match length to complexity:** simple factual question = 1-2 sentences; \
           complex interview/technical question = structured response with 4-8 sentences or bullets.\n\
         \n\
         ## For Interview & Behavioral Questions\n\
         When the transcript contains interview-style questions (\"Tell me about a time...\", \
         \"What's your experience with...\", \"How would you handle...\", \"Why should we hire you...\"):\n\
         - Provide a **complete, compelling answer** the user can adapt and deliver confidently.\n\
         - Use **STAR format** (Situation → Task → Action → Result) for behavioral questions.\n\
         - Include specific metrics, technologies, or outcomes. Be concrete, not generic.\n\
         - End with a strong one-sentence conclusion.\n\
         \n\
         ## For Technical Questions\n\
         - Give the precise, accurate technical answer.\n\
         - Use bullet points for multi-step explanations.\n\
         - Include specific technical details (names, versions, concepts).\n\
         - If a code example helps, include a short inline one.\n\
         \n\
         ## For Auto-Assist (no explicit question)\n\
         When triggered without a specific question, analyze the latest transcript and:\n\
         - Identify what's being asked or discussed.\n\
         - **Suggested reply:** [a specific, smart thing the user could say right now]\n\
         - Add 1-2 bullet points of relevant context or talking points if helpful.\n\
         \n\
         ## For Meeting / Factual Questions\n\
         - Answer directly and accurately.\n\
         - One supporting sentence of context if it adds value.\n\
         \n\
         ## Absolute Rules\n\
         - Never say \"I don't know\" — give your best informed answer and flag uncertainty briefly.\n\
         - Never repeat back the question.\n\
         - Never break character or mention being an AI unless directly asked."
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

    // Primary streaming ask — multi-turn conversation history + rich context
    pub async fn ask_stream<F>(
        &self,
        transcript: &str,
        question: &str,
        history: &[(String, String)],
        screenshot_b64: Option<&str>,
        on_chunk: F,
    ) -> Result<String, String>
    where
        F: Fn(String),
    {
        let system = Self::system_prompt();

        // Build messages array with full conversation history
        let mut messages: Vec<serde_json::Value> = vec![
            json!({ "role": "system", "content": system })
        ];

        // Inject prior Q&A turns so the AI has conversation memory
        for (user_msg, assistant_msg) in history {
            messages.push(json!({ "role": "user", "content": user_msg }));
            messages.push(json!({ "role": "assistant", "content": assistant_msg }));
        }

        let screen_hint = if screenshot_b64.is_some() {
            " [A screenshot of the user's current screen is included for context.]"
        } else {
            ""
        };

        let user_text = if question.trim().is_empty() {
            format!(
                "Live meeting transcript{screen_hint}:\n{transcript}\n\n\
                 What's the most important thing to address right now? \
                 Give a specific, actionable suggestion."
            )
        } else {
            format!(
                "Live meeting transcript{screen_hint}:\n{transcript}\n\n\
                 Question: {question}"
            )
        };

        // Add current user message (with screenshot if present)
        if let Some(img) = screenshot_b64 {
            messages.push(json!({
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": format!("data:image/jpeg;base64,{}", img),
                            "detail": "low"
                        }
                    },
                    { "type": "text", "text": user_text }
                ]
            }));
        } else {
            messages.push(json!({ "role": "user", "content": user_text }));
        }

        let body = json!({
            "model": "gpt-4o",
            "stream": true,
            "messages": messages,
            "max_tokens": 600,
            "temperature": 0.3
        });

        self.post_chat_stream(body, on_chunk).await
    }

    // Meeting notes — full transcript, structured output
    pub async fn generate_notes(&self, transcript: &str) -> Result<String, String> {
        let system = "You are an expert meeting summarizer. Generate precise, structured meeting notes \
                      from the transcript. Use exact names, decisions, numbers, and technical terms from the transcript. \
                      Never paraphrase vaguely — be specific and concrete.";

        let user = format!(
            "Transcript:\n{transcript}\n\n\
             Generate meeting notes in this exact format:\n\
             \n\
             ## Summary\n\
             [2-3 sentences covering what this meeting was about and the main outcome]\n\
             \n\
             ## Key Points\n\
             - [specific point from the transcript]\n\
             - [specific point from the transcript]\n\
             \n\
             ## Decisions Made\n\
             - [decision] — [who decided / agreed]\n\
             \n\
             ## Action Items\n\
             - [ ] [task] — [owner] [deadline if mentioned]\n\
             \n\
             ## Open Questions\n\
             - [unresolved question or topic needing follow-up]"
        );

        let body = json!({
            "model": "gpt-4o",
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ],
            "max_tokens": 1200,
            "temperature": 0.2
        });

        self.post_chat(body).await
    }
}
