import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { signIn, signUp, confirmSignUp } from "./cognito";
import { AuthUser } from "./types";
import { IconGhost, IconMinus, IconX, IconMic, IconMonitor, IconZap } from "./icons";

type Tab  = "signin" | "signup";
type Step = "form" | "verify";

interface Props {
  onAuth: (user: AuthUser) => void;
}

export default function AuthScreen({ onAuth }: Props) {
  const [tab,      setTab]      = useState<Tab>("signin");
  const [step,     setStep]     = useState<Step>("form");
  const [email,    setEmail]    = useState("");
  const [name,     setName]     = useState("");
  const [password, setPassword] = useState("");
  const [code,     setCode]     = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    getCurrentWindow().startDragging().catch(() => {});
  };

  const handleSignIn = async () => {
    if (!email || !password) return;
    setLoading(true); setError("");
    try { onAuth(await signIn(email, password)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const handleSignUp = async () => {
    if (!email || !password || !name) return;
    setLoading(true); setError("");
    try { await signUp(email, password, name); setStep("verify"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    if (!code) return;
    setLoading(true); setError("");
    try { await confirmSignUp(email, code); onAuth(await signIn(email, password)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || loading) return;
    if (step === "verify")     handleVerify();
    else if (tab === "signin") handleSignIn();
    else                       handleSignUp();
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setError("");
  };

  const canSubmit = step === "verify"
    ? !!code
    : tab === "signin"
      ? !!email && !!password
      : !!email && !!password && !!name;

  return (
    <div className="app">
      {/* ── Titlebar ── */}
      <div className="titlebar auth-titlebar" onPointerDown={handleDragStart} data-tauri-drag-region>
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
          <button className="titlebar-btn btn-maximize" title="Maximize"
            onClick={() => getCurrentWindow().toggleMaximize().catch(() => {})}>
            <svg viewBox="0 0 10 10" width="10" height="10">
              <rect x="1" y="1" width="8" height="8" stroke="currentColor" fill="none" strokeWidth="1.5" />
            </svg>
          </button>
          <button className="titlebar-btn btn-close" title="Close"
            onClick={() => getCurrentWindow().close().catch(() => {})}>
            <IconX size={10} />
          </button>
        </div>
      </div>

      {/* ── Two-panel layout ── */}
      <div className="auth-layout">

        {/* ── Left: Brand + Features ── */}
        <div className="auth-left">
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <IconGhost size={26} />
            </div>
            <h1 className="auth-brand-name">Ghostnote</h1>
            <p className="auth-brand-tagline">Invisible AI for your meetings</p>
          </div>

          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <IconMonitor size={15} />
              </div>
              <div className="auth-feature-text">
                <div className="auth-feature-title">Hidden from screen share</div>
                <div className="auth-feature-desc">
                  Invisible to Zoom, Teams, Meet, OBS, and all recording APIs
                </div>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <IconMic size={15} />
              </div>
              <div className="auth-feature-text">
                <div className="auth-feature-title">Live transcription</div>
                <div className="auth-feature-desc">
                  Deepgram nova-2 captures system audio at ~300ms latency
                </div>
              </div>
            </div>

            <div className="auth-feature-item">
              <div className="auth-feature-icon">
                <IconZap size={15} />
              </div>
              <div className="auth-feature-text">
                <div className="auth-feature-title">Real-time AI assistance</div>
                <div className="auth-feature-desc">
                  GPT-4o answers your questions live, mid-meeting
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Auth Form ── */}
        <div className="auth-right">

          {step === "verify" ? (
            <div className="auth-card">
              <div className="auth-card-title">Check your inbox</div>
              <p className="auth-hint">
                Verification code sent to <strong>{email}</strong>
              </p>

              <div className="auth-field">
                <label className="auth-field-label" htmlFor="verify-code">Verification code</label>
                <input
                  id="verify-code"
                  className="auth-input"
                  placeholder="6-digit code"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={8}
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button className="btn-auth" onClick={handleVerify} disabled={loading || !code}>
                {loading ? <span className="spinner" /> : "Verify & Continue"}
              </button>

              <button className="auth-link" onClick={() => { setStep("form"); setError(""); }}>
                ← Back to sign in
              </button>
            </div>
          ) : (
            <div className="auth-card">
              {/* ── Tabs ── */}
              <div className="auth-tabs">
                <button
                  className={`auth-tab${tab === "signin" ? " active" : ""}`}
                  onClick={() => switchTab("signin")}>
                  Sign In
                </button>
                <button
                  className={`auth-tab${tab === "signup" ? " active" : ""}`}
                  onClick={() => switchTab("signup")}>
                  Create Account
                </button>
              </div>

              {/* ── Fields ── */}
              {tab === "signup" && (
                <div className="auth-field">
                  <label className="auth-field-label" htmlFor="auth-name">Full name</label>
                  <input
                    id="auth-name"
                    className="auth-input"
                    type="text"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoComplete="name"
                    autoFocus
                  />
                </div>
              )}

              <div className="auth-field">
                <label className="auth-field-label" htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  className="auth-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="email"
                  autoFocus={tab === "signin"}
                />
              </div>

              <div className="auth-field">
                <label className="auth-field-label" htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  className="auth-input"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete={tab === "signin" ? "current-password" : "new-password"}
                />
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button
                className="btn-auth"
                onClick={tab === "signin" ? handleSignIn : handleSignUp}
                disabled={loading || !canSubmit}>
                {loading
                  ? <span className="spinner" />
                  : tab === "signin" ? "Sign In" : "Create Account"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
