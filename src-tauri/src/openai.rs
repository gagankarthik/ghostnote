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

    // ── System prompts ────────────────────────────────────────────────────────

    fn build_context(mode: &str) -> (&'static str, u32) {
        match mode {
            "meeting" => (
                "You are a sharp real-time meeting intelligence assistant embedded in a live meeting.\n\
                 Analyze what was just said and respond with ONLY the following structure (skip empty sections):\n\
                 \n\
                 **Key point:** [Most important insight from the last exchange, 1-2 sentences]\n\
                 **Action item:** [Any commitment or next step — format: Task → Owner]\n\
                 **Suggested response:** \"[Best thing to say next in the meeting]\"\n\
                 \n\
                 Rules:\n\
                 - If someone asked a direct question, answer it concisely first\n\
                 - If a decision was made, confirm and summarize it\n\
                 - If there's a risk or blocker, flag it clearly\n\
                 - Be specific — use exact names and numbers from the conversation\n\
                 - Max 100 words. No preamble. Start immediately with the content.",
                450,
            ),
            "notes" => (
                "You are a precision note-taker capturing a live meeting. Extract only what matters.\n\
                 \n\
                 Format (skip sections with no content):\n\
                 **Decided:** [Main conclusion or decision made]\n\
                 **To-do:**\n\
                 • [Task] — [Owner if mentioned]\n\
                 **Key numbers:** [Metrics, dates, budgets, or estimates mentioned]\n\
                 **Open question:** [Unresolved issue needing follow-up]\n\
                 \n\
                 Rules:\n\
                 - Only include sections that have actual content from the conversation\n\
                 - Use exact numbers and names — no paraphrasing with vague language\n\
                 - Max 5 bullets total\n\
                 - Every word earns its place. No filler.",
                350,
            ),
            _ => (
                // Interview mode — flagship
                "You are an elite interview coach actively listening to a job interview RIGHT NOW.\n\
                 Your mission: help the candidate craft a perfect answer in the next 30 seconds.\n\
                 \n\
                 When you detect an interview question, respond with this EXACT structure:\n\
                 \n\
                 **Question type:** [Behavioral / Technical / Situational / Culture fit]\n\
                 \n\
                 **STAR answer outline:**\n\
                 • **S – Situation:** [Set context — 1 short sentence with specifics]\n\
                 • **T – Task:** [Your specific role or responsibility in that situation]\n\
                 • **A – Actions:** [2-3 concrete steps you took — use strong action verbs]\n\
                 • **R – Result:** [Quantified outcome: include %, time saved, $, or team size]\n\
                 \n\
                 **Open with:** \"[Exact first sentence the candidate should say]\"\n\
                 **Key metric to mention:** [One impressive number or achievement to highlight]\n\
                 \n\
                 When there's no clear question yet: predict what they're about to ask based on the \
                 conversation flow and suggest what the candidate should say proactively.\n\
                 \n\
                 Rules:\n\
                 - Replace vague phrases with specifics: not 'improved performance' but 'reduced latency by 40%'\n\
                 - Tailor the answer to the conversation context — don't give generic advice\n\
                 - Max 220 words\n\
                 - No coaching platitudes. Only immediately actionable content.",
                550,
            ),
        }
    }

    // ── Non-streaming (kept for generate_notes) ───────────────────────────────

    async fn chat(
        &self,
        system: &str,
        user: &str,
        max_tokens: u32,
        model: &str,
    ) -> Result<String, String> {
        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ],
            "max_tokens": max_tokens,
            "temperature": 0.3
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
                return Err("OpenAI key rejected — invalid or expired. Regenerate at platform.openai.com".into());
            }
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|j| j["error"]["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("HTTP {status}"));
            return Err(format!("OpenAI error: {msg}"));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }

    // ── Streaming via SSE ────────────────────────────────────────────────────

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
                return Err("OpenAI key rejected — invalid or expired. Regenerate at platform.openai.com".into());
            }
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|j| j["error"]["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("HTTP {status}"));
            return Err(format!("OpenAI error: {msg}"));
        }

        let mut byte_stream = resp.bytes_stream();
        let mut line_buf = String::new();
        let mut full_text = String::new();

        while let Some(chunk_result) = byte_stream.next().await {
            let bytes = chunk_result.map_err(|e| format!("Stream read error: {e}"))?;
            line_buf.push_str(&String::from_utf8_lossy(&bytes));

            // Process all complete lines in the buffer
            while let Some(newline_pos) = line_buf.find('\n') {
                let line = line_buf[..newline_pos].trim_end_matches('\r').to_string();
                line_buf = line_buf[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    let data = data.trim();
                    if data == "[DONE]" {
                        return Ok(full_text);
                    }
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

    // ── Public API ────────────────────────────────────────────────────────────

    pub async fn ask_with_mode_stream<F>(
        &self,
        transcript: &str,
        question: &str,
        mode: &str,
        model: &str,
        screenshot_b64: Option<&str>,
        on_chunk: F,
    ) -> Result<String, String>
    where
        F: Fn(String),
    {
        let safe_model = if model == "gpt-4o" { "gpt-4o" } else { "gpt-4o-mini" };
        let (system, max_tokens) = Self::build_context(mode);

        let screen_hint = if screenshot_b64.is_some() {
            " [A screenshot of the current screen is also provided for additional context.]"
        } else {
            ""
        };

        let user_text = if question.is_empty() {
            format!(
                "Live conversation transcript{screen_hint}:\n\n{transcript}\n\n\
                 Based on the conversation above, what should the user say or do right now? \
                 Respond with your structured analysis immediately."
            )
        } else {
            format!(
                "Live conversation transcript{screen_hint}:\n\n{transcript}\n\n\
                 User's specific question: {question}\n\n\
                 Answer based on the conversation context. Be specific and immediately actionable."
            )
        };

        let body = match screenshot_b64 {
            Some(img) => json!({
                "model": safe_model,
                "stream": true,
                "messages": [
                    { "role": "system", "content": system },
                    {
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
                    }
                ],
                "max_tokens": max_tokens,
                "temperature": 0.35
            }),
            None => json!({
                "model": safe_model,
                "stream": true,
                "messages": [
                    { "role": "system", "content": system },
                    { "role": "user", "content": user_text }
                ],
                "max_tokens": max_tokens,
                "temperature": 0.35
            }),
        };

        self.post_chat_stream(body, on_chunk).await
    }

    // Kept for backwards compatibility with ask_ai command
    pub async fn ask_with_mode(
        &self,
        transcript: &str,
        question: &str,
        mode: &str,
        model: &str,
        screenshot_b64: Option<&str>,
    ) -> Result<String, String> {
        let safe_model = if model == "gpt-4o" { "gpt-4o" } else { "gpt-4o-mini" };
        let (system, max_tokens) = Self::build_context(mode);

        let user_text = if question.is_empty() {
            format!("Live conversation transcript:\n\n{transcript}\n\nWhat should the user say or do right now?")
        } else {
            format!("Live conversation transcript:\n\n{transcript}\n\nUser's question: {question}")
        };

        match screenshot_b64 {
            Some(img) => {
                let body = json!({
                    "model": safe_model,
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
                    "max_tokens": max_tokens,
                    "temperature": 0.35
                });
                self.post_chat(body).await
            }
            None => self.chat(system, &user_text, max_tokens, safe_model).await,
        }
    }

    pub async fn generate_notes(&self, transcript: &str, model: &str) -> Result<String, String> {
        let safe_model = if model == "gpt-4o" { "gpt-4o" } else { "gpt-4o-mini" };

        let system = "You are a precise meeting note-taker generating comprehensive structured notes.\n\
            Use markdown formatting. Be specific — use exact names, numbers, and decisions from the transcript.\n\
            Include action items with owners and deadlines where mentioned.";

        let user = format!(
            "Generate structured meeting notes from this transcript:\n\n{transcript}\n\n\
             Use this exact format:\n\
             \n\
             ## Summary\n\
             [2-3 sentence overview of the meeting]\n\
             \n\
             ## Key Decisions\n\
             • [Decision with brief context]\n\
             \n\
             ## Action Items\n\
             • [Task] — [Owner] by [Date if mentioned]\n\
             \n\
             ## Open Questions\n\
             • [Unresolved issues]\n\
             \n\
             ## Important Numbers & Dates\n\
             • [Metrics, deadlines, budgets]"
        );

        self.chat(system, &user, 900, safe_model).await
    }
}
