import { useState, useMemo } from "react";
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
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (isToday)     return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) + `, ${time}`;
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

function fmtTotalHours(meetings: MeetingRecord[]) {
  const totalSec = meetings.reduce((sum, m) => sum + Math.round((m.endedAt - m.startedAt) / 1000), 0);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
  const [search, setSearch] = useState("");

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  const totalWords = meetings.reduce((sum, m) => sum + m.wordCount, 0);
  const totalQuestions = meetings.reduce((sum, m) => sum + m.questionCount, 0);

  const filtered = useMemo(() => {
    if (!search.trim()) return meetings;
    const q = search.toLowerCase();
    return meetings.filter(m =>
      (m.preview && m.preview.toLowerCase().includes(q)) ||
      fmtDate(m.startedAt).toLowerCase().includes(q)
    );
  }, [meetings, search]);

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
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <IconGhost size={15} />
            </div>
            <span className="sidebar-brand-name">Ghostnote</span>
          </div>

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

          {/* User info */}
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-avatar">{initials(user.email)}</div>
              <div className="sidebar-user-info">
                <div className="sidebar-email">{user.email}</div>
                <div className="sidebar-stats">
                  {meetings.length} session{meetings.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="desktop-content">

          {/* ── Meetings panel ── */}
          {activeTab === "meetings" && (
            <div className="meetings-panel">
              <div className="meetings-panel-header">
                <h1 className="panel-title">Your Meetings</h1>
                <p className="panel-sub">
                  AI assistance captured live — completely invisible to screen share
                </p>
              </div>

              {/* Metrics row */}
              {meetings.length > 0 && (
                <div className="metrics-row">
                  <div className="metric-card">
                    <div className="metric-value metric-accent">{meetings.length}</div>
                    <div className="metric-label">Sessions</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">{fmtTotalHours(meetings)}</div>
                    <div className="metric-label">Recorded</div>
                  </div>
                  <div className="metric-card">
                    <div className="metric-value">
                      {totalWords >= 1000 ? `${(totalWords / 1000).toFixed(1)}k` : totalWords}
                    </div>
                    <div className="metric-label">Words</div>
                  </div>
                </div>
              )}

              <button className="btn-start-meeting-desktop" onClick={onStartMeeting}>
                <IconMic size={15} />
                New Meeting
              </button>

              {meetings.length > 0 ? (
                <>
                  <div className="search-row">
                    <input
                      className="search-input"
                      placeholder="Search sessions…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>

                  <div className="panel-section-label">
                    {search ? `${filtered.length} of ${meetings.length} sessions` : "Recent Sessions"}
                  </div>

                  <div className="history-list desktop">
                    {filtered.length > 0 ? filtered.map(m => (
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
                          {m.questionCount > 0 && ` · ${m.questionCount} question${m.questionCount !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                    )) : (
                      <div className="history-empty desktop">
                        <div className="history-empty-title">No results for "{search}"</div>
                        <div className="history-empty-sub">Try a different search term.</div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="history-empty desktop">
                  <div className="history-empty-icon"><IconGhost size={20} /></div>
                  <div className="history-empty-title">No meetings yet</div>
                  <div className="history-empty-sub">
                    Start a new meeting above to begin capturing<br />
                    live transcripts and AI assistance.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Settings panel ── */}
          {activeTab === "settings" && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h1 className="panel-title">Settings</h1>
                <p className="panel-sub">Manage your account and preferences</p>
              </div>

              {/* Account */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="settings-section-title">Account</div>
                <div className="account-row">
                  <div className="account-avatar">{initials(user.email)}</div>
                  <div className="account-info">
                    <div className="account-email">{user.email}</div>
                    <div className="account-stats">
                      {meetings.length} session{meetings.length !== 1 ? "s" : ""}
                      {totalWords > 0 && ` · ${totalWords.toLocaleString()} words`}
                      {totalQuestions > 0 && ` · ${totalQuestions} AI queries`}
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-stop"
                  style={{ alignSelf: "flex-start", borderRadius: 6 }}
                  onClick={onSignOut}>
                  Sign Out
                </button>
              </div>

              <div className="settings-divider" />

              {/* Privacy */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="settings-section-title">Privacy & Security</div>
                <div className="settings-section-card">
                  <p className="settings-hint">
                    <strong>Completely invisible to screen share.</strong> Ghostnote is fully
                    hidden from Zoom, Teams, Google Meet, and all other video platforms — your
                    screen looks completely normal to everyone else. Audio is captured from
                    your system and processed over an encrypted connection. Nothing is stored
                    or retained after your session ends.
                  </p>
                </div>
              </div>

              <div className="settings-divider" />

              {/* About */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="settings-section-title">About</div>
                <div className="settings-section-card">
                  <p className="settings-hint">
                    <strong>Ghostnote v1.0</strong> — real-time AI for interviews and meetings.<br />
                    Live transcription · Instant AI answers · Auto meeting notes
                  </p>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
