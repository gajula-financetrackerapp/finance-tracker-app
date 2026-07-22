import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useApp } from '../context/AppContext';

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useApp();
  return <View style={[{ flex: 1, backgroundColor: theme.bg }, style]}>{children}</View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useApp();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.line,
          marginBottom: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  danger,
  style,
}: {
  title: string;
  onPress: () => void;
  danger?: boolean;
  style?: ViewStyle;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        {
          backgroundColor: danger ? '#fff' : theme.ink,
          borderColor: danger ? theme.red : theme.ink,
          opacity: pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: danger ? theme.red : theme.primary, fontWeight: '800', fontSize: 15 }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: { label: string } & TextInputProps) {
  const { theme } = useApp();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={theme.muted}
        {...props}
        style={[
          {
            borderWidth: 1.5,
            borderColor: theme.line,
            backgroundColor: theme.card,
            color: theme.ink,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 11,
            fontSize: 15,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  const { theme } = useApp();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
      <Text style={{ fontSize: 42, opacity: 0.5, marginBottom: 10 }}>{icon}</Text>
      <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>{title}</Text>
      {subtitle ? <Text style={{ color: theme.muted, textAlign: 'center' }}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
  },
});
