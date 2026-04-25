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

pub const OPENAI_KEY: &str = match option_env!("OPENAI_KEY") {
    Some(k) => k,
    None => "",
};

pub const DEEPGRAM_KEY: &str = match option_env!("DEEPGRAM_KEY") {
    Some(k) => k,
    None => "",
};
