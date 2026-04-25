import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { TranscriptSegment, AppView, AIMode, AIModel, Toast } from "./types";
import {
  IconMic, IconSquare, IconZap, IconMonitor, IconFileText,
  IconSettings, IconLayers, IconChevronUp, IconChevronDown,
  IconMinus, IconX, IconCopy, IconCheck, IconArrowLeft,
  IconRefresh, IconTrash, IconGhost,
} from "./icons";

let segId = 0;
let toastId = 0;

// ── Markdown renderer ──────────────────────────────────────────────────────────
function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))  return <div key={i} className="md-h2">{line.slice(3)}</div>;
        if (line.startsWith("### ")) return <div key={i} className="md-h3">{line.slice(4)}</div>;
        if (line.startsWith("- ") || line.startsWith("• "))
          return <div key={i} className="md-bullet">• {line.slice(2)}</div>;
        if (line.trim() === "") return <div key={i} className="md-spacer" />;
        return <div key={i} className="md-p">{line}</div>;
      })}
    </div>
  );
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [segments,    setSegments]    = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [aiResponse,  setAiResponse]  = useState("");
  const [aiThinking,  setAiThinking]  = useState(false);

  const [view,             setView]             = useState<AppView>("overlay");
  const [compact,          setCompact]          = useState(false);
  const [toasts,           setToasts]           = useState<Toast[]>([]);
  const [question,         setQuestion]         = useState("");
  const [showQuestionInput,setShowQuestionInput] = useState(false);
  const [copied,           setCopied]           = useState(false);

  const [elapsed,  setElapsed]  = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mode,     setMode]     = useState<AIMode>("interview");
  const [aiModel,  setAiModel]  = useState<AIModel>("gpt-4o-mini");
  const [useScreen,setUseScreen]= useState(false);
  const [autoAsk,  setAutoAsk]  = useState(false);
  const [opacity,  setOpacity]  = useState(90);
  const [notes,    setNotes]    = useState("");

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Refs — keep event listeners current without re-registering
  const aiThinkingRef = useRef(false);
  const autoAskRef    = useRef(false);
  const modeRef       = useRef<AIMode>("interview");
  const aiModelRef    = useRef<AIModel>("gpt-4o-mini");
  const useScreenRef  = useRef(false);
  const questionRef   = useRef("");

  useEffect(() => { aiThinkingRef.current = aiThinking; }, [aiThinking]);
  useEffect(() => { autoAskRef.current    = autoAsk;    }, [autoAsk]);
  useEffect(() => { modeRef.current       = mode;       }, [mode]);
  useEffect(() => { aiModelRef.current    = aiModel;    }, [aiModel]);
  useEffect(() => { useScreenRef.current  = useScreen;  }, [useScreen]);
  useEffect(() => { questionRef.current   = question;   }, [question]);

  // ── Toast system ─────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = String(++toastId);
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // ── Recording timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // ── AI handler (stable ref) ───────────────────────────────────────────────
  const handleAskAI = useCallback(async (q: string) => {
    if (aiThinkingRef.current) return;
    try {
      await api.askAi(q || questionRef.current, modeRef.current, aiModelRef.current, useScreenRef.current);
      setShowQuestionInput(false);
      setQuestion("");
    } catch (e) { addToast(String(e)); }
  }, [addToast]);

  const handleAskAIRef = useRef(handleAskAI);
  useEffect(() => { handleAskAIRef.current = handleAskAI; }, [handleAskAI]);

  // ── Tauri event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      listen<{ text: string; is_final: boolean }>("transcript", ({ payload }) => {
        if (payload.is_final) {
          setInterimText("");
          setSegments(prev => [
            ...prev,
            { id: String(++segId), text: payload.text, timestamp: Date.now() },
          ]);
          if (autoAskRef.current && !aiThinkingRef.current) handleAskAIRef.current("");
        } else {
          setInterimText(payload.text);
        }
      }),
      listen<boolean>("recording-state", ({ payload }) => setIsRecording(payload)),
      listen<string>("recording-error",  ({ payload }) => { setIsRecording(false); addToast(payload); }),
      listen<boolean>("ai-thinking",     ({ payload }) => setAiThinking(payload)),
      listen<string>("ai-response",      ({ payload }) => setAiResponse(payload)),
      listen("hotkey-ask-ai", () => handleAskAIRef.current("")),
      listen("toggle-visibility", async () => {
        const win = getCurrentWindow();
        if (await win.isVisible()) await win.hide();
        else { await win.show(); await win.setFocus(); }
      }),
    ];
    return () => { unsubs.forEach(p => p.then(f => f())); };
  }, [addToast]);

  // ── Auto-scroll transcript ────────────────────────────────────────────────
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [segments, interimText]);

  // ── Drag — onPointerDown + startDragging (needs capability granted) ───────
  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, select, input, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    try { await api.startRecording(); setSegments([]); setInterimText(""); setAiResponse(""); }
    catch (e) { addToast(String(e)); }
  };

  const handleStopRecording   = () => { api.stopRecording(); setIsRecording(false); };
  const handleAskAIClick      = async () => {
    if (aiThinking) return;
    if (mode === "interview") await handleAskAI("");
    else setShowQuestionInput(v => !v);
  };
  const handleGenerateNotes   = async () => {
    setAiThinking(true);
    try { const n = await api.generateNotes(aiModel); setNotes(n); setView("notes"); }
    catch (e) { addToast(String(e)); }
    setAiThinking(false);
  };
  const handleClearSession    = () => {
    api.clearSession(); setSegments([]); setInterimText(""); setAiResponse(""); setNotes("");
  };
  const handleCopyAI          = async () => {
    if (!aiResponse) return;
    if (await copyText(aiResponse)) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };
  const handleExportTranscript= async () => {
    const text = segments.map(s => s.text).join("\n");
    if (!text) return;
    if (await copyText(text)) addToast("Transcript copied to clipboard", "success");
  };
  const handleClose    = () => getCurrentWindow().close().catch(() => {});
  const handleMinimize = () => getCurrentWindow().minimize().catch(() => {});

  const recentTranscript = segments.slice(-10);
  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`app${compact ? " compact" : ""}`} style={{ opacity: opacity / 100 }}>

      {/* ── Toast notifications ── */}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              <button className="toast-close" onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification">
                <IconX size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Title bar (drag region) ── */}
      <div
        className="titlebar"
        onPointerDown={handleDragStart}
        data-tauri-drag-region
        aria-label="Drag to move window"
      >
        {/* Logo */}
        <div className="logo">
          <IconGhost size={14} />
          <span>Ghostnote</span>
        </div>

        {/* Live recording badge */}
        {isRecording && (
          <div className="recording-indicator" title={`Recording — ${fmtTime(elapsed)} elapsed`}>
            <div className="rec-dot" />
            <span>{fmtTime(elapsed)}</span>
          </div>
        )}

        <div className="titlebar-spacer" />

        {/* View switchers */}
        {view !== "settings" && (
          <>
            <button className="titlebar-btn" title="Overlay view"
              onClick={() => setView("overlay")}
              style={{ color: view === "overlay" ? "#C4B5FD" : undefined }}
              aria-pressed={view === "overlay"}>
              <IconLayers size={13} />
            </button>
            <button className="titlebar-btn" title="Meeting notes"
              onClick={() => setView("notes")}
              style={{ color: view === "notes" ? "#C4B5FD" : undefined }}
              aria-pressed={view === "notes"}>
              <IconFileText size={13} />
            </button>
          </>
        )}

        {/* Settings */}
        <button className="titlebar-btn" title="Settings (model, opacity, behaviour)"
          onClick={() => setView(v => v === "settings" ? "overlay" : "settings")}
          style={{ color: view === "settings" ? "#C4B5FD" : undefined }}>
          <IconSettings size={13} />
        </button>

        {/* Compact toggle */}
        <button className="titlebar-btn" title={compact ? "Expand" : "Compact view"}
          onClick={() => setCompact(v => !v)}>
          {compact ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
        </button>

        {/* Window controls */}
        <div className="win-controls">
          <button className="titlebar-btn btn-minimize" title="Minimize to taskbar"
            onClick={handleMinimize} aria-label="Minimize">
            <IconMinus size={12} />
          </button>
          <button className="titlebar-btn btn-close" title="Close Ghostnote"
            onClick={handleClose} aria-label="Close">
            <IconX size={11} />
          </button>
        </div>
      </div>

      {!compact && (
        <>
          {/* ── Control bar ── */}
          {view !== "settings" && (
            <div className="controls" role="toolbar" aria-label="Recording controls">
              {/* Record / Stop */}
              {!isRecording ? (
                <button className="btn btn-record" onClick={handleStartRecording}
                  title="Start capturing system audio (WASAPI loopback)">
                  <IconMic size={13} />
                  <span>Record</span>
                </button>
              ) : (
                <button className="btn btn-stop" onClick={handleStopRecording}
                  title="Stop recording">
                  <IconSquare size={11} />
                  <span>Stop</span>
                </button>
              )}

              {/* Ask AI */}
              <button className="btn btn-ask"
                disabled={aiThinking || segments.length === 0}
                onClick={handleAskAIClick}
                title={`Ask AI (${mode} mode) — Ctrl+Enter`}
                aria-busy={aiThinking}>
                {aiThinking
                  ? <><span className="spinner" /> <span>Thinking…</span></>
                  : <><IconZap size={12} /> <span>Ask AI</span></>}
              </button>

              {/* Screen context */}
              <button
                className={`btn ${useScreen ? "btn-screen-on" : "btn-ghost"}`}
                onClick={() => setUseScreen(v => !v)}
                title={useScreen
                  ? "Screen context enabled — screenshot sent with next AI request"
                  : "Enable screen context — include a screenshot with AI requests"}
                aria-pressed={useScreen}>
                <IconMonitor size={12} />
              </button>

              {/* Generate notes (visible while recording) */}
              {isRecording && segments.length > 0 && (
                <button className="btn btn-ghost" onClick={handleGenerateNotes}
                  disabled={aiThinking}
                  title="Generate structured meeting notes from transcript">
                  <IconFileText size={12} />
                </button>
              )}

              <div className="controls-spacer" />

              {/* Word count annotation */}
              {wordCount > 0 && (
                <span className="word-count" title={`${wordCount} words transcribed`}>
                  {wordCount}w
                </span>
              )}

              {/* Mode selector */}
              <select className="mode-select" value={mode}
                onChange={e => setMode(e.target.value as AIMode)}
                title="AI response mode">
                <option value="interview">Interview</option>
                <option value="meeting">Meeting</option>
                <option value="notes">Notes</option>
              </select>

              {/* Clear session */}
              <button className="btn btn-ghost" onClick={handleClearSession}
                title="Clear transcript and AI response (start fresh)">
                <IconTrash size={12} />
              </button>
            </div>
          )}

          {/* ── Custom question input ── */}
          {showQuestionInput && view === "overlay" && (
            <div className="question-bar" role="search" aria-label="Custom AI question">
              <input className="form-input" placeholder="Ask a specific question…"
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAskAI(question)}
                autoFocus
                aria-label="Question for AI" />
              <button className="btn btn-ask" onClick={() => handleAskAI(question)}
                title="Submit question">
                <IconZap size={12} />
              </button>
            </div>
          )}

          {/* ── Overlay view ── */}
          {view === "overlay" && (
            <div className="main-content">
              {/* Transcript panel */}
              <div className="transcript-section" role="log" aria-label="Live transcript" aria-live="polite">
                <div className="section-header">
                  <span className="section-label">Transcript</span>
                  {segments.length > 0 && (
                    <button className="icon-btn" title="Copy full transcript to clipboard"
                      onClick={handleExportTranscript} aria-label="Copy transcript">
                      <IconCopy size={12} />
                    </button>
                  )}
                </div>
                <div className="transcript-scroll">
                  {segments.length === 0 && !interimText && (
                    <div className="transcript-empty">
                      {isRecording
                        ? "Listening to system audio…"
                        : "Press Record to start capturing meeting audio"}
                    </div>
                  )}
                  {recentTranscript.map((seg, i) => (
                    <div key={seg.id}
                      className={`transcript-segment final${i === recentTranscript.length - 1 ? " latest" : ""}`}>
                      {seg.text}
                    </div>
                  ))}
                  {interimText && (
                    <div className="transcript-segment interim" aria-live="polite">
                      {interimText}
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>

              {/* AI response panel */}
              {(aiThinking || aiResponse) && (
                <>
                  <div className="ai-divider" role="separator" />
                  <div className="ai-panel" aria-label="AI response" aria-live="polite">
                    <div className="ai-panel-header">
                      <span className="ai-label">AI · {aiModel}</span>
                      {autoAsk && (
                        <span className="auto-badge" title="Auto-ask is on — AI responds after each sentence">
                          AUTO
                        </span>
                      )}
                      {aiThinking && (
                        <div className="ai-thinking-dots" aria-label="AI is thinking">
                          <span /><span /><span />
                        </div>
                      )}
                      <div style={{ flex: 1 }} />
                      {aiResponse && !aiThinking && (
                        <button className="icon-btn"
                          title="Copy AI response to clipboard"
                          onClick={handleCopyAI}
                          aria-label="Copy AI response">
                          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        </button>
                      )}
                    </div>
                    <div className="ai-response-scroll">
                      {aiResponse && !aiThinking
                        ? <SimpleMarkdown text={aiResponse} className="ai-response-text" />
                        : <div className="ai-whisper">Analyzing context…</div>}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Notes view ── */}
          {view === "notes" && (
            <div className="notes-view">
              <div className="notes-toolbar">
                <button className="btn btn-ghost" onClick={() => setView("overlay")}
                  title="Back to overlay">
                  <IconArrowLeft size={13} /> <span>Back</span>
                </button>
                <button className="btn btn-ask" onClick={handleGenerateNotes}
                  disabled={aiThinking}
                  title="Re-generate meeting notes from full transcript">
                  {aiThinking
                    ? <><span className="spinner" /> <span>Generating…</span></>
                    : <><IconRefresh size={12} /> <span>Regenerate</span></>}
                </button>
                <div style={{ flex: 1 }} />
                {notes && (
                  <button className="icon-btn"
                    title="Copy notes to clipboard"
                    aria-label="Copy notes"
                    onClick={() => copyText(notes).then(ok => ok && addToast("Notes copied", "success"))}>
                    <IconCopy size={12} />
                  </button>
                )}
              </div>
              <div className="notes-scroll">
                {notes
                  ? <SimpleMarkdown text={notes} className="notes-text" />
                  : <div className="notes-empty">Click Regenerate to generate structured meeting notes</div>}
              </div>
            </div>
          )}

          {/* ── Settings view ── */}
          {view === "settings" && (
            <div className="settings-view">

              {/* AI Model */}
              <div className="settings-section">
                <div className="settings-title">AI Model</div>
                <div className="model-picker">
                  {(["gpt-4o-mini", "gpt-4o"] as AIModel[]).map(m => (
                    <button key={m}
                      className={`model-btn${aiModel === m ? " active" : ""}`}
                      onClick={() => setAiModel(m)}
                      aria-pressed={aiModel === m}
                      title={m === "gpt-4o-mini"
                        ? "Fast and cost-effective (~$0.00015 / 1K tokens)"
                        : "Smarter responses — ~10× the cost of mini"}>
                      {m}
                    </button>
                  ))}
                </div>
                <p className="settings-hint">
                  <strong>gpt-4o-mini</strong> — fast &amp; cheap, great for interviews
                  &nbsp;·&nbsp;
                  <strong>gpt-4o</strong> — best quality, higher cost
                </p>
              </div>

              <div className="ai-divider" />

              {/* Behaviour */}
              <div className="settings-section">
                <div className="settings-title">Behaviour</div>

                <label className="toggle-row"
                  title="AI will respond automatically every time Deepgram finalises a sentence">
                  <input type="checkbox" checked={autoAsk}
                    onChange={e => setAutoAsk(e.target.checked)}
                    style={{ accentColor: "#7C3AED" }} />
                  <span>Auto-ask AI after each utterance</span>
                </label>
                <p className="settings-hint">
                  Recommended in Interview mode — AI responds as soon as each sentence completes.
                </p>

                <label className="form-label" htmlFor="opacity-range">
                  Overlay opacity — {opacity}%
                </label>
                <input id="opacity-range" type="range" min={30} max={100} value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  className="opacity-slider"
                  title="Adjust how transparent the overlay appears" />
              </div>

              <div className="ai-divider" />

              {/* Shortcuts */}
              <div className="settings-section">
                <div className="settings-title">Keyboard Shortcuts</div>
                <div className="shortcuts-list" role="list">
                  <div className="shortcut-row" role="listitem">
                    <span>Ask AI instantly</span>
                    <kbd className="kbd" title="Works globally even when another window is focused">Ctrl+Enter</kbd>
                  </div>
                  <div className="shortcut-row" role="listitem">
                    <span>Show / Hide overlay</span>
                    <kbd className="kbd">Ctrl+Shift+H</kbd>
                  </div>
                </div>
              </div>

              <div className="ai-divider" />

              {/* Privacy note */}
              <div className="settings-section">
                <div className="settings-title">Privacy</div>
                <p className="settings-hint" style={{ lineHeight: 1.8 }}>
                  The overlay uses <code>WDA_EXCLUDEFROMCAPTURE</code> — it is invisible
                  to Zoom, Teams, OBS, and any screen-capture API. No meeting bot is
                  injected. Audio is captured at the OS level via WASAPI loopback and
                  streamed to Deepgram over an encrypted WebSocket.
                </p>
              </div>

              <button className="btn btn-ghost" onClick={() => setView("overlay")}
                style={{ alignSelf: "flex-start" }}
                title="Return to overlay">
                <IconArrowLeft size={13} /> <span>Back</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Compact mode ── */}
      {compact && (
        <div className="compact-content">
          {isRecording && (
            <span className="compact-timer" title="Recording duration">{fmtTime(elapsed)}</span>
          )}
          {aiResponse && (
            <span className="compact-ai" title="Latest AI response">
              {aiResponse.slice(0, 120)}{aiResponse.length > 120 ? "…" : ""}
            </span>
          )}
          {!isRecording && !aiResponse && (
            <span className="compact-hint">Press Record to start</span>
          )}
        </div>
      )}
    </div>
  );
}
