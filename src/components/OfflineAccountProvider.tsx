"use client";

import { createContext, useContext, type ReactNode } from "react";

const OfflineAccountContext = createContext<string | null>(null);

export function OfflineAccountProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  return (
    <OfflineAccountContext.Provider value={userId}>
      {children}
    </OfflineAccountContext.Provider>
  );
}

export function useOfflineAccountId(): string | null {
  return useContext(OfflineAccountContext);
}
