use serde_json::json;

pub struct OpenAIClient {
    api_key: String,
    client: reqwest::Client,
}

impl OpenAIClient {
    pub fn new(api_key: String) -> Self {
        OpenAIClient {
            api_key,
            client: reqwest::Client::new(),
        }
    }

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
            "temperature": 0.4
        });
        self.post_chat(body).await
    }

    async fn chat_vision(
        &self,
        system: &str,
        user_text: &str,
        image_b64: &str,
        max_tokens: u32,
        model: &str,
    ) -> Result<String, String> {
        let body = json!({
            "model": model,
            "messages": [
                { "role": "system", "content": system },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/jpeg;base64,{}", image_b64),
                                "detail": "low"
                            }
                        },
                        { "type": "text", "text": user_text }
                    ]
                }
            ],
            "max_tokens": max_tokens,
            "temperature": 0.4
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
            .map_err(|e| format!("Request error: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if status.as_u16() == 401 {
                return Err("OpenAI key rejected — the key may be invalid, expired, or belong to a different project. Regenerate it at platform.openai.com.".into());
            }
            let msg = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|j| j["error"]["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("HTTP {status}"));
            return Err(format!("OpenAI: {msg}"));
        }

        let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let text = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        Ok(text)
    }

    pub async fn ask_with_mode(
        &self,
        transcript: &str,
        question: &str,
        mode: &str,
        model: &str,
        screenshot_b64: Option<&str>,
    ) -> Result<String, String> {
        let safe_model = if model == "gpt-4o" { "gpt-4o" } else { "gpt-4o-mini" };

        let (system, max_tokens): (&str, u32) = match mode {
            "meeting" => (
                "You are a sharp meeting assistant. Based on the conversation and any screen context, \
                 provide the most useful insight, follow-up question, or action item. \
                 2-3 sentences max. No preamble.",
                350,
            ),
            "notes" => (
                "You are a precise note-taker. Extract the key point, decision, or action \
                 from this conversation in 1-2 concise bullets. Start immediately with the bullets.",
                300,
            ),
            _ => (
                "You are an expert interview coach. When you detect an interview question, \
                 give a STAR-method answer outline (3-5 bullets). If no clear question, \
                 suggest what the user should say next. Be very concise.",
                400,
            ),
        };

        let screen_hint = if screenshot_b64.is_some() {
            " I've also included a screenshot of the current screen for additional context."
        } else {
            ""
        };

        let user_text = if question.is_empty() {
            format!(
                "Conversation context:{screen_hint}\n\n{transcript}\n\nWhat should I say or do next?"
            )
        } else {
            format!(
                "Question: {question}\n\nConversation context:{screen_hint}\n\n{transcript}\n\nAnswer concisely."
            )
        };

        match screenshot_b64 {
            Some(img) => {
                self.chat_vision(system, &user_text, img, max_tokens, safe_model)
                    .await
            }
            None => self.chat(system, &user_text, max_tokens, safe_model).await,
        }
    }

    pub async fn generate_notes(&self, transcript: &str, model: &str) -> Result<String, String> {
        let safe_model = if model == "gpt-4o" { "gpt-4o" } else { "gpt-4o-mini" };

        let system = "You are a precise meeting note-taker. \
            Extract structured notes from meeting transcripts. \
            Format with markdown: ## Summary, ## Key Decisions, ## Action Items, ## Open Questions.";

        let user = format!(
            "Generate structured meeting notes from this transcript:\n\n{transcript}"
        );

        self.chat(system, &user, 800, safe_model).await
    }
}
