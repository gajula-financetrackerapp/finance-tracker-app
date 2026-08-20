import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { useNotifications, type FeedRow } from '../context/NotificationsContext';
import { Card, EmptyState, Screen } from '../components/ui';
import { useT } from '../i18n/useT';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../types';

/**
 * Everything waiting on the user, worst first.
 *
 * Opening the list is what marks it read — a separate button to say "yes I have
 * seen these" is a chore, and the badge exists to bring you here, not to be
 * dismissed for its own sake. The rows stay put afterwards, since they describe
 * work still to do; only their unread mark goes.
 */
export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { theme } = useApp();
  const { rows, markAllSeen } = useNotifications();
  const { t } = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => {
    void markAllSeen();
    // Once per visit: re-running as rows change would clear a badge that arrived
    // while the screen sat open, before it had been read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toneColor = (tone: FeedRow['tone']) =>
    tone === 'late' ? theme.red : tone === 'soon' ? theme.header : theme.muted;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon="🔔"
            title={t('notifications.emptyTitle')}
            subtitle={t('notifications.emptyBody')}
          />
        ) : (
          rows.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => {
                if (row.route) navigation.navigate(row.route);
              }}
              disabled={!row.route}
            >
              <Card>
                <View style={styles.row}>
                  <Text style={styles.icon}>{row.icon}</Text>
                  <View style={styles.text}>
                    <Text style={[styles.title, { color: theme.ink }]}>{row.title}</Text>
                    <Text style={[styles.body2, { color: toneColor(row.tone) }]}>{row.body}</Text>
                  </View>
                  {row.unread ? (
                    <View style={[styles.unreadDot, { backgroundColor: theme.red }]} />
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(_theme: ThemeTokens) {
  return StyleSheet.create({
    body: { padding: 16, gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: { fontSize: 22 },
    text: { flex: 1, gap: 2 },
    title: { fontWeight: '800', fontSize: 15 },
    body2: { fontWeight: '700', fontSize: 13 },
    unreadDot: { width: 9, height: 9, borderRadius: 5 },
  });
}
