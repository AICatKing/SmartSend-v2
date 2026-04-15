export type DevContext = {
  userId: string;
  workspaceId: string;
  userEmail: string;
  userName: string;
};

const CONTEXT_STORAGE_KEY = "smartsend-v2.web.dev-context";

const defaultContext: DevContext = {
  userId: "user_local_owner",
  workspaceId: "ws_local_demo",
  userEmail: "local-owner@example.com",
  userName: "Local Owner",
};

export function loadDevContext(): DevContext {
  const raw = window.localStorage.getItem(CONTEXT_STORAGE_KEY);
  if (!raw) {
    return { ...defaultContext };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DevContext>;
    return {
      ...defaultContext,
      ...parsed,
    };
  } catch {
    return { ...defaultContext };
  }
}

export function saveDevContext(context: DevContext) {
  window.localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
}
