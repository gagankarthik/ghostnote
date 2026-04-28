// API keys baked into the binary at compile time.
//
// Set these as environment variables before running `cargo build` / `npm run tauri build`:
//
//   OPENAI_KEY=sk-...  DEEPGRAM_KEY=...  npm run tauri build
//
// Or add them to .cargo/config.toml (that file is git-ignored):
//
//   [env]
//   OPENAI_KEY   = "sk-..."
//   DEEPGRAM_KEY = "..."
//
// Once compiled, the keys are embedded in the binary — no .env file,
// no Settings UI needed.  Users receive the app ready to run.

// AWS credentials for DynamoDB (bake via [env] in .cargo/config.toml)
pub const AWS_ACCESS_KEY_ID: &str = match option_env!("AWS_ACCESS_KEY_ID") {
    Some(k) => k,
    None => "",
};
pub const AWS_SECRET_ACCESS_KEY: &str = match option_env!("AWS_SECRET_ACCESS_KEY") {
    Some(k) => k,
    None => "",
};
pub const AWS_REGION: &str = match option_env!("AWS_REGION") {
    Some(k) => k,
    None => "us-east-2",
};

pub const OPENAI_KEY: &str = match option_env!("OPENAI_KEY") {
    Some(k) => k,
    None => "",
};

pub const DEEPGRAM_KEY: &str = match option_env!("DEEPGRAM_KEY") {
    Some(k) => k,
    None => "",
};
