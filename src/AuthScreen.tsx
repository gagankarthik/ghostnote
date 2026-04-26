import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { signIn, signUp, confirmSignUp } from "./cognito";
import { AuthUser } from "./types";
import { IconGhost, IconMinus, IconX } from "./icons";

type Tab  = "signin" | "signup";
type Step = "form" | "verify";

interface Props {
  onAuth: (user: AuthUser) => void;
}

export default function AuthScreen({ onAuth }: Props) {
  const [tab,      setTab]      = useState<Tab>("signin");
  const [step,     setStep]     = useState<Step>("form");
  const [email,    setEmail]    = useState("");
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
    try {
      onAuth(await signIn(email, password));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const handleSignUp = async () => {
    if (!email || !password) return;
    setLoading(true); setError("");
    try {
      await signUp(email, password);
      setStep("verify");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    if (!code) return;
    setLoading(true); setError("");
    try {
      await confirmSignUp(email, code);
      onAuth(await signIn(email, password));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || loading) return;
    if (step === "verify") handleVerify();
    else if (tab === "signin") handleSignIn();
    else handleSignUp();
  };

  return (
    <div className="app">
      {/* Drag region / window controls */}
      <div className="titlebar" onPointerDown={handleDragStart} data-tauri-drag-region>
        <div className="logo">
          <IconGhost size={14} />
          <span>Ghostnote</span>
        </div>
        <div className="titlebar-spacer" />
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

      <div className="auth-body">
        {step === "verify" ? (
          <div className="auth-card">
            <div className="auth-card-title">Verify your email</div>
            <p className="auth-hint">
              We sent a code to <strong>{email}</strong>
            </p>
            <input
              className="auth-input"
              placeholder="6-digit verification code"
              value={code}
              onChange={e => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={8}
              autoFocus
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="btn-auth" onClick={handleVerify} disabled={loading || !code}>
              {loading ? <span className="spinner" /> : "Verify & Sign In"}
            </button>
            <button className="auth-link" onClick={() => { setStep("form"); setError(""); }}>
              Back
            </button>
          </div>
        ) : (
          <div className="auth-card">
            <div className="auth-tabs">
              <button
                className={`auth-tab${tab === "signin" ? " active" : ""}`}
                onClick={() => { setTab("signin"); setError(""); }}>
                Sign In
              </button>
              <button
                className={`auth-tab${tab === "signup" ? " active" : ""}`}
                onClick={() => { setTab("signup"); setError(""); }}>
                Create Account
              </button>
            </div>
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
            />
            {error && <div className="auth-error">{error}</div>}
            <button
              className="btn-auth"
              onClick={tab === "signin" ? handleSignIn : handleSignUp}
              disabled={loading || !email || !password}
            >
              {loading
                ? <span className="spinner" />
                : tab === "signin" ? "Sign In" : "Create Account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
