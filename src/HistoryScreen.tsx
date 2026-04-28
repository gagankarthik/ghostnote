import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AuthUser, MeetingRecord } from "./types";
import { IconGhost, IconSettings, IconMinus, IconX, IconArrowLeft, IconTrash } from "./icons";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtDuration(startedAt: number, endedAt: number) {
  const s = Math.round((endedAt - startedAt) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function initials(email: string) {
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
          {showSettings ? <IconArrowLeft size={13} /> : <IconSettings size={13} />}
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

      {showSettings ? (
        <div className="history-settings">
          <div className="settings-section">
            <div className="settings-title">Account</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="history-user-avatar">{initials(user.email)}</div>
              <div className="history-user-info">
                <div className="history-user-email">{user.email}</div>
                <div className="history-session-count">
                  {meetings.length} session{meetings.length !== 1 ? "s" : ""}
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
        </div>
      ) : (
        <div className="history-body">

          {/* ── User greeting ── */}
          <div className="history-user-row">
            <div className="history-user-avatar">{initials(user.email)}</div>
            <div className="history-user-info">
              <div className="history-user-email">{user.email}</div>
              <div className="history-session-count">
                {meetings.length} session{meetings.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* ── CTA ── */}
          <div className="start-meeting-section">
            <button className="btn-start-meeting" onClick={onStartMeeting}>
              + Start New Meeting
            </button>
          </div>

          {/* ── Past sessions ── */}
          {meetings.length > 0 && (
            <div className="history-section-label">Past Sessions</div>
          )}

          {meetings.length === 0 ? (
            <div className="history-empty">
              No sessions yet.<br />Start your first meeting above.
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
                      <IconTrash size={11} />
                    </button>
                  </div>
                  {m.preview && (
                    <div className="history-preview">"{m.preview}"</div>
                  )}
                  <div className="history-stats">
                    {m.wordCount.toLocaleString()}w
                    {m.questionCount > 0 && ` · ${m.questionCount} question${m.questionCount !== 1 ? "s" : ""}`}
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
