import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AuthScreen    from "./AuthScreen";
import HistoryScreen from "./HistoryScreen";
import MeetingScreen from "./MeetingScreen";
import { AppState, AuthUser, MeetingRecord } from "./types";

export default function App() {
  const [appState, setAppState] = useState<AppState>("loading");
  const [user,     setUser]     = useState<AuthUser | null>(null);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);

  useEffect(() => {
    const isMeeting = appState === "meeting";
    document.body.dataset.mode = isMeeting ? "overlay" : "app";
    getCurrentWindow().setAlwaysOnTop(isMeeting).catch(() => {});
  }, [appState]);

  useEffect(() => {
    const email        = localStorage.getItem("gn_email");
    const accessToken  = localStorage.getItem("gn_at");
    const refreshToken = localStorage.getItem("gn_rt") ?? "";
    if (email && accessToken) {
      setUser({ email, accessToken, refreshToken });
      try {
        const raw = localStorage.getItem("gn_meetings");
        if (raw) setMeetings(JSON.parse(raw) as MeetingRecord[]);
      } catch { /* ignore corrupt data */ }
      setAppState("history");
    } else {
      setAppState("auth");
    }
  }, []);

  const handleAuth = (u: AuthUser) => {
    localStorage.setItem("gn_email", u.email);
    localStorage.setItem("gn_at",    u.accessToken);
    localStorage.setItem("gn_rt",    u.refreshToken);
    setUser(u);
    setAppState("history");
  };

  const handleSignOut = () => {
    localStorage.removeItem("gn_email");
    localStorage.removeItem("gn_at");
    localStorage.removeItem("gn_rt");
    setUser(null);
    setAppState("auth");
  };

  const handleEndMeeting = (record: MeetingRecord) => {
    setMeetings(prev => {
      const updated = [record, ...prev].slice(0, 50);
      localStorage.setItem("gn_meetings", JSON.stringify(updated));
      return updated;
    });
    setAppState("history");
  };

  if (appState === "loading")  return null;
  if (appState === "auth")     return <AuthScreen onAuth={handleAuth} />;
  if (appState === "history")  return (
    <HistoryScreen
      user={user!}
      meetings={meetings}
      onStartMeeting={() => setAppState("meeting")}
      onSignOut={handleSignOut}
      onDeleteMeeting={(id: string) => {
        setMeetings(prev => {
          const updated = prev.filter(m => m.id !== id);
          localStorage.setItem("gn_meetings", JSON.stringify(updated));
          return updated;
        });
      }}
    />
  );
  return <MeetingScreen user={user!} onBack={handleEndMeeting} />;
}
