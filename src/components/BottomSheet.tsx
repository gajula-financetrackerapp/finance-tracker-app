import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import type { ThemeTokens } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra style for the sheet panel */
  style?: StyleProp<ViewStyle>;
};

/**
 * Bottom sheet that closes on:
 * - Android/iOS back
 * - Tap outside
 * - Drag handle down past threshold
 *
 * Keyboard: on iOS only, lift by keyboard height. Android windows often
 * already resize — applying the same inset there yanked the sheet too high.
 */
export function BottomSheet({ visible, onClose, children, style }: Props) {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const [keyboardLift, setKeyboardLift] = useState(0);

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      setKeyboardLift(0);
    } else {
      Keyboard.dismiss();
      setKeyboardLift(0);
    }
  }, [visible, translateY]);

  useEffect(() => {
    if (!visible) return;
    // Android Modal + adjustResize already shrinks the layout; extra lift double-counts.
    if (Platform.OS !== 'ios') return;

    const onShow = Keyboard.addListener('keyboardWillShow', (e) => {
      const h = e.endCoordinates?.height ?? 0;
      // Keyboard frame is from screen bottom; sheet padding already includes home indicator.
      setKeyboardLift(Math.max(0, h - insets.bottom));
    });
    const onHide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardLift(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [visible, insets.bottom]);

  const finishClose = () => {
    Keyboard.dismiss();
    translateY.setValue(0);
    setKeyboardLift(0);
    onClose();
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6 && g.dy > 0,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100 || g.vy > 1.1) {
          Animated.timing(translateY, {
            toValue: 640,
            duration: 180,
            useNativeDriver: true,
          }).start(finishClose);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={finishClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={finishClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 14) + 8,
              marginBottom: keyboardLift,
              transform: [{ translateY }],
            },
            style,
          ]}
        >
          <View {...pan.panHandlers} style={styles.handleHit}>
            <View style={styles.handle} />
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 4,
      maxHeight: '88%',
    },
    handleHit: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    handle: {
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.line,
    },
  });
}
