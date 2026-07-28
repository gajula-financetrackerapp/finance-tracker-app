import React, { useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useUiFeedbackTrigger } from '../lib/useUiFeedbackTrigger';
import { spawnScreenRipple } from './ScreenRippleHost';

type LocalRipple = {
  id: number;
  x: number;
  y: number;
  size: number;
  anim: Animated.Value;
};

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  rippleColor?: string;
  /** Soft wave clipped to the button. */
  localRipple?: boolean;
  /**
   * Extra immediate screen wave (bypasses Premium style gate).
   * Prefer leaving this false and using uiFeedback instead.
   */
  screenRipple?: boolean;
  /**
   * When true (default), play the selected Premium feedback style
   * (sound + full-screen wave from this press).
   */
  uiFeedback?: boolean;
};

/** Pressable with local ripple + optional Premium UI feedback wave. */
export function RipplePressable({
  children,
  style,
  rippleColor = 'rgba(255,255,255,0.45)',
  localRipple = true,
  screenRipple = false,
  uiFeedback = true,
  onPressIn,
  disabled,
  ...rest
}: Props) {
  const triggerFeedback = useUiFeedbackTrigger();
  const [ripples, setRipples] = useState<LocalRipple[]>([]);
  const layout = useRef({ w: 0, h: 0 });
  const nextId = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    layout.current = {
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    };
  };

  const spawnLocal = (x: number, y: number) => {
    const { w, h } = layout.current;
    const size = Math.max(w, h, 48) * 2.2;
    const id = ++nextId.current;
    const anim = new Animated.Value(0);
    setRipples((prev) => [...prev, { id, x, y, size, anim }]);
    Animated.timing(anim, {
      toValue: 1,
      duration: 520,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setRipples((prev) => prev.filter((r) => r.id !== id));
    });
  };

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onLayout={onLayout}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled) {
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          if (localRipple) spawnLocal(locationX, locationY);
          if (screenRipple) spawnScreenRipple(pageX, pageY, rippleColor);
          if (uiFeedback) triggerFeedback(e);
        }
        onPressIn?.(e);
      }}
      style={[styles.host, style]}
    >
      <View pointerEvents="none" style={styles.rippleLayer}>
        {ripples.map((r) => {
          const scale = r.anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.15, 1],
          });
          const opacity = r.anim.interpolate({
            inputRange: [0, 0.25, 1],
            outputRange: [0.65, 0.3, 0],
          });
          return (
            <Animated.View
              key={r.id}
              style={[
                styles.ripple,
                {
                  width: r.size,
                  height: r.size,
                  borderRadius: r.size / 2,
                  left: r.x - r.size / 2,
                  top: r.y - r.size / 2,
                  backgroundColor: rippleColor,
                  opacity,
                  transform: [{ scale }],
                },
              ]}
            />
          );
        })}
      </View>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'relative',
    overflow: 'hidden',
  },
  rippleLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  ripple: {
    position: 'absolute',
  },
});
