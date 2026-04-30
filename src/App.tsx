import { useState, useEffect } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import AuthScreen    from "./AuthScreen";
import HistoryScreen from "./HistoryScreen";
import MeetingScreen from "./MeetingScreen";
import { api } from "./api";
import { AppState, AuthUser, MeetingRecord } from "./types";
import { IconGhost, IconMinus, IconX } from "./icons";

function LoadingScreen() {
  const win = getCurrentWindow();
  return (
    <div className="app">
      <div className="titlebar auth-titlebar" data-tauri-drag-region>
        <div className="logo">
          <IconGhost size={13} />
          <span>Ghostnote</span>
        </div>
        <div className="titlebar-spacer" />
        <div className="win-controls">
          <button className="titlebar-btn btn-minimize" title="Minimize"
            onClick={() => win.minimize().catch(() => {})}>
            <IconMinus size={11} />
          </button>
          <button className="titlebar-btn btn-maximize" title="Maximize"
            onClick={() => win.toggleMaximize().catch(() => {})}>
            <svg viewBox="0 0 10 10" width="10" height="10">
              <rect x="1" y="1" width="8" height="8" stroke="currentColor" fill="none" strokeWidth="1.5" />
            </svg>
          </button>
          <button className="titlebar-btn btn-close" title="Close"
            onClick={() => win.close().catch(() => {})}>
            <IconX size={10} />
          </button>
        </div>
      </div>
      <div className="loading-body">
        <div className="loading-icon-wrap">
          <IconGhost size={30} />
        </div>
        <div className="loading-name">Ghostnote</div>
        <div className="loading-tagline">Invisible AI for your meetings</div>
        <div className="loading-dots">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      </div>
    </div>
  );
}

const LS_EMAIL    = "gn_email";
const LS_AT       = "gn_at";
const LS_RT       = "gn_rt";
const LS_MEETINGS = "gn_meetings";

function saveMeetingsCache(meetings: MeetingRecord[]) {
  try { localStorage.setItem(LS_MEETINGS, JSON.stringify(meetings)); } catch {}
}
function loadMeetingsCache(): MeetingRecord[] {
  try {
    const raw = localStorage.getItem(LS_MEETINGS);
    return raw ? (JSON.parse(raw) as MeetingRecord[]) : [];
  } catch { return []; }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [user,     setUser]     = useState<AuthUser | null>(null);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);

  // Resize window and toggle overlay mode when switching between app and meeting
  useEffect(() => {
    const win = getCurrentWindow();
    const isMeeting = appState === "meeting";
    document.body.dataset.mode = isMeeting ? "overlay" : "app";
    win.setAlwaysOnTop(isMeeting).catch(() => {});
    if (isMeeting) {
      win.setSize(new LogicalSize(440, 650)).catch(() => {});
    } else if (appState === "auth" || appState === "history") {
      win.setSize(new LogicalSize(840, 570)).catch(() => {});
    }
  }, [appState]);

  // Resume session on startup
  useEffect(() => {
    const email        = localStorage.getItem(LS_EMAIL);
    const accessToken  = localStorage.getItem(LS_AT);
    const refreshToken = localStorage.getItem(LS_RT) ?? "";
    if (email && accessToken) {
      const u = { email, accessToken, refreshToken };
      setUser(u);
      // Show cached data instantly, then sync from DynamoDB
      const cached = loadMeetingsCache();
      setMeetings(cached);
      setAppState("history");
      api.getMeetings(email)
        .then(records => {
          setMeetings(records);
          saveMeetingsCache(records);
        })
        .catch(() => {}); // silently use cache on failure
    } else {
      setAppState("auth");
    }
  }, []);

  const handleAuth = async (u: AuthUser) => {
    localStorage.setItem(LS_EMAIL, u.email);
    localStorage.setItem(LS_AT,    u.accessToken);
    localStorage.setItem(LS_RT,    u.refreshToken);
    setUser(u);
    // Load meetings from DynamoDB; fallback to empty list
    const records = await api.getMeetings(u.email).catch(() => [] as MeetingRecord[]);
    setMeetings(records);
    saveMeetingsCache(records);
    setAppState("history");
  };

  const handleSignOut = () => {
    localStorage.removeItem(LS_EMAIL);
    localStorage.removeItem(LS_AT);
    localStorage.removeItem(LS_RT);
    localStorage.removeItem(LS_MEETINGS);
    setUser(null);
    setMeetings([]);
    setAppState("auth");
  };

  const handleEndMeeting = (record: MeetingRecord) => {
    setMeetings(prev => {
      const updated = [record, ...prev].slice(0, 50);
      saveMeetingsCache(updated);
      return updated;
    });
    setAppState("history");
    // Persist to DynamoDB in background
    if (user) {
      api.saveMeeting(record, user.email).catch(() => {});
    }
  };

  const handleDeleteMeeting = (id: string) => {
    setMeetings(prev => {
      const updated = prev.filter(m => m.id !== id);
      saveMeetingsCache(updated);
      return updated;
    });
    if (user) {
      api.deleteMeeting(id, user.email).catch(() => {});
    }
  };

  if (appState === "loading")  return <LoadingScreen />;
  if (appState === "auth")     return <AuthScreen onAuth={handleAuth} />;
  if (appState === "history")  return (
    <HistoryScreen
      user={user!}
      meetings={meetings}
      onStartMeeting={() => setAppState("meeting")}
      onSignOut={handleSignOut}
      onDeleteMeeting={handleDeleteMeeting}
    />
  );
  return <MeetingScreen user={user!} onBack={handleEndMeeting} />;
}
