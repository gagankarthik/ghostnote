import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { TranscriptSegment, AppView, AIMode, AIModel, Toast } from "./types";

let segId = 0;
let toastId = 0;

// ── Markdown renderer ──────────────────────────────────────────────────────────
function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return <div key={i} className="md-h2">{line.slice(3)}</div>;
        if (line.startsWith("### "))
          return <div key={i} className="md-h3">{line.slice(4)}</div>;
        if (line.startsWith("- ") || line.startsWith("• "))
          return <div key={i} className="md-bullet">• {line.slice(2)}</div>;
        if (line.trim() === "")
          return <div key={i} className="md-spacer" />;
        return <div key={i} className="md-p">{line}</div>;
      })}
    </div>
  );
}

// ── Format elapsed seconds ─────────────────────────────────────────────────────
function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ── Copy to clipboard helper ───────────────────────────────────────────────────
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Core state
  const [isRecording, setIsRecording] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiThinking, setAiThinking] = useState(false);

  // UI state
  const [view, setView] = useState<AppView>("overlay");
  const [compact, setCompact] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [question, setQuestion] = useState("");
  const [showQuestionInput, setShowQuestionInput] = useState(false);
  const [copied, setCopied] = useState(false);

  // Recording timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Settings
  const [mode, setMode] = useState<AIMode>("interview");
  const [aiModel, setAiModel] = useState<AIModel>("gpt-4o-mini");
  const [useScreen, setUseScreen] = useState(false);
  const [autoAsk, setAutoAsk] = useState(false);
  const [opacity, setOpacity] = useState(92);
  const [openaiKey, setOpenaiKey] = useState("");
  const [deepgramKey, setDeepgramKey] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [notes, setNotes] = useState("");

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Refs so event listeners always see latest values without re-registering
  const aiThinkingRef = useRef(false);
  const autoAskRef = useRef(false);
  const modeRef = useRef<AIMode>("interview");
  const aiModelRef = useRef<AIModel>("gpt-4o-mini");
  const useScreenRef = useRef(false);
  const questionRef = useRef("");

  useEffect(() => { aiThinkingRef.current = aiThinking; }, [aiThinking]);
  useEffect(() => { autoAskRef.current = autoAsk; }, [autoAsk]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { aiModelRef.current = aiModel; }, [aiModel]);
  useEffect(() => { useScreenRef.current = useScreen; }, [useScreen]);
  useEffect(() => { questionRef.current = question; }, [question]);

  // Apply opacity to root
  useEffect(() => {
    document.querySelector<HTMLDivElement>(".app")?.style.setProperty(
      "--app-opacity",
      String(opacity / 100)
    );
  }, [opacity]);

  // ── Toast system ────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = String(++toastId);
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismissToast = (id: string) =>
    setToasts(prev => prev.filter(t => t.id !== id));

  // ── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const envOpenAI = (import.meta.env.VITE_OPENAI_KEY as string | undefined) ?? "";
    const envDeepgram = (import.meta.env.VITE_DEEPGRAM_KEY as string | undefined) ?? "";
    const hasEnv =
      envOpenAI && envOpenAI !== "your-openai-key-here" &&
      envDeepgram && envDeepgram !== "your-deepgram-key-here";

    if (hasEnv) {
      setOpenaiKey(envOpenAI);
      setDeepgramKey(envDeepgram);
      api.saveSettings(envOpenAI, envDeepgram).catch(() => {});
    } else {
      api.getSettings().then(([ok, dk]) => {
        setOpenaiKey(ok);
        setDeepgramKey(dk);
      });
    }
  }, []);

  // ── Recording timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // ── Stable ask-AI handler ──────────────────────────────────────────────────
  const handleAskAI = useCallback(async (q: string) => {
    if (aiThinkingRef.current) return;
    try {
      await api.askAi(q || questionRef.current, modeRef.current, aiModelRef.current, useScreenRef.current);
      setShowQuestionInput(false);
      setQuestion("");
    } catch (e) {
      addToast(String(e));
    }
  }, [addToast]);

  const handleAskAIRef = useRef(handleAskAI);
  useEffect(() => { handleAskAIRef.current = handleAskAI; }, [handleAskAI]);

  // ── Tauri event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      listen<{ text: string; is_final: boolean }>("transcript", ({ payload }) => {
        if (payload.is_final) {
          setInterimText("");
          setSegments(prev => [
            ...prev,
            { id: String(++segId), text: payload.text, timestamp: Date.now() },
          ]);
          if (autoAskRef.current && !aiThinkingRef.current) {
            handleAskAIRef.current("");
          }
        } else {
          setInterimText(payload.text);
        }
      }),

      listen<boolean>("recording-state", ({ payload }) => {
        setIsRecording(payload);
      }),

      listen<string>("recording-error", ({ payload }) => {
        setIsRecording(false);
        addToast(payload);
      }),

      listen<boolean>("ai-thinking", ({ payload }) => {
        setAiThinking(payload);
      }),

      listen<string>("ai-response", ({ payload }) => {
        setAiResponse(payload);
      }),

      listen("hotkey-ask-ai", () => {
        handleAskAIRef.current("");
      }),

      listen("toggle-visibility", async () => {
        const win = getCurrentWindow();
        const visible = await win.isVisible();
        if (visible) {
          await win.hide();
        } else {
          await win.show();
          await win.setFocus();
        }
      }),
    ];

    return () => { unsubs.forEach(p => p.then(f => f())); };
  }, [addToast]);

  // ── Auto-scroll transcript ─────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    try {
      await api.startRecording();
      setSegments([]);
      setInterimText("");
      setAiResponse("");
    } catch (e) {
      addToast(String(e));
    }
  };

  const handleStopRecording = () => {
    api.stopRecording();
    setIsRecording(false);
  };

  const handleAskAIClick = async () => {
    if (aiThinking) return;
    if (mode === "interview") {
      await handleAskAI("");
    } else {
      setShowQuestionInput(v => !v);
    }
  };

  const handleGenerateNotes = async () => {
    setAiThinking(true);
    try {
      const n = await api.generateNotes(aiModel);
      setNotes(n);
      setView("notes");
    } catch (e) {
      addToast(String(e));
    }
    setAiThinking(false);
  };

  const handleSaveSettings = async () => {
    try {
      await api.saveSettings(openaiKey, deepgramKey);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch (e) {
      addToast(String(e));
    }
  };

  const handleClearSession = () => {
    api.clearSession();
    setSegments([]);
    setInterimText("");
    setAiResponse("");
    setNotes("");
  };

  const handleCopyAI = async () => {
    if (!aiResponse) return;
    const ok = await copyText(aiResponse);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleExportTranscript = async () => {
    const text = segments.map(s => s.text).join("\n");
    if (!text) return;
    const ok = await copyText(text);
    if (ok) addToast("Transcript copied to clipboard", "success");
  };

  // Drag — use native startDragging (works on transparent frameless windows)
  const handleTitlebarMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, select, input")) return;
    await getCurrentWindow().startDragging();
  };

  const recentTranscript = segments.slice(-10);
  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);

  return (
    <div className={`app${compact ? " compact" : ""}`} style={{ opacity: opacity / 100 }}>

      {/* ── Toast stack ──────────────────────────────────────────────────── */}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              <button className="toast-close" onClick={() => dismissToast(t.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Title bar ────────────────────────────────────────────────────── */}
      <div className="titlebar" onMouseDown={handleTitlebarMouseDown}>
        <span className="logo">Ghostnote</span>

        {isRecording && (
          <div className="recording-indicator">
            <div className="rec-dot" />
            <span>{fmtTime(elapsed)}</span>
          </div>
        )}

        <div className="titlebar-spacer" />

        {view !== "settings" && (
          <>
            <button
              className="titlebar-btn"
              title="Overlay"
              onClick={() => setView("overlay")}
              style={{ color: view === "overlay" ? "#C4B5FD" : undefined }}
            >◈</button>
            <button
              className="titlebar-btn"
              title="Notes"
              onClick={() => setView("notes")}
              style={{ color: view === "notes" ? "#C4B5FD" : undefined }}
            >📋</button>
          </>
        )}
        <button
          className="titlebar-btn"
          title="Settings"
          onClick={() => setView(v => v === "settings" ? "overlay" : "settings")}
        >⚙</button>
        <button
          className="titlebar-btn"
          title={compact ? "Expand" : "Compact"}
          onClick={() => setCompact(v => !v)}
        >
          {compact ? "⬆" : "⬇"}
        </button>
      </div>

      {!compact && (
        <>
          {/* ── Controls bar ──────────────────────────────────────────────── */}
          {view !== "settings" && (
            <div className="controls">
              {!isRecording ? (
                <button className="btn btn-record" onClick={handleStartRecording}>● Record</button>
              ) : (
                <button className="btn btn-stop" onClick={handleStopRecording}>■ Stop</button>
              )}

              <button
                className="btn btn-ask"
                disabled={aiThinking || segments.length === 0}
                onClick={handleAskAIClick}
                title="Ctrl+Enter"
              >
                {aiThinking
                  ? <><span className="spinner" /> Thinking…</>
                  : "⚡ Ask AI"}
              </button>

              <button
                className={`btn ${useScreen ? "btn-screen-on" : "btn-ghost"}`}
                title={useScreen ? "Screen context ON" : "Include screen context"}
                onClick={() => setUseScreen(v => !v)}
              >🖥</button>

              {isRecording && segments.length > 0 && (
                <button className="btn btn-ghost" onClick={handleGenerateNotes} disabled={aiThinking}>
                  📋
                </button>
              )}

              <div className="controls-spacer" />

              {wordCount > 0 && (
                <span className="word-count">{wordCount}w</span>
              )}

              <select
                className="mode-select"
                value={mode}
                onChange={e => setMode(e.target.value as AIMode)}
              >
                <option value="interview">Interview</option>
                <option value="meeting">Meeting</option>
                <option value="notes">Notes</option>
              </select>

              <button className="btn btn-ghost" onClick={handleClearSession} title="Clear session">✕</button>
            </div>
          )}

          {/* ── Question input ──────────────────────────────────────────── */}
          {showQuestionInput && view === "overlay" && (
            <div className="question-bar">
              <input
                className="form-input"
                placeholder="Ask a question…"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAskAI(question)}
                autoFocus
              />
              <button className="btn btn-ask" onClick={() => handleAskAI(question)}>→</button>
            </div>
          )}

          {/* ── Views ──────────────────────────────────────────────────── */}
          {view === "overlay" && (
            <div className="main-content">
              {/* Transcript */}
              <div className="transcript-section">
                <div className="section-header">
                  <span className="section-label">Transcript</span>
                  {segments.length > 0 && (
                    <button className="icon-btn" title="Copy transcript" onClick={handleExportTranscript}>⎘</button>
                  )}
                </div>
                <div className="transcript-scroll">
                  {segments.length === 0 && !interimText && (
                    <div className="transcript-empty">
                      {isRecording
                        ? "Listening to system audio…"
                        : "Press Record to start capturing audio"}
                    </div>
                  )}
                  {recentTranscript.map((seg, i) => (
                    <div
                      key={seg.id}
                      className={`transcript-segment final${i === recentTranscript.length - 1 ? " latest" : ""}`}
                    >
                      {seg.text}
                    </div>
                  ))}
                  {interimText && (
                    <div className="transcript-segment interim">{interimText}</div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>

              {/* AI Response */}
              {(aiThinking || aiResponse) && (
                <>
                  <div className="ai-divider" />
                  <div className="ai-panel">
                    <div className="ai-panel-header">
                      <span className="ai-label">AI · {aiModel}</span>
                      {autoAsk && <span className="auto-badge">AUTO</span>}
                      {aiThinking && (
                        <div className="ai-thinking-dots">
                          <span /><span /><span />
                        </div>
                      )}
                      <div style={{ flex: 1 }} />
                      {aiResponse && !aiThinking && (
                        <button className="icon-btn" title="Copy response" onClick={handleCopyAI}>
                          {copied ? "✓" : "⎘"}
                        </button>
                      )}
                    </div>
                    <div className="ai-response-scroll">
                      {aiResponse && !aiThinking && (
                        <SimpleMarkdown text={aiResponse} className="ai-response-text" />
                      )}
                      {aiThinking && (
                        <div className="ai-whisper">Analyzing context…</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "notes" && (
            <div className="notes-view">
              <div className="notes-toolbar">
                <button className="btn btn-ghost" onClick={() => setView("overlay")}>← Back</button>
                <button className="btn btn-ask" onClick={handleGenerateNotes} disabled={aiThinking}>
                  {aiThinking ? <><span className="spinner" /> Generating…</> : "↺ Regenerate"}
                </button>
                <div style={{ flex: 1 }} />
                {notes && (
                  <button className="icon-btn" title="Copy notes" onClick={() => copyText(notes).then(ok => ok && addToast("Notes copied", "success"))}>⎘</button>
                )}
              </div>
              <div className="notes-scroll">
                {notes ? (
                  <SimpleMarkdown text={notes} className="notes-text" />
                ) : (
                  <div className="notes-empty">
                    Stop recording and click "📋" to generate meeting notes
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "settings" && (
            <div className="settings-view">
              <div className="settings-title">API Keys</div>

              <div className="settings-group">
                <label className="form-label">OpenAI API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="sk-…"
                  value={openaiKey}
                  onChange={e => setOpenaiKey(e.target.value)}
                />
              </div>

              <div className="settings-group">
                <label className="form-label">Deepgram API Key</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="deepgram key…"
                  value={deepgramKey}
                  onChange={e => setDeepgramKey(e.target.value)}
                />
                <span className="settings-hint">
                  Captures system audio via WASAPI — no meeting bot, no SDK injection.
                </span>
              </div>

              <button
                className="btn btn-ask"
                onClick={handleSaveSettings}
                style={{ alignSelf: "flex-start" }}
              >
                {settingsSaved ? "✓ Saved" : "Save Keys"}
              </button>

              <div className="ai-divider" />

              <div className="settings-title">AI Model</div>
              <div className="settings-group">
                <div className="model-picker">
                  {(["gpt-4o-mini", "gpt-4o"] as AIModel[]).map(m => (
                    <button
                      key={m}
                      className={`model-btn${aiModel === m ? " active" : ""}`}
                      onClick={() => setAiModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <span className="settings-hint">
                  gpt-4o-mini: fast &amp; cheap (~$0.00015/1K tokens) · gpt-4o: smarter, costs ~10×
                </span>
              </div>

              <div className="ai-divider" />

              <div className="settings-title">Behaviour</div>
              <div className="settings-group">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={autoAsk}
                    onChange={e => setAutoAsk(e.target.checked)}
                    style={{ accentColor: "#7C3AED" }}
                  />
                  <span>Auto-ask AI after each utterance</span>
                </label>
                <span className="settings-hint">
                  AI responds automatically every time a sentence completes (interview mode recommended).
                </span>
              </div>

              <div className="settings-group">
                <label className="form-label">Overlay Opacity — {opacity}%</label>
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  className="opacity-slider"
                />
              </div>

              <div className="ai-divider" />

              <div className="settings-title">Shortcuts</div>
              <div className="shortcuts-list">
                <div className="shortcut-row">
                  <span>Ask AI instantly</span>
                  <span className="kbd">Ctrl+Enter</span>
                </div>
                <div className="shortcut-row">
                  <span>Show / Hide overlay</span>
                  <span className="kbd">Ctrl+Shift+H</span>
                </div>
              </div>

              <div className="ai-divider" />

              <div className="settings-hint" style={{ lineHeight: 1.8 }}>
                <strong>Privacy:</strong> The overlay is invisible to screen sharing via
                WDA_EXCLUDEFROMCAPTURE. Audio never leaves your device raw — Deepgram
                processes via encrypted WebSocket. No meeting bot, no participant list.
              </div>

              <button
                className="btn btn-ghost"
                onClick={() => setView("overlay")}
                style={{ alignSelf: "flex-start", marginTop: 4 }}
              >
                ← Back
              </button>
            </div>
          )}
        </>
      )}

      {/* Compact mode */}
      {compact && (
        <div className="compact-content">
          {isRecording && (
            <span className="compact-timer">{fmtTime(elapsed)}</span>
          )}
          {aiResponse && (
            <span className="compact-ai">{aiResponse.slice(0, 120)}{aiResponse.length > 120 ? "…" : ""}</span>
          )}
          {!isRecording && !aiResponse && (
            <span className="compact-hint">Press Record to start</span>
          )}
        </div>
      )}
    </div>
  );
}
