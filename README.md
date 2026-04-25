# Ghostnote

## What is Ghostnote?

Ghostnote is an **undetectable, on-device AI windows meeting assistant**. It captures your system audio, transcribes conversations in real time, and uses AI to give you instant answers, notes, and suggestions—all inside an overlay that is completely invisible to screen sharing, recordings, and other meeting participants.

### The Core Promise

| Problem | Ghostnote's Answer |
| :--- | :--- |
| Meeting bots are intrusive and obvious | Ghostnote **never joins** your meeting. No bot appears on the guest list. |
| Screen sharing exposes your AI tools | Ghostnote's overlay is **screen-share proof**. Only you can see it. |
| You miss critical moments to respond | Press `Cmd/Ctrl + Enter` and Ghostnote gives you the **exact answer or response** instantly. |
| Notes are messy or non-existent | Ghostnote auto-generates **beautiful, structured notes** ready the moment the meeting ends. |

---

## How It Works

1. **System Audio Loopback** captures everything you hear from meeting apps without injecting a bot.
2. **Real-Time Transcription** converts speech to text with <300ms latency and 95%+ accuracy.
3. **LLM Context Builder** combines the live transcript, user query, and optional screen capture.
4. **Invisible Overlay UI** renders AI responses in a GPU-independent layer excluded from capture APIs.

---

## Features

### 🔒 100% Undetectable

- **No Meeting Bot.** Ghostnote never appears in the participants list. It works at the OS level, not inside meeting apps.
- **Screen-Share Proof.** The overlay is rendered in a hardware layer invisible to equivalent Windows APIs. Go ahead—share your screen. No one sees Ghostnote.
- **No Recording Footprint.** Meeting platforms like Zoom and Teams detect bots via SDK presence. Ghostnote uses zero meeting SDKs. It's just an audio listener.
- **Movable Overlay.** Position the whisper window exactly where your eyes naturally rest. Draggable, resizable, frameless.

### ⚡ Real-Time AI Assistance

- **Instant Answers.** Press `Cmd/Ctrl + Enter` mid-conversation. Ghostnote processes the last 30 seconds of audio plus your screen context and returns a response in under 2 seconds.
- **Prompt Types:**
  - `"What should I say?"` — Returns a suggested response based on conversation context.
  - `"Explain this to me"` — Breaks down complex topics being discussed.
  - `"Fact check"` — Verifies claims against Ghostnote's knowledge base.
  - `"Counter-argument"` — Surfaces respectful rebuttals to a point just made.
- **Predictive Whisper.** Ghostnote detects conversational patterns and proactively suggests responses before you even ask. Objection coming? Ghostnote has the rebuttal ready.

### 📋 Effortless Meeting Notes

- **Auto-Generated Summaries.** The moment your meeting ends, Ghostnote produces structured notes with:
  - Key decisions made
  - Action items (with detected owners)
  - Open questions
  - Timeline of critical moments
- **Action Item Detection.** Ghostnote identifies commitments like *"I'll send that by EOD"* and automatically extracts the who, what, and when.
- **Shareable Export.** One-click export to Notion, Slack, email, or markdown.

### 🧠 Context That Learns

- **Pre-Meeting Brief.** Connect your calendar. Ghostnote scans related emails, docs, and past meeting notes to build a one-page cheat sheet delivered 5 minutes before the meeting.
- **Sentiment Pulse.** Real-time tone analysis. Ghostnote subtly indicates if a speaker sounds frustrated, enthusiastic, or uncertain.
- **Contradiction Tracker.** Across multiple meetings, Ghostnote flags when stakeholders make conflicting statements. No more *"But last week you said..."* surprises.

### 🖥️ Enterprise-Ready Privacy

- **Selective Listening.** Whitelist only meeting apps (Zoom, Teams, Meet). Ghostnote ignores music, notifications, and sensitive side conversations.
- **On-Device Processing Option.** Choose to run transcription and LLM inference entirely locally for air-gapped environments.
- **Data Retention Controls.** Configure auto-deletion of transcripts after 1 hour, 24 hours, or never. Full PII redaction available.
- **No Third-Party Cloud Required for Audio.** Audio never leaves your device unless you enable cloud transcription.

---