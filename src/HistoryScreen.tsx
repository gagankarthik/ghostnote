import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AuthUser, MeetingRecord } from "./types";
import { IconGhost, IconSettings, IconMinus, IconX, IconArrowLeft, IconTrash, IconMic } from "./icons";

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

interface Props {
  user: AuthUser;
  meetings: MeetingRecord[];
  onStartMeeting: () => void;
  onSignOut: () => void;
  onDeleteMeeting: (id: string) => void;
}

export default function HistoryScreen({ user, meetings, onStartMeeting, onSignOut, onDeleteMeeting }: Props) {
  const [showSettings, setShowSettings] = useState(false);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  const totalWords = meetings.reduce((sum, m) => sum + m.wordCount, 0);

  return (
    <div className="app">
      <div className="titlebar" onPointerDown={handleDragStart} data-tauri-drag-region>
        <div className="logo">
          <IconGhost size={13} />
          <span>Ghostnote</span>
        </div>
        <div className="titlebar-spacer" />
        <button
          className="titlebar-btn"
          onClick={() => setShowSettings(v => !v)}
          style={{ color: showSettings ? "var(--accent-text)" : undefined }}
          title={showSettings ? "Back" : "Settings"}>
          {showSettings ? <IconArrowLeft size={12} /> : <IconSettings size={12} />}
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

      {showSettings ? (
        <div className="history-settings">
          <div className="settings-section">
            <div className="settings-title">Account</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="history-user-avatar">{initials(user.email)}</div>
              <div className="history-user-info">
                <div className="history-user-email">{user.email}</div>
                <div className="history-session-count">
                  {meetings.length} session{meetings.length !== 1 ? "s" : ""} ·{" "}
                  {totalWords.toLocaleString()} words captured
                </div>
              </div>
            </div>
            <button
              className="btn btn-stop"
              style={{ alignSelf: "flex-start", marginTop: 4 }}
              onClick={onSignOut}>
              Sign Out
            </button>
          </div>

          <div className="settings-divider" />

          <div className="settings-section">
            <div className="settings-title">About</div>
            <p className="settings-hint" style={{ lineHeight: 1.75 }}>
              Ghostnote uses real-time audio transcription and AI to give you
              instant, contextual assistance during interviews and meetings —
              completely invisible to screen capture software.
            </p>
          </div>
        </div>
      ) : (
        <div className="history-body">

          {/* ── User header ── */}
          <div className="history-user-row">
            <div className="history-user-avatar">{initials(user.email)}</div>
            <div className="history-user-info">
              <div className="history-user-email">{user.email}</div>
              <div className="history-session-count">
                {meetings.length} session{meetings.length !== 1 ? "s" : ""}
                {totalWords > 0 && ` · ${totalWords.toLocaleString()}w captured`}
              </div>
            </div>
          </div>

          {/* ── CTA ── */}
          <div className="start-meeting-section">
            <button className="btn-start-meeting" onClick={onStartMeeting}>
              <IconMic size={14} />
              Start New Meeting
            </button>
          </div>

          {/* ── Sessions ── */}
          {meetings.length > 0 && (
            <div className="history-section-label">Recent Sessions</div>
          )}

          {meetings.length === 0 ? (
            <div className="history-empty">
              No sessions yet.<br />
              Start your first meeting above.
            </div>
          ) : (
            <div className="history-list">
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
          )}
        </div>
      )}
    </div>
  );
}
