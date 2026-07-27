import React from 'react';
import {
  GestureResponderEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { spawnScreenRipple } from './ScreenRippleHost';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  rippleColor?: string;
  /** When false, caller owns the screen wave (e.g. useUiFeedbackTrigger). */
  screenRipple?: boolean;
};

/** Pressable that can spawn a full-screen ripple from the tap. */
export function RipplePressable({
  children,
  style,
  rippleColor = 'rgba(255,255,255,0.35)',
  screenRipple = true,
  onPressIn,
  disabled,
  ...rest
}: Props) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled && screenRipple) {
          const { pageX, pageY } = e.nativeEvent;
          spawnScreenRipple(pageX, pageY, rippleColor);
        }
        onPressIn?.(e);
      }}
      style={[styles.host, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'relative',
  },
});
