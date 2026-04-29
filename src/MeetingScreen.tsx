import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { TranscriptSegment, ChatMessage, Toast, MeetingRecord, AuthUser } from "./types";
import {
  IconMic, IconSquare, IconZap, IconMonitor, IconFileText,
  IconSettings, IconMinus, IconX, IconCopy, IconArrowLeft,
  IconTrash, IconGhost, IconChevronDown, IconChevronUp,
} from "./icons";

let segId   = 0;
let msgId   = 0;
let toastId = 0;

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function SimpleMarkdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const isLast = i === lines.length - 1;
    if (line.startsWith("## ")) {
      elements.push(
        <div key={i} className="md-h2">
          {renderInline(line.slice(3))}
          {isLast && streaming && <span className="streaming-cursor" />}
        </div>
      );
    } else if (line.startsWith("### ")) {
      elements.push(
        <div key={i} className="md-h3">
          {renderInline(line.slice(4))}
          {isLast && streaming && <span className="streaming-cursor" />}
        </div>
      );
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <div key={i} className="md-bullet">
          {renderInline(line.slice(2))}
          {isLast && streaming && <span className="streaming-cursor" />}
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, "");
      elements.push(
        <div key={i} className="md-ordered">
          {renderInline(content)}
          {isLast && streaming && <span className="streaming-cursor" />}
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="md-spacer" />);
    } else {
      elements.push(
        <div key={i} className="md-p">
          {renderInline(line)}
          {isLast && streaming && <span className="streaming-cursor" />}
        </div>
      );
    }
  });

  if (streaming && text === "") {
    elements.push(<span key="init-cursor" className="streaming-cursor" />);
  }

  return <div className="md-content">{elements}</div>;
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

interface Props {
  user: AuthUser;
  onBack: (record: MeetingRecord) => void;
}

// Stable mutable state container — avoids multiple separate ref-sync effects.
interface StableRefs {
  aiThinking:  boolean;
  autoAsk:     boolean;
  useScreen:   boolean;
  segments:    TranscriptSegment[];
  messages:    ChatMessage[];
}

