import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ApiClient } from "./api-client";
import type { DevContext } from "./dev-context";
import { loadDevContext, saveDevContext } from "./dev-context";

type AppContextValue = {
  apiClient: ApiClient;
  devContext: DevContext;
  setDevContext: (next: DevContext) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider(props: { children: ReactNode }) {
  const [devContext, setDevContextState] = useState<DevContext>(() => loadDevContext());

  const value = useMemo<AppContextValue>(() => {
    const apiClient = new ApiClient(() => devContext);

    return {
      apiClient,
      devContext,
      setDevContext(next) {
        setDevContextState(next);
        saveDevContext(next);
      },
    };
  }, [devContext]);

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppContextProvider.");
  }

  return context;
}
