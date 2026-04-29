import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AuthUser, MeetingRecord } from "./types";
import { IconGhost, IconSettings, IconMinus, IconX, IconTrash, IconMic } from "./icons";

function fmtDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday)     return "Today · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (isYesterday) return "Yesterday · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtDuration(startedAt: number, endedAt: number) {
  const s = Math.round((endedAt - startedAt) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function initials(email: string) {
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

type NavTab = "meetings" | "settings";

interface Props {
  user: AuthUser;
  meetings: MeetingRecord[];
  onStartMeeting: () => void;
  onSignOut: () => void;
  onDeleteMeeting: (id: string) => void;
}

export default function HistoryScreen({ user, meetings, onStartMeeting, onSignOut, onDeleteMeeting }: Props) {
  const [activeTab, setActiveTab] = useState<NavTab>("meetings");

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  const totalWords = meetings.reduce((sum, m) => sum + m.wordCount, 0);

  return (
    <div className="app">
      {/* ── Titlebar ── */}
      <div className="titlebar" onPointerDown={handleDragStart} data-tauri-drag-region>
        <div className="logo">
          <IconGhost size={13} />
          <span>Ghostnote</span>
        </div>
        <div className="titlebar-spacer" />
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

      {/* ── Desktop layout ── */}
      <div className="desktop-layout">

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <nav className="sidebar-nav">
            <button
              className={`sidebar-nav-item${activeTab === "meetings" ? " active" : ""}`}
              onClick={() => setActiveTab("meetings")}>
              <IconMic size={14} />
              <span>Meetings</span>
            </button>
            <button
              className={`sidebar-nav-item${activeTab === "settings" ? " active" : ""}`}
              onClick={() => setActiveTab("settings")}>
              <IconSettings size={14} />
              <span>Settings</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-avatar">{initials(user.email)}</div>
              <div className="sidebar-user-info">
                <div className="sidebar-email">{user.email}</div>
                <div className="sidebar-stats">
                  {meetings.length} session{meetings.length !== 1 ? "s" : ""}
                  {totalWords > 0 && ` · ${totalWords.toLocaleString()}w`}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="desktop-content">

          {activeTab === "meetings" && (
            <div className="meetings-panel">
              <div className="meetings-panel-header">
                <h1 className="panel-title">Meetings</h1>
                <p className="panel-sub">
                  Real-time AI for your meetings — invisible to screen capture
                </p>
              </div>

              <button className="btn-start-meeting-desktop" onClick={onStartMeeting}>
                <IconMic size={15} />
                Start New Meeting
              </button>

              {meetings.length > 0 && (
                <>
                  <div className="panel-section-label">Recent Sessions</div>
                  <div className="history-list desktop">
                    {meetings.map(m => (
                      <div key={m.id} className="history-item">
                        <div className="history-item-top">
                          <span className="history-date">{fmtDate(m.startedAt)}</span>
                          <span className="history-duration">{fmtDuration(m.startedAt, m.endedAt)}</span>
                          <button
                            className="history-delete-btn"
                            title="Delete session"
                            onClick={() => onDeleteMeeting(m.id)}>
                            <IconTrash size={10} />
                          </button>
                        </div>
                        {m.preview && (
                          <div className="history-preview">"{m.preview}"</div>
                        )}
                        <div className="history-stats">
                          {m.wordCount.toLocaleString()}w
                          {m.questionCount > 0 && ` · ${m.questionCount} Q${m.questionCount !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {meetings.length === 0 && (
                <div className="history-empty desktop">
                  No sessions yet.<br />
                  Start your first meeting above.
                </div>
              )}
            </div>
          )}

          {activeTab === "settings" && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h1 className="panel-title">Settings</h1>
              </div>

              <div className="settings-section">
                <div className="settings-title">Account</div>
                <div className="account-row">
                  <div className="account-avatar">{initials(user.email)}</div>
                  <div className="account-info">
                    <div className="account-email">{user.email}</div>
                    <div className="account-stats">
                      {meetings.length} session{meetings.length !== 1 ? "s" : ""}{" "}
                      {totalWords > 0 && `· ${totalWords.toLocaleString()} words captured`}
                    </div>
                  </div>
                </div>
                <button className="btn btn-stop" style={{ alignSelf: "flex-start" }} onClick={onSignOut}>
                  Sign Out
                </button>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-title">Privacy</div>
                <p className="settings-hint" style={{ lineHeight: 1.75 }}>
                  The overlay is hidden from screen capture using Windows{" "}
                  <code>WDA_EXCLUDEFROMCAPTURE</code> — invisible to Zoom, Teams, Meet,
                  OBS, and any screen-recording API. Audio is captured via WASAPI loopback
                  (system audio only) and streamed to Deepgram over an encrypted WebSocket.
                  Nothing is stored locally beyond the session.
                </p>
              </div>

              <div className="settings-divider" />

              <div className="settings-section">
                <div className="settings-title">About</div>
                <p className="settings-hint" style={{ lineHeight: 1.75 }}>
                  Ghostnote v0.1.0 — real-time AI assistant for meetings.
                  Powered by Deepgram nova-2 for transcription and GPT-4o-mini for
                  instant, accurate assistance.
                </p>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
