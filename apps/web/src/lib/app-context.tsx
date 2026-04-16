import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { ApiClient } from "./api-client";
import { asErrorMessage } from "./format";
import { createBrowserSupabaseClient } from "./supabase";

type SessionContext = Awaited<ReturnType<ApiClient["getMe"]>>;
const WORKSPACE_STORAGE_KEY = "smartsend.currentWorkspaceId";

type AppContextValue = {
  apiClient: ApiClient;
  authStatus: "loading" | "authenticated" | "anonymous";
  authError: string | null;
  requestLoginCode: (email: string) => Promise<void>;
  session: SessionContext | null;
  verifyLoginCode: (input: { email: string; token: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider(props: { children: ReactNode }) {
  const [apiClient] = useState(() => new ApiClient());
  const [supabaseStartupError] = useState<string | null>(() => {
    try {
      createBrowserSupabaseClient();
      return null;
    } catch (error) {
      return asErrorMessage(error);
    }
  });
  const [supabase] = useState(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  });
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "anonymous">(
    "loading",
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionContext | null>(null);

  if (!supabase) {
    return (
      <main className="loading-page">
        前端认证配置缺失：{supabaseStartupError ?? "无法初始化 Supabase client。"}
      </main>
    );
  }

  const supabaseClient = supabase;

  async function refreshSession() {
    try {
      const me = await apiClient.getMe();
      persistWorkspaceId(apiClient, me.currentWorkspaceId);
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

  async function requestLoginCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const emailRedirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/login` : null;
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    if (error) {
      setAuthError(asErrorMessage(error));
      throw error;
    }

    setAuthError(null);
  }

  async function verifyLoginCode(input: { email: string; token: string }) {
    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: input.email.trim().toLowerCase(),
      token: input.token.trim(),
      type: "email",
    });

    if (error) {
      setAuthError(asErrorMessage(error));
      throw error;
    }

    apiClient.setAccessToken(data.session?.access_token ?? null);
    await refreshSession();
  }

  async function logout() {
    try {
      await Promise.allSettled([apiClient.logout(), supabaseClient.auth.signOut()]);
    } finally {
      clearWorkspaceId(apiClient);
      apiClient.setAccessToken(null);
      setSession(null);
      setAuthStatus("anonymous");
      setAuthError(null);
    }
  }

  async function switchWorkspace(workspaceId: string) {
    const output = await apiClient.switchWorkspace(workspaceId);
    persistWorkspaceId(apiClient, output.currentWorkspaceId);
    setSession(output);
    setAuthStatus("authenticated");
    setAuthError(null);
  }

  useEffect(() => {
    let active = true;
    apiClient.setWorkspaceId(readWorkspaceId());

    const syncInitialSession = async () => {
      try {
        const {
          data: { session: nextSession },
        } = await supabaseClient.auth.getSession();

        if (!active) {
          return;
        }

        apiClient.setAccessToken(nextSession?.access_token ?? null);

        if (!nextSession) {
          setSession(null);
          setAuthStatus("anonymous");
          setAuthError(null);
          return;
        }

        await refreshSession();
      } catch (error) {
        if (!active) {
          return;
        }

        setSession(null);
        setAuthStatus("anonymous");
        setAuthError(asErrorMessage(error));
      }
    };

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      apiClient.setAccessToken(nextSession?.access_token ?? null);

      if (!nextSession) {
        clearWorkspaceId(apiClient);
        setSession(null);
        setAuthStatus("anonymous");
        setAuthError(null);
        return;
      }

      void refreshSession();
    });

    void syncInitialSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [apiClient, supabaseClient]);

  const value = useMemo<AppContextValue>(() => {
    return {
      apiClient,
      authStatus,
      authError,
      session,
      requestLoginCode,
      verifyLoginCode,
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

function readWorkspaceId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
}

function persistWorkspaceId(apiClient: ApiClient, workspaceId: string) {
  apiClient.setWorkspaceId(workspaceId);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  }
}

function clearWorkspaceId(apiClient: ApiClient) {
  apiClient.setWorkspaceId(null);

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  }
}
