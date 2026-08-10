// AuthContext.tsx
// Holds the logged-in user's role/token and exposes login()/logout().
// Wrap your <App /> (inside <BrowserRouter>) with <AuthProvider> once.

import { createContext, useContext, useState, type ReactNode } from "react";

const BASE_URL = import.meta.env.VITE_BASE_URL;

export type UserRole = "admin" | "employee";

interface AuthUser {
  name: string;
  role: UserRole;
  token: string;
  isTL: boolean;   // NEW
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "task_tracker_auth";

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(email: string, password: string): Promise<AuthUser> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Invalid email or password");
      }

      // Expected response shape: { token, role, name }
      const data = await res.json();

      // Fetch is_tl (and anything else /me/ knows) right after login —
      // login_view's response doesn't include it, only me_view does.
      const meRes = await fetch(`${BASE_URL}/api/auth/me/`, {
        headers: { Authorization: `Token ${data.token}` },
      });
      const me = meRes.ok ? await meRes.json() : {};

      const authUser: AuthUser = {
        name: data.name,
        role: data.role,
        token: data.token,
        isTL: me?.is_tl ?? false,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
      setUser(authUser);
      return authUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}