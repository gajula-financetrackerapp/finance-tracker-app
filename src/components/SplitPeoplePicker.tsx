import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n/useT';
import type { ThemeTokens } from '../types';

export type SplitFriendOption = {
  id: string;
  label: string;
  /** False when friend cannot be added to new splits (e.g. no Premium). */
  eligible: boolean;
};

export type SplitGroupOption = {
  id: string;
  name: string;
  memberIds: string[];
};

type Props = {
  selfLabel: string;
  friends: SplitFriendOption[];
  groups: SplitGroupOption[];
  /** Selected friend user ids (You is always included separately). */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
};

/**
 * Multi-select friends and groups (any combination).
 * Inline checklist — not a Modal — so picking one group never blocks the next tap.
 */
export function SplitPeoplePicker({
  selfLabel,
  friends,
  groups,
  selectedIds,
  onChange,
  emptyHint,
}: Props) {
  const { theme } = useApp();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);
  /** Groups tapped here; never auto-checked from friend picks. */
  const [pickedGroupIds, setPickedGroupIds] = useState<string[]>([]);

  useEffect(() => {
    if (selectedIds.length === 0) setPickedGroupIds([]);
  }, [selectedIds.length]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const pickedGroupSet = useMemo(() => new Set(pickedGroupIds), [pickedGroupIds]);
  const friendById = useMemo(() => {
    const m = new Map<string, SplitFriendOption>();
    for (const f of friends) m.set(f.id, f);
    return m;
  }, [friends]);

  const eligibleMemberIds = (g: SplitGroupOption) =>
    g.memberIds.filter((id) => friendById.get(id)?.eligible);

  const clearGroupsWithMember = (friendId: string, from: string[]) =>
    from.filter((gid) => {
      const g = groups.find((x) => x.id === gid);
      return g ? !eligibleMemberIds(g).includes(friendId) : false;
    });

  const toggleFriend = (id: string, eligible: boolean) => {
    if (!eligible) return;
    if (selectedSet.has(id)) {
      setPickedGroupIds((prev) => clearGroupsWithMember(id, prev));
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleGroup = (g: SplitGroupOption) => {
    const ids = eligibleMemberIds(g);
    if (ids.length === 0) return;

    if (pickedGroupSet.has(g.id)) {
      const nextPicked = pickedGroupIds.filter((x) => x !== g.id);
      setPickedGroupIds(nextPicked);
      const keep = new Set<string>();
      for (const gid of nextPicked) {
        const other = groups.find((x) => x.id === gid);
        if (other) for (const mid of eligibleMemberIds(other)) keep.add(mid);
      }
      const drop = new Set(ids.filter((id) => !keep.has(id)));
      onChange(selectedIds.filter((x) => !drop.has(x)));
      return;
    }

    // Add this group without clearing other groups / friends.
    setPickedGroupIds((prev) => (prev.includes(g.id) ? prev : [...prev, g.id]));
    const next = new Set(selectedIds);
    for (const id of ids) next.add(id);
    onChange([...next]);
  };

  const remove = (id: string) => {
    setPickedGroupIds((prev) => clearGroupsWithMember(id, prev));
    onChange(selectedIds.filter((x) => x !== id));
  };

  const hasAnyOption = friends.length > 0 || groups.length > 0;
  const selectedFriends = selectedIds
    .map((id) => friendById.get(id))
    .filter((f): f is SplitFriendOption => !!f);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('split.addFriendsOrGroups')}</Text>

      {!hasAnyOption ? (
        emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null
      ) : (
        <>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={[styles.field, expanded && styles.fieldOpen]}
          >
            <Text
              style={[styles.fieldText, selectedIds.length === 0 && styles.placeholder]}
              numberOfLines={1}
            >
              {selectedIds.length > 0
                ? t('split.friendsSelected').replace('{count}', String(selectedIds.length))
                : t('split.addFriendsOrGroupsPlaceholder')}
            </Text>
            <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
          </Pressable>

          {expanded ? (
            <View style={styles.panel}>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
                style={styles.panelScroll}
                showsVerticalScrollIndicator
              >
                {groups.length > 0 ? (
                  <>
                    <Text style={styles.section}>{t('split.groupsSection')}</Text>
                    {groups.map((g) => {
                      const ids = eligibleMemberIds(g);
                      const on = pickedGroupSet.has(g.id);
                      const disabled = ids.length === 0;
                      return (
                        <Pressable
                          key={`g-${g.id}`}
                          disabled={disabled}
                          onPress={() => toggleGroup(g)}
                          style={[
                            styles.option,
                            on && styles.optionOn,
                            disabled && styles.optionDisabled,
                          ]}
                        >
                          <View style={[styles.box, on && styles.boxOn]}>
                            {on ? <Text style={styles.boxCheck}>✓</Text> : null}
                          </View>
                          <Text
                            style={[
                              styles.optionText,
                              on && styles.optionTextOn,
                              disabled && styles.optionTextDisabled,
                            ]}
                            numberOfLines={1}
                          >
                            👥 {g.name}
                            {disabled ? ` · ${t('split.groupNoEligible')}` : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}

                {friends.length > 0 ? (
                  <>
                    <Text style={styles.section}>{t('split.friendsSection')}</Text>
                    {friends.map((f) => {
                      const on = selectedSet.has(f.id);
                      return (
                        <Pressable
                          key={`f-${f.id}`}
                          disabled={!f.eligible}
                          onPress={() => toggleFriend(f.id, f.eligible)}
                          style={[
                            styles.option,
                            on && styles.optionOn,
                            !f.eligible && styles.optionDisabled,
                          ]}
                        >
                          <View style={[styles.box, on && styles.boxOn]}>
                            {on ? <Text style={styles.boxCheck}>✓</Text> : null}
                          </View>
                          <Text
                            style={[
                              styles.optionText,
                              on && styles.optionTextOn,
                              !f.eligible && styles.optionTextDisabled,
                            ]}
                            numberOfLines={1}
                          >
                            {f.label}
                            {!f.eligible ? ` · ${t('split.noPremiumFriend')}` : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}
              </ScrollView>
              <Pressable onPress={() => setExpanded(false)} style={styles.doneRow}>
                <Text style={styles.doneText}>{t('common.close')}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      <Text style={[styles.label, styles.addedLabel]}>{t('split.addedFriends')}</Text>
      <View style={styles.chipRow}>
        <View style={[styles.chip, styles.youChip]}>
          <Text style={styles.chipText} numberOfLines={1}>
            {selfLabel}
          </Text>
        </View>
        {selectedFriends.map((f) => (
          <View key={f.id} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1}>
              {f.label}
            </Text>
            <Pressable onPress={() => remove(f.id)} hitSlop={8} style={styles.chipX}>
              <Text style={styles.chipXText}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {friends.some((f) => !f.eligible) ? (
        <Text style={styles.premiumNote}>{t('split.premiumFriendsOnly')}</Text>
      ) : null}
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
    addedLabel: { marginTop: 12 },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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
    youChip: { paddingRight: 12 },
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
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
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
    panel: {
      borderWidth: 1.5,
      borderTopWidth: 0,
      borderColor: theme.header,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      backgroundColor: theme.card,
      overflow: 'hidden',
    },
    panelScroll: { maxHeight: 260 },
    section: {
      color: theme.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 4,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
      gap: 10,
    },
    optionOn: {
      backgroundColor: theme.header + '14',
    },
    optionDisabled: { opacity: 0.55 },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
    },
    boxOn: {
      borderColor: theme.header,
      backgroundColor: theme.header,
    },
    boxCheck: {
      color: '#fff',
      fontWeight: '900',
      fontSize: 12,
      marginTop: -1,
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
    optionTextDisabled: { color: theme.muted },
    doneRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.line,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    doneText: {
      color: theme.header,
      fontWeight: '800',
      fontSize: 14,
    },
    emptyHint: {
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 4,
    },
    premiumNote: {
      color: theme.muted,
      fontSize: 11,
      marginTop: 8,
      lineHeight: 15,
    },
  });
}
