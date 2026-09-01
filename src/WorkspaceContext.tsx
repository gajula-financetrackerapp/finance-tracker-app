import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SplitDeepLink } from './lib/splitDeepLink';

export type { SplitDeepLink };
export type Workspace = 'finance' | 'reminders' | 'shopping' | 'split';

type WorkspaceContextValue = {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  splitDeepLink: SplitDeepLink | null;
  openSplit: (link: SplitDeepLink) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>('finance');
  const [splitDeepLink, setSplitDeepLink] = useState<SplitDeepLink | null>(null);

  const setWorkspace = useCallback((w: Workspace) => {
    setSplitDeepLink(null);
    setWorkspaceState(w);
  }, []);

  const openSplit = useCallback((link: SplitDeepLink) => {
    setSplitDeepLink(link);
    setWorkspaceState('split');
  }, []);

  const value = useMemo(
    () => ({ workspace, setWorkspace, splitDeepLink, openSplit }),
    [workspace, splitDeepLink, openSplit],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