export default function MeetingScreen({ onBack }: Props) {
  const [isRecording,    setIsRecording]    = useState(false);
  const [segments,       setSegments]       = useState<TranscriptSegment[]>([]);
  const [interimText,    setInterimText]    = useState("");
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [aiThinking,     setAiThinking]     = useState(false);
  const [streamingId,    setStreamingId]    = useState<string | null>(null);
  const [showSettings,   setShowSettings]   = useState(false);
  const [toasts,         setToasts]         = useState<Toast[]>([]);
  const [chatInput,      setChatInput]      = useState("");
  const [elapsed,        setElapsed]        = useState(0);
  const [useScreen,      setUseScreen]      = useState(false);
  const [autoAsk,        setAutoAsk]        = useState(false);
  const [opacity,        setOpacity]        = useState(90);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const meetingStartedAt = useRef(Date.now());
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedEndRef       = useRef<HTMLDivElement>(null);
  const streamingContent = useRef<string>("");
  const streamingMsgId   = useRef<string | null>(null);

  // Single stable container for all values needed inside async/event callbacks.
  // Avoids multiple useEffect ref-sync patterns.
  const stable = useRef<StableRefs>({
    aiThinking: false,
    autoAsk:    false,
    useScreen:  false,
    segments:   [],
    messages:   [],
  });
  // Keep the container in sync on every render.
  stable.current.aiThinking = aiThinking;
  stable.current.autoAsk    = autoAsk;
  stable.current.useScreen  = useScreen;
  stable.current.segments   = segments;
  stable.current.messages   = messages;

  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = String(++toastId);
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // ── Timer ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  // ── AI ask (streaming) ────────────────────────────────────────────────────

  // Stored in a ref so event-listener closures always call the latest version
  // without needing to re-subscribe listeners on every dependency change.
  const handleAskAI = useCallback(async (q: string) => {
    if (stable.current.aiThinking) return;
    stable.current.aiThinking = true;
    setAiThinking(true);

    const question = q.trim();
    if (question) {
      setMessages(prev => [...prev, { id: String(++msgId), role: "user", content: question }]);
    }
    setChatInput("");

    const sid = String(++msgId);
    streamingMsgId.current   = sid;
    streamingContent.current = "";
    setStreamingId(sid);
    setMessages(prev => [...prev, { id: sid, role: "assistant", content: "", streaming: true }]);

    try {
      await api.askAiStream(question, stable.current.useScreen);
      setMessages(prev =>
        prev.map(m => m.id === sid ? { ...m, content: streamingContent.current, streaming: false } : m)
      );
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== sid));
      addToast(String(e));
    } finally {
      streamingMsgId.current   = null;
      streamingContent.current = "";
      setStreamingId(null);
      stable.current.aiThinking = false;
      setAiThinking(false);
    }
  }, [addToast]);

  // Keep a ref so event listeners always invoke the latest callback
  // without re-subscribing. This is the canonical pattern for stable
  // callbacks in long-lived useEffect subscriptions.
  const handleAskAIRef = useRef(handleAskAI);
  handleAskAIRef.current = handleAskAI;

  // ── Event listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    const unsubs = [
      listen<{ text: string; is_final: boolean }>("transcript", ({ payload }) => {
        if (payload.is_final) {
          setInterimText("");
          setSegments(prev => [
            ...prev,
            { id: String(++segId), text: payload.text, timestamp: Date.now() },
          ]);
          if (stable.current.autoAsk && !stable.current.aiThinking) {
            handleAskAIRef.current("");
          }
        } else {
          setInterimText(payload.text);
        }
      }),

      listen<boolean>("recording-state", ({ payload }) => setIsRecording(payload)),
      listen<string>("recording-error",  ({ payload }) => { setIsRecording(false); addToast(payload); }),

      listen<string>("ai-chunk", ({ payload }) => {
        const sid = streamingMsgId.current;
        if (sid) {
          streamingContent.current += payload;
          const content = streamingContent.current;
          setMessages(prev =>
            prev.map(m => m.id === sid ? { ...m, content } : m)
          );
        }
      }),

      listen("hotkey-ask-ai",     () => handleAskAIRef.current("")),
      listen("toggle-visibility", async () => {
        const win = getCurrentWindow();
        if (await win.isVisible()) await win.hide();
        else { await win.show(); await win.setFocus(); }
      }),
    ];

    // Cleanup: each listen() resolves to an unlisten function.
    // We call them fire-and-forget (no await) because the component is
    // already unmounting — there is no meaningful error to handle here,
    // and React's cleanup pattern does not support async cleanup functions.
    return () => { unsubs.forEach(p => p.then(f => f())); };
  }, [addToast]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments, interimText, messages, aiThinking]);

  // ── Drag ─────────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, select, input, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  // ── Recording ────────────────────────────────────────────────────────────

  const handleStartRecording = async () => {
    try { await api.startRecording(); setSegments([]); setInterimText(""); }
    catch (e) { addToast(String(e)); }
  };

  const handleStopRecording = () => { api.stopRecording(); setIsRecording(false); };

  // ── Generate notes ────────────────────────────────────────────────────────

  const handleGenerateNotes = async () => {
    if (aiThinking) return;
    stable.current.aiThinking = true;
    setAiThinking(true);
    try {
      const notes = await api.generateNotes();
      setMessages(prev => [...prev, { id: String(++msgId), role: "assistant", content: notes }]);
    } catch (e) { addToast(String(e)); }
    finally {
      stable.current.aiThinking = false;
      setAiThinking(false);
    }
  };

  const handleClearSession = () => {
    api.clearSession(); setSegments([]); setInterimText(""); setMessages([]);
  };

  const handleSend = () => {
    const q = chatInput.trim();
    if (!q || aiThinking) return;
    handleAskAI(q);
  };

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleEndMeeting = () => {
    if (isRecording) { api.stopRecording(); setIsRecording(false); }
    const segs = stable.current.segments;
    const msgs = stable.current.messages;
    const wordCount     = segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
    const questionCount = msgs.filter(m => m.role === "user").length;
    const preview       = segs.slice(0, 3).map(s => s.text).join(" ").slice(0, 100);
    api.clearSession().catch(() => {});
    onBack({
      id: String(Date.now()),
      startedAt: meetingStartedAt.current,
      endedAt: Date.now(),
      wordCount,
      questionCount,
      preview,
    });
  };

  const recentSegs = segments.slice(-8);
  const latestText = interimText || (recentSegs.length > 0 ? recentSegs[recentSegs.length - 1].text : "");
  const isEmpty = segments.length === 0 && !interimText && messages.length === 0 && !aiThinking;

  return (
    <div className="app" style={{ opacity: opacity / 100 }}>

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.message}</span>
              <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>
                <IconX size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Titlebar ── */}
      <div className="titlebar" onPointerDown={handleDragStart} data-tauri-drag-region>
        <button className="titlebar-btn" onClick={handleEndMeeting} title="End meeting & save">
          <IconArrowLeft size={12} />
        </button>
        <div className="logo">
          <IconGhost size={13} />
          <span>Ghostnote</span>
        </div>

        {isRecording && (
          <div className="recording-indicator">
            <div className="rec-dot" />
            <span>{fmtTime(elapsed)}</span>
          </div>
        )}

        <div className="titlebar-spacer" />

        <button
          className="titlebar-btn"
          onClick={() => setShowSettings(v => !v)}
          style={{ color: showSettings ? "var(--accent-text)" : undefined }}
          title={showSettings ? "Close settings" : "Settings"}>
          {showSettings ? <IconX size={12} /> : <IconSettings size={12} />}
        </button>
        <div className="win-controls">
          <button className="titlebar-btn btn-minimize" title="Minimize"
            onClick={() => getCurrentWindow().minimize().catch(() => {})}>
            <IconMinus size={11} />
          </button>
          <button className="titlebar-btn btn-close" title="Close"
            onClick={() => getCurrentWindow().close().catch(() => {})}>
            <IconX size={10} />
          </button>
        </div>
      </div>

      {!showSettings && (
        <>
          {/* ── Controls ── */}
          <div className="controls">
            {/* Primary action: record / stop */}
            <div className="controls-group">
              {!isRecording ? (
                <button className="btn btn-record" onClick={handleStartRecording}>
                  <IconMic size={11} /> <span>Record</span>
                </button>
              ) : (
                <button className="btn btn-stop" onClick={handleStopRecording}>
                  <IconSquare size={10} /> <span>Stop</span>
                </button>
              )}
            </div>

            {/* Tool buttons: auto, screen, notes */}
            <div className="controls-tools">
              <button
                className={`btn ${autoAsk ? "btn-auto-on" : "btn-ghost"}`}
                onClick={() => setAutoAsk(v => !v)}
                title={autoAsk ? "Auto-ask ON — disable" : "Auto-ask OFF — enable"}
                aria-pressed={autoAsk}>
                <IconZap size={11} /> <span>Auto</span>
              </button>

              <button
                className={`btn ${useScreen ? "btn-screen-on" : "btn-ghost"}`}
                onClick={() => setUseScreen(v => !v)}
                title={useScreen ? "Screen context ON" : "Include screen context"}
                aria-pressed={useScreen}>
                <IconMonitor size={11} />
              </button>

              {segments.length > 0 && (
                <button className="btn btn-ghost" onClick={handleGenerateNotes} disabled={aiThinking}
                  title="Generate meeting notes">
                  <IconFileText size={11} />
                </button>
              )}
            </div>

            <div className="controls-spacer" />

            <button className="btn btn-ghost" onClick={handleClearSession} title="Clear session">
              <IconTrash size={11} />
            </button>
          </div>

          {/* ── Transcript strip ── */}
          {(recentSegs.length > 0 || interimText) && (
            <div className={`transcript-strip ${transcriptOpen ? "expanded" : "collapsed"}`}>
              <div className="transcript-header" onClick={() => setTranscriptOpen(v => !v)}>
                {isRecording ? (
                  <div className="transcript-live-badge">
                    <div className="transcript-live-dot" />
                    LIVE
                  </div>
                ) : (
                  <span className="transcript-label">Transcript</span>
                )}
                {!transcriptOpen && latestText && (
                  <span className="transcript-latest">{latestText}</span>
                )}
                <button className="transcript-toggle" title={transcriptOpen ? "Collapse" : "Expand"}>
                  {transcriptOpen ? <IconChevronUp size={10} /> : <IconChevronDown size={10} />}
                </button>
              </div>
              {transcriptOpen && (
                <div className="transcript-lines">
                  {recentSegs.map(seg => (
                    <div key={seg.id} className="transcript-line">{seg.text}</div>
                  ))}
                  {interimText && (
                    <div className="transcript-line interim">{interimText}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Chat feed ── */}
          <div className="main-body">
            <div className="chat-feed" role="log" aria-live="polite">

              {isEmpty && (
                <div className="feed-empty">
                  <div className="feed-empty-icon"><IconGhost size={20} /></div>
                  <div className="feed-empty-title">Ready to assist</div>
                  <div className="feed-empty-sub">
                    {isRecording
                      ? "Listening — ask a question or use Auto mode"
                      : "Hit Record to start capturing audio, or type a question below"}
                  </div>
                </div>
              )}

              {messages.map(m => (
                <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
                  {m.role === "user" ? (
                    <>
                      <span className="user-bubble">{m.content}</span>
                      <button className="msg-action-btn del" title="Delete"
                        onClick={() => deleteMessage(m.id)}>
                        <IconX size={9} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="ai-avatar"><IconGhost size={10} /></div>
                      <SimpleMarkdown
                        text={m.content}
                        streaming={m.streaming && m.id === streamingId}
                        key={m.id}
                      />
                      {!m.streaming && (
                        <div className="msg-actions">
                          <button className="msg-action-btn"
                            onClick={() => copyText(m.content).then(ok => ok && addToast("Copied", "success"))}
                            title="Copy">
                            <IconCopy size={10} />
                          </button>
                          <button className="msg-action-btn del" title="Delete"
                            onClick={() => deleteMessage(m.id)}>
                            <IconX size={9} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {aiThinking && !streamingId && (
                <div className="thinking-row">
                  <div className="ai-avatar"><IconGhost size={10} /></div>
                  <div className="thinking-dots">
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </div>
                </div>
              )}

              <div ref={feedEndRef} />
            </div>

            {/* ── Quick actions ── */}
            {!autoAsk && (
              <div className="quick-actions">
                <button className="quick-btn" onClick={() => handleAskAI("")} disabled={aiThinking}>
                  Assist
                </button>
                <button className="quick-btn"
                  onClick={() => handleAskAI("What should I say next?")}
                  disabled={aiThinking}>
                  What to say?
                </button>
                <button className="quick-btn"
                  onClick={() => handleAskAI("What are smart follow-up questions to ask right now?")}
                  disabled={aiThinking}>
                  Follow-ups
                </button>
                <button className="quick-btn"
                  onClick={() => handleAskAI("Summarize what was said so far in 2-3 bullet points")}
                  disabled={aiThinking}>
                  Summarize
                </button>
              </div>
            )}

            {/* ── Input ── */}
            <div className="chat-input-row">
              <input
                className="chat-input"
                placeholder={aiThinking ? "Thinking…" : "Ask about the meeting…"}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={aiThinking}
              />
              <button className="send-btn" onClick={handleSend}
                disabled={aiThinking || !chatInput.trim()}
                title="Send (Enter)">
                {aiThinking && !streamingId
                  ? <span className="spinner" />
                  : <IconZap size={12} />}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Settings ── */}
      {showSettings && (
        <div className="settings-view">

          {/* Behavior */}
          <div className="settings-section">
            <div className="settings-title">Behavior</div>
            <label className="toggle-row">
              <input type="checkbox" checked={autoAsk} onChange={e => setAutoAsk(e.target.checked)}
                style={{ accentColor: "var(--accent)" }} />
              <span>Auto-ask after each utterance</span>
            </label>
            <p className="settings-hint">
              AI responds automatically as each sentence finishes transcribing.
            </p>
            <label className="form-label" htmlFor="opacity-range">
              Overlay opacity — {opacity}%
            </label>
            <input id="opacity-range" type="range" min={30} max={100} value={opacity}
              onChange={e => setOpacity(Number(e.target.value))} className="opacity-slider" />
          </div>

          <div className="settings-divider" />

          {/* Shortcuts */}
          <div className="settings-section">
            <div className="settings-title">Keyboard Shortcuts</div>
            <div className="shortcuts-list">
              <div className="shortcut-row">
                <span>Ask AI instantly</span>
                <kbd className="kbd">Ctrl+Enter</kbd>
              </div>
              <div className="shortcut-row">
                <span>Show / Hide overlay</span>
                <kbd className="kbd">Ctrl+Shift+H</kbd>
              </div>
              <div className="shortcut-row">
                <span>Send message</span>
                <kbd className="kbd">Enter</kbd>
              </div>
            </div>
          </div>

          <div className="settings-divider" />

          {/* Privacy */}
          <div className="settings-section">
            <div className="settings-title">Privacy</div>
            <p className="settings-hint">
              The overlay is hidden from screen capture using Windows{" "}
              <code>WDA_EXCLUDEFROMCAPTURE</code> — invisible to Zoom, Teams, Meet,
              OBS, and any screen-recording API. Audio is captured via WASAPI loopback
              (system audio only) and streamed to Deepgram over an encrypted WebSocket.
              Nothing is stored locally beyond this session.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
