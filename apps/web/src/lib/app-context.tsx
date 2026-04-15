import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { ApiClient } from "./api-client";
import { asErrorMessage } from "./format";

type SessionContext = Awaited<ReturnType<ApiClient["getMe"]>>;

type AppContextValue = {
  apiClient: ApiClient;
  authStatus: "loading" | "authenticated" | "anonymous";
  authError: string | null;
  session: SessionContext | null;
  login: (input: { email: string; name?: string; workspaceId?: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider(props: { children: ReactNode }) {
  const [apiClient] = useState(() => new ApiClient());
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "anonymous">("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionContext | null>(null);

  async function refreshSession() {
    try {
      const me = await apiClient.getMe();
      setSession(me);
      setAuthStatus("authenticated");
      setAuthError(null);
    } catch (error) {
      setSession(null);
      setAuthStatus("anonymous");
      setAuthError(null);

      const message = asErrorMessage(error);
      if (!message.toLowerCase().includes("authentication required")) {
        setAuthError(message);
      }
    }
  }

  async function login(input: { email: string; name?: string; workspaceId?: string }) {
    try {
      const output = await apiClient.login(input);
      setSession(output);
      setAuthStatus("authenticated");
      setAuthError(null);
    } catch (error) {
      setSession(null);
      setAuthStatus("anonymous");
      setAuthError(asErrorMessage(error));
      throw error;
    }
  }

  async function logout() {
    try {
      await apiClient.logout();
    } finally {
      setSession(null);
      setAuthStatus("anonymous");
      setAuthError(null);
    }
  }

  async function switchWorkspace(workspaceId: string) {
    const output = await apiClient.switchWorkspace(workspaceId);
    setSession(output);
    setAuthStatus("authenticated");
    setAuthError(null);
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  const value = useMemo<AppContextValue>(() => {
    return {
      apiClient,
      authStatus,
      authError,
      session,
      login,
      logout,
      switchWorkspace,
      refreshSession,
    };
  }, [apiClient, authStatus, authError, session]);

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppContextProvider.");
  }

  return context;
}
