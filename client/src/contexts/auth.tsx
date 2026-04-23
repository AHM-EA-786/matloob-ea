import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { apiRequest, setAuthToken, setOn401 } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

export interface AuthUser {
  id: number;
  email: string;
  role: "client" | "admin";
  firstName: string;
  lastName: string;
  phone: string | null;
  status: "pending" | "active" | "suspended" | "archived";
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  signin: (
    email: string,
    password: string,
    mfaCode?: string,
  ) => Promise<{ requiresMfa?: boolean; user?: AuthUser }>;
  signup: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => Promise<{ ok: true; emailSent: boolean }>;
  signout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [, navigate] = useLocation();

  // Wire 401 handler once
  useEffect(() => {
    setOn401(() => {
      setAuthToken(null);
      setToken(null);
      setUser(null);
      queryClient.clear();
      navigate("/signin");
    });
  }, [navigate]);

  const refreshMe = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = await res.json();
      setUser(data.user);
    } catch {
      setUser(null);
      setToken(null);
      setAuthToken(null);
    }
  }, []);

  const signin: AuthContextValue["signin"] = async (email, password, mfaCode) => {
    const res = await apiRequest("POST", "/api/auth/signin", { email, password, mfaCode });
    const data = await res.json();
    if (data.requiresMfa) return { requiresMfa: true };
    setToken(data.token);
    setAuthToken(data.token);
    setUser(data.user);
    return { user: data.user };
  };

  const signup: AuthContextValue["signup"] = async (payload) => {
    const res = await apiRequest("POST", "/api/auth/signup", payload);
    const data = await res.json().catch(() => ({}));
    return { ok: true, emailSent: !!data?.emailSent };
  };

  const signout = async () => {
    try {
      await apiRequest("POST", "/api/auth/signout");
    } catch {
      /* ignore */
    }
    setUser(null);
    setToken(null);
    setAuthToken(null);
    queryClient.clear();
    navigate("/signin");
  };

  return (
    <AuthContext.Provider value={{ user, token, signin, signup, signout, refreshMe, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
