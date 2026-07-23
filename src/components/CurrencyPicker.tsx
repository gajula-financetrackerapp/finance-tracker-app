import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CURRENCIES, currencyDisplaySymbol, type CurrencyDef } from '../constants';
import { theme as pulse } from '../theme';

type Props = {
  selectedCode: string;
  onSelect: (code: string) => void;
  /** Cap list height inside bottom sheets / cards */
  maxHeight?: number;
};

/**
 * Searchable world-currency picker (ISO 4217). Popular codes stay near the top of CURRENCIES.
 */
export function CurrencyPicker({ selectedCode, onSelect, maxHeight = 420 }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.sym.toLowerCase().includes(q),
    );
  }, [query]);

  const renderItem = ({ item }: { item: CurrencyDef }) => {
    const on = item.code === selectedCode;
    return (
      <Pressable
        style={[styles.row, on && styles.rowOn]}
        onPress={() => onSelect(item.code)}
      >
        <Text style={styles.sym}>{currencyDisplaySymbol(item.code)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{item.code}</Text>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        {on ? <Text style={styles.check}>✓</Text> : null}
      </Pressable>
    );
  };

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search currency (INR, Euro, ¥…)"
        placeholderTextColor={pulse.muted}
        autoCorrect={false}
        autoCapitalize="characters"
        style={styles.search}
      />
      <Text style={styles.meta}>
        {filtered.length} of {CURRENCIES.length} currencies
      </Text>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.code}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight }}
        nestedScrollEnabled
        ListEmptyComponent={
          <Text style={styles.empty}>No currencies match “{query.trim()}”</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1.5,
    borderColor: pulse.line,
    backgroundColor: pulse.card,
    color: pulse.ink,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 8,
  },
  meta: {
    color: pulse.muted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: pulse.line,
  },
  rowOn: {
    backgroundColor: pulse.accent + '18',
  },
  sym: {
    width: 40,
    fontSize: 18,
    fontWeight: '800',
    color: pulse.ink,
    textAlign: 'center',
  },
  code: { fontWeight: '800', color: pulse.ink, fontSize: 15 },
  name: { color: pulse.muted, fontSize: 12, marginTop: 2 },
  check: { color: pulse.accent, fontWeight: '900', fontSize: 16 },
  empty: { color: pulse.muted, textAlign: 'center', paddingVertical: 24 },
});
