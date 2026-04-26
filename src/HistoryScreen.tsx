import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AuthUser, MeetingRecord } from "./types";
import { IconGhost, IconSettings, IconMinus, IconX, IconArrowLeft } from "./icons";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDuration(startedAt: number, endedAt: number) {
  const s = Math.round((endedAt - startedAt) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

interface Props {
  user: AuthUser;
  meetings: MeetingRecord[];
  onStartMeeting: () => void;
  onSignOut: () => void;
}

export default function HistoryScreen({ user, meetings, onStartMeeting, onSignOut }: Props) {
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
          <IconGhost size={14} />
          <span>Ghostnote</span>
        </div>
        <div className="titlebar-spacer" />
        <button
          className="titlebar-btn"
          onClick={() => setShowSettings(v => !v)}
          style={{ color: showSettings ? "#C4B5FD" : undefined }}
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
            <p className="settings-hint">
              Signed in as <strong style={{ color: "#DDD6FE" }}>{user.email}</strong>
            </p>
            <button className="btn btn-stop" style={{ alignSelf: "flex-start" }} onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="history-body">
          <div className="start-meeting-section">
            <button className="btn-start-meeting" onClick={onStartMeeting}>
              + Start New Meeting
            </button>
          </div>

          <div className="history-section-label">Past Meetings</div>

          {meetings.length === 0 ? (
            <div className="history-empty">
              No meetings yet. Start your first session above.
            </div>
          ) : (
            <div className="history-list">
              {meetings.map(m => (
                <div key={m.id} className="history-item">
                  <div className="history-item-top">
                    <span className="history-date">{fmtDate(m.startedAt)}</span>
                    <span className="history-duration">{fmtDuration(m.startedAt, m.endedAt)}</span>
                  </div>
                  {m.preview && (
                    <div className="history-preview">"{m.preview}"</div>
                  )}
                  <div className="history-stats">
                    <span>{m.wordCount}w</span>
                    {m.questionCount > 0 && (
                      <span> · {m.questionCount} {m.questionCount === 1 ? "question" : "questions"}</span>
                    )}
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
