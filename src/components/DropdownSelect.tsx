import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { SystemModal } from './SystemSafeArea';
import type { ThemeTokens } from '../types';

export type DropdownOption = {
  value: string;
  label: string;
};

type Props = {
  label?: string;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Tighter spacing for side‑by‑side layouts. */
  compact?: boolean;
  /** Smaller paddings / fonts (period filters). */
  dense?: boolean;
  /**
   * Menu floats in a modal over content (does not push layout).
   * Scroll works reliably — use for period filters.
   */
  overlay?: boolean;
  /** Theme-colored field (header tint) instead of plain white/bg. */
  themed?: boolean;
  /** Controlled open (so parent can keep only one menu open). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Raise stacking when this field’s menu is open. */
  elevate?: boolean;
};

type Anchor = { x: number; y: number; width: number; height: number };

/** HTML-style `<select>`: tap the field to expand a dropdown list. */
export function DropdownSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
  compact,
  dense,
  overlay,
  themed,
  open: openProp,
  onOpenChange,
  elevate,
}: Props) {
  const { theme } = useApp();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const fieldRef = useRef<RNView>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (openProp === undefined) setUncontrolledOpen(next);
      if (!next) setAnchor(null);
    },
    [onOpenChange, openProp],
  );

  const selectedLabel = useMemo(() => {
    if (!value) return '';
    return options.find((o) => o.value === value)?.label || value;
  }, [options, value]);

  const openMenu = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    if (overlay) {
      fieldRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setOpen(true);
      });
      return;
    }
    setOpen(true);
  };

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const menuList = (
    <ScrollView
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      style={[styles.menuScroll, dense && styles.menuScrollDense]}
      contentContainerStyle={styles.menuContent}
      showsVerticalScrollIndicator
      bounces
    >
      {options.length === 0 ? (
        <Text style={styles.empty}>{placeholder}</Text>
      ) : (
        options.map((item) => {
          const on = item.value === value;
          return (
            <Pressable
              key={item.value || '__none__'}
              style={[styles.option, dense && styles.optionDense, on && styles.optionOn]}
              onPress={() => pick(item.value)}
            >
              <Text
                style={[styles.optionText, dense && styles.optionTextDense, on && styles.optionTextOn]}
              >
                {item.label}
              </Text>
              {on ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );

  const screen = Dimensions.get('window');
  const menuMaxH = dense ? 220 : 260;
  const overlayStyle = (() => {
    if (!anchor) return null;
    const gap = 4;
    const belowTop = anchor.y + anchor.height + gap;
    const bottomGap = Math.max(insets.bottom, 24);
    const topGap = Math.max(insets.top, 24);
    const spaceBelow = screen.height - belowTop - bottomGap;
    const spaceAbove = anchor.y - topGap;
    const width = Math.max(anchor.width, dense ? 110 : 160);
    let left = anchor.x;
    if (left + width > screen.width - 12) left = screen.width - 12 - width;
    if (left < 12) left = 12;
    const preferAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    if (preferAbove) {
      const height = Math.min(menuMaxH, Math.max(120, spaceAbove));
      const top = Math.max(topGap, anchor.y - gap - height);
      return { top, left, width, maxHeight: height };
    }
    const height = Math.min(menuMaxH, Math.max(120, spaceBelow));
    return { top: belowTop, left, width, maxHeight: height };
  })();

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        dense && styles.wrapDense,
        (open || elevate) && !overlay && styles.wrapElevated,
      ]}
    >
      {label ? (
        <Text style={[styles.label, dense && styles.labelDense, themed && styles.labelThemed]}>
          {label}
        </Text>
      ) : null}
      <View ref={fieldRef} collapsable={false}>
        <Pressable
          disabled={disabled}
          onPress={openMenu}
          style={[
            styles.field,
            dense && styles.fieldDense,
            themed && styles.fieldThemed,
            open && (themed ? styles.fieldOpenThemed : styles.fieldOpen),
            disabled && styles.fieldDisabled,
          ]}
        >
          <Text
            style={[
              styles.fieldText,
              dense && styles.fieldTextDense,
              themed && styles.fieldTextThemed,
              !selectedLabel && styles.placeholder,
              !selectedLabel && themed && styles.placeholderThemed,
            ]}
            numberOfLines={1}
          >
            {selectedLabel || placeholder}
          </Text>
          <Text
            style={[styles.chevron, dense && styles.chevronDense, themed && styles.chevronThemed]}
          >
            {open ? '▴' : '▾'}
          </Text>
        </Pressable>
      </View>

      {/* Inline menu (forms) — may push layout */}
      {open && !disabled && !overlay ? (
        <View style={[styles.menu, themed && styles.menuThemed]}>{menuList}</View>
      ) : null}

      {/* Overlay menu in a Modal so scroll gestures aren’t stolen */}
      {overlay ? (
        <SystemModal
          visible={open && !disabled && !!anchor}
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          onRequestClose={() => setOpen(false)}
        >
          <View style={styles.modalRoot} pointerEvents="box-none">
            <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)} />
            {overlayStyle ? (
              <View
                style={[
                  styles.menu,
                  styles.menuOverlayCard,
                  themed && styles.menuThemed,
                  {
                    top: overlayStyle.top,
                    left: overlayStyle.left,
                    width: overlayStyle.width,
                    maxHeight: overlayStyle.maxHeight,
                  },
                ]}
              >
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="always"
                  style={styles.menuScrollFill}
                  contentContainerStyle={styles.menuContent}
                  showsVerticalScrollIndicator
                  bounces={false}
                >
                  {options.length === 0 ? (
                    <Text style={styles.empty}>{placeholder}</Text>
                  ) : (
                    options.map((item) => {
                      const on = item.value === value;
                      return (
                        <Pressable
                          key={item.value}
                          style={[styles.option, dense && styles.optionDense, on && styles.optionOn]}
                          onPress={() => pick(item.value)}
                        >
                          <Text
                            style={[
                              styles.optionText,
                              dense && styles.optionTextDense,
                              on && styles.optionTextOn,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {on ? <Text style={styles.check}>✓</Text> : null}
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </SystemModal>
      ) : null}
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrap: { marginBottom: 10, zIndex: 1 },
    wrapCompact: { marginBottom: 0 },
    wrapDense: { marginBottom: 0 },
    wrapElevated: { zIndex: 40, elevation: 24 },
    label: {
      color: theme.muted,
      fontWeight: '700',
      fontSize: 12,
      marginBottom: 6,
    },
    labelDense: { fontSize: 10, marginBottom: 1, letterSpacing: 0.2 },
    labelThemed: { color: 'rgba(255,255,255,0.78)' },
    field: {
      borderWidth: 1.5,
      borderColor: theme.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: theme.bg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    fieldDense: {
      borderRadius: 9,
      paddingHorizontal: 8,
      paddingVertical: 5,
      gap: 4,
      borderWidth: 1,
    },
    fieldThemed: {
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderColor: 'rgba(255,255,255,0.28)',
    },
    fieldOpen: {
      borderColor: theme.accent,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    },
    fieldOpenThemed: {
      borderColor: 'rgba(255,255,255,0.55)',
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    fieldDisabled: { opacity: 0.45 },
    fieldText: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 14 },
    fieldTextDense: { fontSize: 12, fontWeight: '700' },
    fieldTextThemed: { color: '#fff' },
    placeholder: { color: theme.muted, fontWeight: '500' },
    placeholderThemed: { color: 'rgba(255,255,255,0.65)' },
    chevron: { color: theme.muted, fontSize: 14, fontWeight: '800' },
    chevronDense: { fontSize: 11 },
    chevronThemed: { color: 'rgba(255,255,255,0.85)' },
    menu: {
      borderWidth: 1.5,
      borderTopWidth: 0,
      borderColor: theme.accent,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    menuOverlayCard: {
      position: 'absolute',
      zIndex: 2,
      borderTopWidth: 1.5,
      borderRadius: 12,
      overflow: 'hidden',
      elevation: 28,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    menuThemed: {
      borderColor: theme.header,
      backgroundColor: theme.card,
    },
    modalRoot: { flex: 1 },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    menuScroll: { maxHeight: 200 },
    menuScrollDense: { maxHeight: 220 },
    menuScrollFill: { flexGrow: 0 },
    menuContent: { flexGrow: 0, paddingBottom: 4 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
    },
    optionDense: { paddingVertical: 10, paddingHorizontal: 10 },
    optionOn: { backgroundColor: theme.ink },
    optionText: { flex: 1, color: theme.ink, fontWeight: '600', fontSize: 14 },
    optionTextDense: { fontSize: 13 },
    optionTextOn: { color: theme.onInk, fontWeight: '800' },
    check: { color: theme.onInk, fontWeight: '800', fontSize: 14 },
    empty: {
      color: theme.muted,
      paddingVertical: 14,
      paddingHorizontal: 12,
      fontSize: 13,
    },
  });
}
