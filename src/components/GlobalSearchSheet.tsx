import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { useWorkspace } from '../WorkspaceContext';
import { fmt, theme } from '../theme';
import { BottomSheet } from './BottomSheet';

export type SearchHit = {
  id: string;
  section: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Same height on open and while typing — avoids the sheet jumping when results appear. */
const SEARCH_SHEET_HEIGHT = Math.min(Math.round(Dimensions.get('window').height * 0.58), 520);

function matches(haystack: string, term: string) {
  return haystack.toLowerCase().includes(term);
}

export function GlobalSearchSheet({ visible, onClose }: Props) {
  const navigation = useNavigation();
  const { setWorkspace } = useWorkspace();
  const {
    finance,
    config,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    shoppingList,
  } = useApp();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Focus after the sheet has settled — immediate autoFocus + keyboard was yanking the sheet.
  useEffect(() => {
    if (!visible) {
      setQuery('');
      return;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [visible]);

  const goRoot = (screen: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const root: any = (navigation as any).getParent?.() ?? navigation;
    root.navigate(screen);
  };

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 1) return [] as SearchHit[];

    const hits: SearchHit[] = [];

    finance.transactions.forEach((t) => {
      const groceryText = (t.groceryItems || [])
        .map((g) => `${g.name} ${g.category} ${g.quantity || ''}`)
        .join(' ');
      const blob = [
        t.category,
        t.note,
        t.kind,
        t.date,
        t.itemName,
        t.quantity,
        groceryText,
        String(t.amount),
      ]
        .filter(Boolean)
        .join(' ');
      if (!matches(blob, term)) return;
      hits.push({
        id: `txn-${t.id}`,
        section: t.kind === 'income' ? 'Income' : t.kind === 'expense' ? 'Expense' : 'Transfer',
        icon: t.kind === 'income' ? '💰' : '🧾',
        title: t.category,
        subtitle: [
          t.date,
          t.note || t.itemName || '',
          fmt(t.amount, config.currency),
        ]
          .filter(Boolean)
          .join(' · '),
        onPress: () => {
          setWorkspace('finance');
          onClose();
        },
      });
    });

    expenseReminders.forEach((r) => {
      const blob = `${r.name} ${r.dueDate} ${r.amount} ${r.paid ? 'paid' : 'pending'}`;
      if (!matches(blob, term)) return;
      hits.push({
        id: `exp-${r.id}`,
        section: 'Expense reminder',
        icon: '💸',
        title: r.name,
        subtitle: `Due ${r.dueDate} · ${fmt(r.amount, config.currency)}${r.paid ? ' · Paid' : ''}`,
        onPress: () => {
          setWorkspace('reminders');
          onClose();
          goRoot('ExpenseReminder');
        },
      });
    });

    medReminders.forEach((m) => {
      const blob = `${m.name} ${(m.times || []).join(' ')}`;
      if (!matches(blob, term)) return;
      hits.push({
        id: `med-${m.id}`,
        section: 'Medicine',
        icon: '💊',
        title: m.name,
        subtitle: (m.times || []).join(', ') || 'Medicine reminder',
        onPress: () => {
          setWorkspace('reminders');
          onClose();
          goRoot('MedicineReminder');
        },
      });
    });

    groceryReminders.forEach((g) => {
      const blob = `${g.item} ${g.category} ${g.expiryDate} ${g.quantity || ''} ${g.note || ''}`;
      if (!matches(blob, term)) return;
      hits.push({
        id: `groc-${g.id}`,
        section: 'Grocery expiry',
        icon: g.icon || '🥬',
        title: g.item,
        subtitle: `${g.category} · Expiry ${g.expiryDate}`,
        onPress: () => {
          setWorkspace('reminders');
          onClose();
          goRoot('GroceryReminder');
        },
      });
    });

    generalReminders.forEach((r) => {
      const blob = `${r.title} ${r.note || ''} ${r.date} ${r.time} ${r.repeat}`;
      if (!matches(blob, term)) return;
      hits.push({
        id: `gen-${r.id}`,
        section: 'General reminder',
        icon: '🔔',
        title: r.title,
        subtitle: `${r.date} ${r.time}${r.note ? ` · ${r.note}` : ''}`,
        onPress: () => {
          setWorkspace('reminders');
          onClose();
          goRoot('GeneralReminder');
        },
      });
    });

    shoppingList.forEach((s) => {
      const blob = `${s.name} ${s.qty} ${s.unit} ${s.store} ${s.price} ${s.bought ? 'bought' : ''}`;
      if (!matches(blob, term)) return;
      hits.push({
        id: `shop-${s.id}`,
        section: 'Buy list',
        icon: s.bought ? '✅' : '🛒',
        title: s.name,
        subtitle: [s.qty && `Qty ${s.qty}`, s.store, s.price && `₹${s.price}`]
          .filter(Boolean)
          .join(' · '),
        onPress: () => {
          setWorkspace('shopping');
          onClose();
        },
      });
    });

    return hits.slice(0, 60);
  }, [
    query,
    finance.transactions,
    expenseReminders,
    medReminders,
    groceryReminders,
    generalReminders,
    shoppingList,
    config.currency,
  ]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      style={[styles.sheet, { height: SEARCH_SHEET_HEIGHT }]}
    >
      <Text style={styles.title}>Search</Text>
      <View style={styles.inputRow}>
        <Text style={styles.inputIcon}>🔍</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions, reminders, buy list…"
          placeholderTextColor={theme.muted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.body}>
        {!query.trim() ? (
          <Text style={styles.hint}>
            Type to search across expenses, income, reminders, medicines, groceries, and buy-list
            items.
          </Text>
        ) : results.length === 0 ? (
          <Text style={styles.empty}>No matches for “{query.trim()}”</Text>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={styles.list}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={item.onPress}>
                <Text style={styles.rowIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.section}>{item.section}</Text>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingBottom: 8 },
  title: {
    fontWeight: '800',
    fontSize: 18,
    color: theme.ink,
    textAlign: 'center',
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.line,
    backgroundColor: theme.bg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  inputIcon: { fontSize: 16 },
  input: {
    flex: 1,
    color: theme.ink,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  clear: { color: theme.muted, fontWeight: '800', fontSize: 14, paddingHorizontal: 4 },
  body: { flex: 1, minHeight: 0 },
  hint: { color: theme.muted, fontSize: 13, lineHeight: 18, paddingVertical: 8 },
  empty: { color: theme.muted, textAlign: 'center', paddingVertical: 28, fontWeight: '600' },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.line,
  },
  rowIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  section: {
    color: theme.accent,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  rowTitle: { color: theme.ink, fontWeight: '800', fontSize: 15 },
  rowSub: { color: theme.muted, fontSize: 12, marginTop: 2 },
});
