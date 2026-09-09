"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// Observer-only state lives above routes and is never passed to the planner.
const ObserverSelection = createContext<{
  selection: { runInstanceId: string; agentId: string | null } | null;
  select(runInstanceId: string, agentId: string | null): void;
} | null>(null);

export function ObserverSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<{ runInstanceId: string; agentId: string | null } | null>(null);
  const select = useCallback((runInstanceId: string, agentId: string | null) => setSelection({ runInstanceId, agentId }), []);
  const value = useMemo(() => ({ selection, select }), [selection, select]);
  return <ObserverSelection.Provider value={value}>{children}</ObserverSelection.Provider>;
}

export function useObserverSelection(runInstanceId: string) {
  const context = useContext(ObserverSelection);
  const select = context?.select;
  const setSelectedId = useCallback((agentId: string | null) => select?.(runInstanceId, agentId), [select, runInstanceId]);
  if (!context) throw new Error("Observer selection provider is missing.");
  return {
    selectedId: context.selection?.runInstanceId === runInstanceId ? context.selection.agentId : null,
    setSelectedId,
  };
}
