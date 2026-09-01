import React, { createContext, useContext } from 'react';
import type { View } from 'react-native';

export type KeyboardScrollApi = {
  registerFocus: (node: View | null) => void;
};

const KeyboardScrollContext = createContext<KeyboardScrollApi>({
  registerFocus: () => {},
});

export function KeyboardScrollProvider({
  value,
  children,
}: {
  value: KeyboardScrollApi;
  children: React.ReactNode;
}) {
  return (
    <KeyboardScrollContext.Provider value={value}>{children}</KeyboardScrollContext.Provider>
  );
}

export function useKeyboardScroll() {
  return useContext(KeyboardScrollContext);
}
