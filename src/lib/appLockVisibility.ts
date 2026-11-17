import { useSyncExternalStore } from 'react';

let contentLocked = false;
const listeners = new Set<() => void>();

export function subscribeToAppContentLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAppContentLocked(locked: boolean): void {
  if (contentLocked === locked) return;
  contentLocked = locked;
  for (const listener of listeners) listener();
}

export function isAppContentLocked(): boolean {
  return contentLocked;
}

export function useAppContentLocked(): boolean {
  return useSyncExternalStore(
    subscribeToAppContentLock,
    isAppContentLocked,
    isAppContentLocked,
  );
}
