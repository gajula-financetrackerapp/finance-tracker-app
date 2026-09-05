import React, { useMemo } from 'react';
import { Platform, StatusBar, View } from 'react-native';
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

/** Typical 3-button nav height when Android draws under the bar but reports 0. */
const ANDROID_NAV_FALLBACK = 48;

/** Draw under the status / nav bars, then pad with insets. */
export const SYSTEM_MODAL_PROPS = {
  statusBarTranslucent: true,
  navigationBarTranslucent: true,
} as const;

export function correctSystemInsets(insets: EdgeInsets): EdgeInsets {
  const top =
    Platform.OS === 'android'
      ? Math.max(insets.top, StatusBar.currentHeight ?? 0)
      : insets.top;
  // Edge-to-edge Android with a missing nav inset is how Home / Back sit on
  // top of tab buttons. A gap on a phone that already reserved that space is
  // safer than overlapping the system controls.
  const bottom =
    insets.bottom > 0 ? insets.bottom : Platform.OS === 'android' ? ANDROID_NAV_FALLBACK : 0;
  return { top, right: insets.right, bottom, left: insets.left };
}

/** Re-publish insets so every useSafeAreaInsets() call clears the system bars. */
export function SystemInsetsSync({ children }: { children: React.ReactNode }) {
  const raw = useSafeAreaInsets();
  const insets = useMemo(
    () => correctSystemInsets(raw),
    [raw.top, raw.right, raw.bottom, raw.left],
  );
  return (
    <SafeAreaInsetsContext.Provider value={insets}>{children}</SafeAreaInsetsContext.Provider>
  );
}

/** A Modal is a new window — measure its bars, not the activity behind it. */
export function ModalSafeArea({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <SystemInsetsSync>{children}</SystemInsetsSync>
    </SafeAreaProvider>
  );
}

/** Stack scenes (not the tab shell) sit under the nav bar unless we pad them. */
export function StackScreenSafeArea({
  routeName,
  backgroundColor,
  children,
}: {
  routeName: string;
  backgroundColor: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (routeName === 'Dashboard') return <>{children}</>;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      {children}
    </View>
  );
}
