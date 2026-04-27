import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api } from "./api";
import { TranscriptSegment, ChatMessage, AIMode, AIModel, Toast, MeetingRecord, AuthUser } from "./types";
import {
  IconMic, IconSquare, IconZap, IconMonitor, IconFileText,
  IconSettings, IconMinus, IconX, IconCopy, IconArrowLeft,
  IconTrash, IconGhost,
} from "./icons";

let segId   = 0;
let msgId   = 0;
let toastId = 0;

function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## "))  return <div key={i} className="md-h2">{line.slice(3)}</div>;
        if (line.startsWith("### ")) return <div key={i} className="md-h3">{line.slice(4)}</div>;
        if (line.startsWith("- ") || line.startsWith("• "))
                                     return <div key={i} className="md-bullet">• {line.slice(2)}</div>;
        if (line.trim() === "")      return <div key={i} className="md-spacer" />;
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

interface Props {
  user: AuthUser;
  onBack: (record: MeetingRecord) => void;
}

export default function MeetingScreen({ onBack }: Props) {
  const [isRecording,  setIsRecording]  = useState(false);
  const [segments,     setSegments]     = useState<TranscriptSegment[]>([]);
  const [interimText,  setInterimText]  = useState("");
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [aiThinking,   setAiThinking]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toasts,       setToasts]       = useState<Toast[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [elapsed,      setElapsed]      = useState(0);
  const [mode,         setMode]         = useState<AIMode>("interview");
  const [aiModel,      setAiModel]      = useState<AIModel>("gpt-4o-mini");
  const [useScreen,    setUseScreen]    = useState(false);
  const [autoAsk,      setAutoAsk]      = useState(false);
  const [opacity,      setOpacity]      = useState(90);

  const meetingStartedAt = useRef(Date.now());
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef       = useRef<HTMLDivElement>(null);

  const aiThinkingRef = useRef(false);
  const autoAskRef    = useRef(false);
  const modeRef       = useRef<AIMode>("interview");
  const aiModelRef    = useRef<AIModel>("gpt-4o-mini");
  const useScreenRef  = useRef(false);
  const segmentsRef   = useRef<TranscriptSegment[]>([]);
  const messagesRef   = useRef<ChatMessage[]>([]);

  useEffect(() => { aiThinkingRef.current = aiThinking; }, [aiThinking]);
  useEffect(() => { autoAskRef.current    = autoAsk;    }, [autoAsk]);
  useEffect(() => { modeRef.current       = mode;       }, [mode]);
  useEffect(() => { aiModelRef.current    = aiModel;    }, [aiModel]);
  useEffect(() => { useScreenRef.current  = useScreen;  }, [useScreen]);
  useEffect(() => { segmentsRef.current   = segments;   }, [segments]);
  useEffect(() => { messagesRef.current   = messages;   }, [messages]);

  const addToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = String(++toastId);
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const handleAskAI = useCallback(async (q: string) => {
    if (aiThinkingRef.current) return;
    aiThinkingRef.current = true;
    setAiThinking(true);
    const question = q.trim();
    if (question) {
      setMessages(prev => [...prev, { id: String(++msgId), role: "user", content: question }]);
    }
    setChatInput("");
    try {
      const answer = await api.askAi(question, modeRef.current, aiModelRef.current, useScreenRef.current);
      setMessages(prev => [...prev, { id: String(++msgId), role: "assistant", content: answer }]);
    } catch (e) {
      addToast(String(e));
    } finally {
      aiThinkingRef.current = false;
      setAiThinking(false);
    }
  }, [addToast]);

  const handleAskAIRef = useRef(handleAskAI);
  useEffect(() => { handleAskAIRef.current = handleAskAI; }, [handleAskAI]);

  useEffect(() => {
    const unsubs = [
      listen<{ text: string; is_final: boolean }>("transcript", ({ payload }) => {
        if (payload.is_final) {
          setInterimText("");
          setSegments(prev => [...prev, { id: String(++segId), text: payload.text, timestamp: Date.now() }]);
          if (autoAskRef.current && !aiThinkingRef.current) handleAskAIRef.current("");
        } else {
          setInterimText(payload.text);
        }
      }),
      listen<boolean>("recording-state", ({ payload }) => setIsRecording(payload)),
      listen<string> ("recording-error",  ({ payload }) => { setIsRecording(false); addToast(payload); }),
      listen("hotkey-ask-ai", () => handleAskAIRef.current("")),
      listen("toggle-visibility", async () => {
        const win = getCurrentWindow();
        if (await win.isVisible()) await win.hide();
        else { await win.show(); await win.setFocus(); }
      }),
    ];
    return () => { unsubs.forEach(p => p.then(f => f())); };
  }, [addToast]);

  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [segments, interimText]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); },       [messages, aiThinking]);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, select, input, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  const handleStartRecording = async () => {
    try { await api.startRecording(); setSegments([]); setInterimText(""); }
    catch (e) { addToast(String(e)); }
  };

  const handleStopRecording = () => { api.stopRecording(); setIsRecording(false); };

  const handleGenerateNotes = async () => {
    if (aiThinking) return;
    aiThinkingRef.current = true; setAiThinking(true);
    try {
      const notes = await api.generateNotes(aiModel);
      setMessages(prev => [...prev, { id: String(++msgId), role: "assistant", content: notes }]);
    } catch (e) { addToast(String(e)); }
    finally { aiThinkingRef.current = false; setAiThinking(false); }
  };

  const handleClearSession = () => {
    api.clearSession(); setSegments([]); setInterimText(""); setMessages([]);
  };

  const handleSend = () => {
    const q = chatInput.trim();
    if (!q || aiThinking) return;
    handleAskAI(q);
  };

  const handleEndMeeting = () => {
    if (isRecording) { api.stopRecording(); setIsRecording(false); }
    const segs = segmentsRef.current;
    const msgs = messagesRef.current;
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

  const wordCount  = segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const recentSegs = segments.slice(-30);

  return (
    <div className="app" style={{ opacity: opacity / 100 }}>

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

      <div className="titlebar" onPointerDown={handleDragStart} data-tauri-drag-region>
        <button className="titlebar-btn" onClick={handleEndMeeting} title="End meeting">
          <IconArrowLeft size={13} />
        </button>
        <div className="logo">
          <IconGhost size={14} />
          <span>Ghostnote</span>
        </div>
        {isRecording && (
          <div className="recording-indicator">
            <div className="rec-dot" />
            <span>{fmtTime(elapsed)}</span>
          </div>
        )}
        <div className="titlebar-spacer" />
        <button className="titlebar-btn"
          onClick={() => setShowSettings(v => !v)}
          style={{ color: showSettings ? "#C4B5FD" : undefined }}
          title={showSettings ? "Close settings" : "Settings"}>
          {showSettings ? <IconX size={13} /> : <IconSettings size={13} />}
        </button>
        <div className="win-controls">
          <button className="titlebar-btn btn-minimize" title="Minimize"
            onClick={() => getCurrentWindow().minimize().catch(() => {})}>
            <IconMinus size={12} />
          </button>
          <button className="titlebar-btn btn-close" title="Close"
            onClick={() => getCurrentWindow().close().catch(() => {})}>
            <IconX size={11} />
          </button>
        </div>
      </div>

      {!showSettings && (
        <>
          <div className="controls">
            {!isRecording ? (
              <button className="btn btn-record" onClick={handleStartRecording}>
                <IconMic size={12} /> <span>Record</span>
              </button>
            ) : (
              <button className="btn btn-stop" onClick={handleStopRecording}>
                <IconSquare size={11} /> <span>Stop</span>
              </button>
            )}
            <button className={`btn ${autoAsk ? "btn-auto-on" : "btn-ghost"}`}
              onClick={() => setAutoAsk(v => !v)} aria-pressed={autoAsk}>
              <IconZap size={12} /> <span>Auto</span>
            </button>
            <button className={`btn ${useScreen ? "btn-screen-on" : "btn-ghost"}`}
              onClick={() => setUseScreen(v => !v)} aria-pressed={useScreen}>
              <IconMonitor size={12} />
            </button>
            {segments.length > 0 && (
              <button className="btn btn-ghost" onClick={handleGenerateNotes} disabled={aiThinking}>
                <IconFileText size={12} />
              </button>
            )}
            <div className="controls-spacer" />
            {wordCount > 0 && <span className="word-count">{wordCount}w</span>}
            <select className="mode-select" value={mode} onChange={e => setMode(e.target.value as AIMode)}>
              <option value="interview">Interview</option>
              <option value="meeting">Meeting</option>
              <option value="notes">Notes</option>
            </select>
            <button className="btn btn-ghost" onClick={handleClearSession}>
              <IconTrash size={12} />
            </button>
          </div>

          <div className="main-body">
            <div className="transcript-pane" role="log" aria-live="polite">
              <div className="pane-label">Live Transcript</div>
              <div className="transcript-scroll">
                {segments.length === 0 && !interimText && (
                  <span className="transcript-empty">
                    {isRecording ? "Listening to system audio…" : "Press Record to start capturing audio"}
                  </span>
                )}
                {recentSegs.map((seg, i) => (
                  <span key={seg.id} className={`seg${i === recentSegs.length - 1 ? " seg-latest" : ""}`}>
                    {seg.text}{" "}
                  </span>
                ))}
                {interimText && <span className="seg seg-interim">{interimText}</span>}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            <div className="chat-pane">
              <div className="chat-messages" aria-live="polite">
                {messages.length === 0 && !aiThinking && (
                  <div className="chat-empty">Ask a question about the conversation</div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
                    {m.role === "user" ? (
                      <span className="chat-bubble user-bubble">{m.content}</span>
                    ) : (
                      <>
                        <SimpleMarkdown text={m.content} className="chat-bubble ai-bubble" />
                        <button className="copy-msg-btn"
                          onClick={() => copyText(m.content).then(ok => ok && addToast("Copied", "success"))}>
                          <IconCopy size={11} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {aiThinking && (
                  <div className="chat-msg chat-msg-assistant">
                    <div className="chat-bubble ai-bubble thinking-bubble">
                      <span className="dot" /><span className="dot" /><span className="dot" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-input-row">
                <input
                  className="chat-input"
                  placeholder={aiThinking ? "Thinking…" : "Ask about the conversation…"}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={aiThinking}
                />
                <button className="send-btn" onClick={handleSend} disabled={aiThinking || !chatInput.trim()}>
                  {aiThinking ? <span className="spinner" /> : <IconZap size={13} />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showSettings && (
        <div className="settings-view">
          <div className="settings-section">
            <div className="settings-title">AI Model</div>
            <div className="model-picker">
              {(["gpt-4o-mini", "gpt-4o"] as AIModel[]).map(m => (
                <button key={m} className={`model-btn${aiModel === m ? " active" : ""}`}
                  onClick={() => setAiModel(m)} aria-pressed={aiModel === m}>{m}</button>
              ))}
            </div>
            <p className="settings-hint">
              <strong>gpt-4o-mini</strong> — fast &amp; cheap · <strong>gpt-4o</strong> — highest quality
            </p>
          </div>
          <div className="ai-divider" />
          <div className="settings-section">
            <div className="settings-title">Behaviour</div>
            <label className="toggle-row">
              <input type="checkbox" checked={autoAsk} onChange={e => setAutoAsk(e.target.checked)}
                style={{ accentColor: "#7C3AED" }} />
              <span>Auto-ask AI after each utterance</span>
            </label>
            <p className="settings-hint">AI responds automatically as each sentence completes.</p>
            <label className="form-label" htmlFor="opacity-range">Overlay opacity — {opacity}%</label>
            <input id="opacity-range" type="range" min={30} max={100} value={opacity}
              onChange={e => setOpacity(Number(e.target.value))} className="opacity-slider" />
          </div>
          <div className="ai-divider" />
          <div className="settings-section">
            <div className="settings-title">Keyboard Shortcuts</div>
            <div className="shortcuts-list">
              <div className="shortcut-row"><span>Ask AI instantly</span><kbd className="kbd">Ctrl+Enter</kbd></div>
              <div className="shortcut-row"><span>Show / Hide overlay</span><kbd className="kbd">Ctrl+Shift+H</kbd></div>
            </div>
          </div>
          <div className="ai-divider" />
          <div className="settings-section">
            <div className="settings-title">Privacy</div>
            <p className="settings-hint" style={{ lineHeight: 1.8 }}>
              Uses <code>WDA_EXCLUDEFROMCAPTURE</code> — invisible to Zoom, Teams, OBS, and any
              screen-capture API. Audio is captured via WASAPI loopback and streamed to Deepgram
              over an encrypted WebSocket.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
