import { createContext, useContext, useEffect, useState, useCallback } from "react";
import React from "react";

const TOKEN_KEY = "dashboard_token";

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "member";
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  // On mount (or when token changes), fetch /api/auth/me to validate the stored token
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Unauthenticated");
        return res.json() as Promise<AuthUser>;
      })
      .then((u) => {
        setUser(u);
        setToken(stored);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      let detail = "Login failed";
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {}
      throw new Error(detail);
    }
    const data = await res.json() as { token: string; user: AuthUser };
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${stored}` },
        });
      } catch {}
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = { user, token, isLoading, login, logout };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function useAuthToken(): string | null {
  return useContext(AuthContext).token;
}
