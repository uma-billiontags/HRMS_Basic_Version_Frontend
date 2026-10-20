import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Mail, Lock, ArrowRight } from "lucide-react";
import "../components/styles/login.css";

export default function Login() {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const user = await login(email, password);
      navigate(user.role === "admin" ? "/admin/dashboard" : "/employee/dashboard", {
        replace: true,
      });
    } catch {
      // error is already captured in useAuth().error and shown below
    }
  }

  return (
    <div className="login-page">
      {/* ───────────────── LEFT PANEL ───────────────── */}
      <div className="login-left-panel">
        <div className="login-left-panel-overlay" />
        <div className="login-left-content">
          <div className="login-logo-row" style={{ display: "flex", alignItems: "center", gap: 1, marginBottom: 36 }}>
            {/* White badge container for the logo
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ffffff",
                borderRadius: 8,
                padding: "0px 2px",
                height: 38,
                minWidth: 50,
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                flexShrink: 0,
              }}
            >
              <img
                src="/logo.jpg"
                alt="Billion$"
                style={{
                  height: 20,
                  width: "auto",
                  maxWidth: 80,
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div> */}
             <div style={{ padding: "8px 8px" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#ffffff",
                        borderRadius: 8,
                        padding: "8px 14px",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                        width: "100%",
                    }}
                >
                    <img
                        src="/logo.png"
                        alt="Billion tags"
                        style={{
                            width: "100%",
                            height: "auto",
                            maxHeight: 18,
                            objectFit: "contain",
                            display: "block",
                        }}
                    />
                </div>
            </div>

            {/* Text next to logo */}
            <div>
              <div className="login-logo-name" style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
                HRMS
              </div>
              <div className="login-logo-sub" style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.75)", marginTop: 2 }}>
                Interactive team workspace
              </div>
            </div>
            
          </div>

          <h1 className="login-headline">
            One workspace.
            <br />
            Every Task & Every Team.
          </h1>

          <p className="login-tagline">
            Track tasks, manage your team, and see project progress —
            all in one place, tailored to your role.
          </p>

          <div className="login-feature-grid">
            <div className="login-feature-card">
              <div className="login-feature-num">1</div>
              <div>
                <div className="login-feature-title">Admin dashboard</div>
                <div className="login-feature-desc">
                  Full task, team and progress overview.
                </div>
              </div>
            </div>
            <div className="login-feature-card">
              <div className="login-feature-num">2</div>
              <div>
                <div className="login-feature-title">Role-based access</div>
                <div className="login-feature-desc">
                  Employees see only their own tasks.
                </div>
              </div>
            </div>
            <div className="login-feature-card">
              <div className="login-feature-num">3</div>
              <div>
                <div className="login-feature-title">Task management</div>
                <div className="login-feature-desc">
                  Assign, update, and track task status.
                </div>
              </div>
            </div>
            <div className="login-feature-card">
              <div className="login-feature-num">4</div>
              <div>
                <div className="login-feature-title">Live progress</div>
                <div className="login-feature-desc">
                  Deadlines, status, and activity at a glance.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────── RIGHT PANEL (form) ───────────────── */}
      <div className="login-right-panel">
        <div className="login-card">
          <h2 className="login-card-title">Sign in to your dashboard</h2>
          <p className="login-subtitle">
            Enter your credentials to access your workspace.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-label">Email</label>
              <div className="login-input-wrap">
                <Mail size={15} className="login-input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="login-input-with-icon"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">Password</label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="login-input-with-icon"
                  required
                />
              </div>
            </div>

            {error && <div className="login-error-box">{error}</div>}

            <button type="submit" disabled={loading} className="login-button">
              {loading ? "Signing in..." : (
                <>
                  Sign In <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}