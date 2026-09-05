import React, { useMemo } from 'react';
import {
  Modal,
  Platform,
  StatusBar,
  View,
  type ModalProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

/** 3-button Home/Back bar. Floor so a too-small inset cannot bury Save under those keys. */
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
    Platform.OS === 'android'
      ? Math.max(insets.bottom, ANDROID_NAV_FALLBACK)
      : insets.bottom;
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

/** Modal that draws under the system bars and re-measures insets inside it. */
export function SystemModal({ children, ...rest }: ModalProps) {
  return (
    <Modal {...SYSTEM_MODAL_PROPS} {...rest}>
      <ModalSafeArea>{children}</ModalSafeArea>
    </Modal>
  );
}

/** Sit a bottom sheet above Home / Back. Applied after caller styles. */
export function useDockedSheetStyle(innerPad = 16): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    marginBottom: insets.bottom,
    marginLeft: insets.left,
    marginRight: insets.right,
    paddingBottom: innerPad,
  };
}

/** Keep a centered dialog off the clock and the nav keys. */
export function useDialogInsetStyle(minPad = 20): ViewStyle {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: Math.max(insets.top, minPad),
    paddingBottom: Math.max(insets.bottom, minPad),
    paddingLeft: Math.max(insets.left, minPad),
    paddingRight: Math.max(insets.right, minPad),
  };
}

/** Bottom sheet that reads insets from the Modal window it sits in. */
export function DockedSheet({
  innerPad = 16,
  style,
  children,
}: {
  innerPad?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const dock = useDockedSheetStyle(innerPad);
  return <View style={[style, dock]}>{children}</View>;
}

/** Backdrop padding so a centered card clears the status and nav bars. */
export function DialogInsetView({
  minPad = 20,
  style,
  children,
}: {
  minPad?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const pad = useDialogInsetStyle(minPad);
  return <View style={[{ flex: 1 }, style, pad]}>{children}</View>;
}

/** Read corrected insets inside SystemModal / ModalSafeArea. */
export function ModalInsets({
  children,
}: {
  children: (insets: EdgeInsets) => React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return <>{children(insets)}</>;
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
