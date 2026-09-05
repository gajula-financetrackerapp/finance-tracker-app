import React, { useMemo, useRef, useState } from 'react';
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
import { useT } from '../i18n/useT';
import { SystemModal } from './SystemSafeArea';
import type { ThemeTokens } from '../types';

type Props = {
  label: string;
  placeholder: string;
  /** Friend user ids available to pick. */
  options: { id: string; label: string }[];
  /** Selected friend ids. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
  /** Soft background for chips (create form uses theme.bg). */
  chipBg?: string;
};

type Anchor = { x: number; y: number; width: number; height: number };

/**
 * Multi-select friends: overlay dropdown to toggle, chips with ✕ to remove.
 */
export function FriendMultiSelect({
  label,
  placeholder,
  options,
  selectedIds,
  onChange,
  emptyHint,
  chipBg,
}: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const fieldRef = useRef<RNView>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedOptions = options.filter((o) => selectedSet.has(o.id));

  const closeMenu = () => {
    setOpen(false);
    setAnchor(null);
  };

  const openMenu = () => {
    if (open) {
      closeMenu();
      return;
    }
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const remove = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  const screen = Dimensions.get('window');
  const overlayStyle = (() => {
    if (!anchor) return null;
    const gap = 4;
    const belowTop = anchor.y + anchor.height + gap;
    const bottomGap = Math.max(insets.bottom, 24);
    const topGap = Math.max(insets.top, 24);
    const spaceBelow = screen.height - belowTop - bottomGap;
    const spaceAbove = anchor.y - topGap;
    const width = Math.max(anchor.width, 160);
    let left = anchor.x;
    if (left + width > screen.width - 12) left = screen.width - 12 - width;
    if (left < 12) left = 12;
    const preferAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    if (preferAbove) {
      const height = Math.min(240, Math.max(120, spaceAbove));
      const top = Math.max(topGap, anchor.y - gap - height);
      return { top, left, width, height };
    }
    const height = Math.min(240, Math.max(120, spaceBelow));
    return { top: belowTop, left, width, height };
  })();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>

      {selectedOptions.length > 0 ? (
        <View style={styles.chipRow}>
          {selectedOptions.map((o) => (
            <View
              key={o.id}
              style={[styles.chip, chipBg ? { backgroundColor: chipBg } : null]}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {o.label}
              </Text>
              <Pressable onPress={() => remove(o.id)} hitSlop={8} style={styles.chipX}>
                <Text style={styles.chipXText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {options.length === 0 ? (
        emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null
      ) : (
        <View ref={fieldRef} collapsable={false}>
          <Pressable onPress={openMenu} style={[styles.field, open && styles.fieldOpen]}>
            <Text style={[styles.fieldText, selectedIds.length === 0 && styles.placeholder]}>
              {selectedIds.length > 0
                ? t('split.friendsSelected').replace('{count}', String(selectedIds.length))
                : placeholder}
            </Text>
            <Text style={styles.chevron}>{open ? '▴' : '▾'}</Text>
          </Pressable>
        </View>
      )}

      <SystemModal
        visible={open && !!anchor}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={closeMenu}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable style={styles.modalBackdrop} onPress={closeMenu} />
          {overlayStyle ? (
            <View
              style={[
                styles.menuOverlay,
                {
                  top: overlayStyle.top,
                  left: overlayStyle.left,
                  width: overlayStyle.width,
                  maxHeight: overlayStyle.height,
                },
              ]}
            >
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
                bounces={false}
                style={styles.menuScroll}
                contentContainerStyle={styles.menuContent}
                showsVerticalScrollIndicator
              >
                {options.map((o) => {
                  const on = selectedSet.has(o.id);
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => toggle(o.id)}
                      style={[styles.option, on && styles.optionOn]}
                    >
                      <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>
                        {o.label}
                      </Text>
                      {on ? <Text style={styles.check}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </SystemModal>
    </View>
  );
}

function makeStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrap: { marginBottom: 12 },
    label: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
      paddingVertical: 7,
      paddingLeft: 12,
      paddingRight: 8,
      borderRadius: 10,
      backgroundColor: theme.header,
    },
    chipText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 12,
      flexShrink: 1,
    },
    chipX: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
    },
    chipXText: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 11,
      marginTop: -1,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: theme.line,
      backgroundColor: theme.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 46,
    },
    fieldOpen: {
      borderColor: theme.header,
    },
    fieldText: {
      flex: 1,
      color: theme.ink,
      fontWeight: '600',
      fontSize: 14,
    },
    placeholder: {
      color: theme.muted,
      fontWeight: '500',
    },
    chevron: {
      color: theme.muted,
      fontSize: 12,
      fontWeight: '800',
      marginLeft: 8,
    },
    modalRoot: { flex: 1 },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
    },
    menuOverlay: {
      position: 'absolute',
      zIndex: 2,
      borderWidth: 1.5,
      borderColor: theme.header,
      borderRadius: 12,
      backgroundColor: theme.card,
      overflow: 'hidden',
      elevation: 28,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    menuScroll: { flexGrow: 0 },
    menuContent: { flexGrow: 0, paddingBottom: 4 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
      gap: 8,
    },
    optionOn: {
      backgroundColor: theme.header + '14',
    },
    optionText: {
      flex: 1,
      color: theme.ink,
      fontWeight: '600',
      fontSize: 14,
    },
    optionTextOn: {
      color: theme.header,
      fontWeight: '800',
    },
    check: {
      color: theme.header,
      fontWeight: '900',
      fontSize: 14,
    },
    emptyHint: {
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
