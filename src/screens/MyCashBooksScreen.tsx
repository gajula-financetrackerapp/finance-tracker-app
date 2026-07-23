import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { requireAuthToSave } from '../authGate';
import { CASH_BOOK_ICONS } from '../cashBooks';
import { Card, PrimaryButton, Screen } from '../components/ui';
import type { CashBook } from '../types';
import { fmt } from '../theme';

export function MyCashBooksScreen() {
  const {
    theme,
    config,
    cashBooks,
    activeBook,
    setActiveBookId,
    createCashBook,
    renameCashBook,
    setCashBookIcon,
    setCashBookArchived,
    deleteCashBook,
  } = useApp();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📒');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const activeBooks = useMemo(
    () => cashBooks.books.filter((b) => !b.archived),
    [cashBooks.books],
  );
  const archivedBooks = useMemo(
    () => cashBooks.books.filter((b) => b.archived),
    [cashBooks.books],
  );

  const monthBalance = (book: CashBook) => {
    let income = 0;
    let expense = 0;
    for (const t of book.finance.transactions) {
      if (t.kind === 'income') income += t.amount;
      else if (t.kind === 'expense') expense += t.amount;
    }
    return income - expense;
  };

  const submitCreate = async () => {
    const err = await createCashBook({ name: newName, icon: newIcon });
    if (err) {
      Alert.alert('Could not create', err);
      return;
    }
    setNewName('');
    setNewIcon('📒');
    setCreating(false);
  };

  const startRename = (book: CashBook) => {
    setEditingId(book.id);
    setEditName(book.name);
  };

  const submitRename = async () => {
    if (!editingId) return;
    const err = await renameCashBook(editingId, editName);
    if (err) {
      Alert.alert('Could not rename', err);
      return;
    }
    setEditingId(null);
    setEditName('');
  };

  const confirmArchive = (book: CashBook) => {
    Alert.alert('Archive cash book', `Archive “${book.name}”? You can restore it later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          void setCashBookArchived(book.id, true).then((err) => {
            if (err) Alert.alert('Could not archive', err);
          });
        },
      },
    ]);
  };

  const confirmDelete = (book: CashBook) => {
    Alert.alert(
      'Delete cash book',
      `Permanently delete “${book.name}” and all of its transactions? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteCashBook(book.id).then((err) => {
              if (err) Alert.alert('Could not delete', err);
            });
          },
        },
      ],
    );
  };

  const renderBook = (book: CashBook, archived: boolean) => {
    const selected = book.id === activeBook.id;
    const editing = editingId === book.id;
    return (
      <View
        key={book.id}
        style={[
          styles.bookRow,
          {
            borderColor: selected ? theme.primary : theme.line,
            backgroundColor: selected ? theme.bg : theme.card,
          },
        ]}
      >
        <Pressable
          disabled={archived}
          onPress={() => void setActiveBookId(book.id)}
          style={styles.bookMain}
        >
          <Text style={styles.bookIcon}>{book.icon}</Text>
          <View style={{ flex: 1 }}>
            {editing ? (
              <TextInput
                value={editName}
                onChangeText={setEditName}
                autoFocus
                style={[styles.editInput, { color: theme.ink, borderColor: theme.line }]}
                placeholderTextColor={theme.muted}
              />
            ) : (
              <Text style={[styles.bookName, { color: theme.ink }]}>
                {book.name}
                {selected ? ' (default)' : ''}
              </Text>
            )}
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
              {book.finance.transactions.length} txn
              {book.finance.transactions.length === 1 ? '' : 's'} · net{' '}
              {fmt(monthBalance(book), config.currency)}
            </Text>
          </View>
        </Pressable>

        {editing ? (
          <View style={styles.actions}>
            <Pressable onPress={() => void submitRename()} style={styles.actionBtn}>
              <Text style={{ color: theme.primaryDark, fontWeight: '800' }}>Save</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setEditingId(null);
                setEditName('');
              }}
              style={styles.actionBtn}
            >
              <Text style={{ color: theme.muted, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            {!archived ? (
              <>
                <Pressable onPress={() => startRename(book)} style={styles.actionBtn}>
                  <Text style={{ color: theme.ink, fontWeight: '700', fontSize: 12 }}>Rename</Text>
                </Pressable>
                <Pressable onPress={() => confirmArchive(book)} style={styles.actionBtn}>
                  <Text style={{ color: theme.muted, fontWeight: '700', fontSize: 12 }}>Archive</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => void setCashBookArchived(book.id, false)}
                style={styles.actionBtn}
              >
                <Text style={{ color: theme.primaryDark, fontWeight: '700', fontSize: 12 }}>
                  Restore
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => confirmDelete(book)} style={styles.actionBtn}>
              <Text style={{ color: theme.red, fontWeight: '700', fontSize: 12 }}>Delete</Text>
            </Pressable>
          </View>
        )}

        {!archived && !editing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.iconRow}
          >
            {CASH_BOOK_ICONS.map((ic) => (
              <Pressable
                key={ic}
                onPress={() => void setCashBookIcon(book.id, ic)}
                style={[
                  styles.iconChip,
                  {
                    borderColor: book.icon === ic ? theme.primary : theme.line,
                    backgroundColor: book.icon === ic ? theme.bg : theme.card,
                  },
                ]}
              >
                <Text style={{ fontSize: 16 }}>{ic}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Card>
          <Text style={[styles.title, { color: theme.ink }]}>My Cash Books</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Each book is a separate money notebook. Home and Finance use your active book.
            Tap another book to make it active (default).
          </Text>
          <Text style={[styles.activeLine, { color: theme.ink }]}>
            Active: {activeBook.icon} {activeBook.name} (default)
          </Text>
        </Card>

        <Card>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: theme.ink }]}>Books</Text>
            {!creating ? (
              <Pressable
                onPress={() => {
                  if (!requireAuthToSave('create a cash book')) return;
                  setCreating(true);
                }}
              >
                <Text style={{ color: theme.primaryDark, fontWeight: '800' }}>+ New</Text>
              </Pressable>
            ) : null}
          </View>

          {creating ? (
            <View style={[styles.createBox, { borderColor: theme.line, backgroundColor: theme.bg }]}>
              <Text style={[styles.fieldLabel, { color: theme.muted }]}>Name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Business, Trip"
                placeholderTextColor={theme.muted}
                style={[styles.editInput, { color: theme.ink, borderColor: theme.line }]}
              />
              <Text style={[styles.fieldLabel, { color: theme.muted, marginTop: 10 }]}>Icon</Text>
              <View style={styles.iconWrap}>
                {CASH_BOOK_ICONS.map((ic) => (
                  <Pressable
                    key={ic}
                    onPress={() => setNewIcon(ic)}
                    style={[
                      styles.iconChip,
                      {
                        borderColor: newIcon === ic ? theme.primary : theme.line,
                        backgroundColor: newIcon === ic ? theme.card : theme.bg,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16 }}>{ic}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Create" onPress={() => void submitCreate()} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton
                    title="Cancel"
                    danger
                    onPress={() => {
                      setCreating(false);
                      setNewName('');
                      setNewIcon('📒');
                    }}
                  />
                </View>
              </View>
            </View>
          ) : null}

          {activeBooks.map((b) => renderBook(b, false))}
          {activeBooks.length === 0 ? (
            <Text style={{ color: theme.muted }}>No books available. Restore one from Archived.</Text>
          ) : null}
        </Card>

        {archivedBooks.length > 0 ? (
          <Card>
            <Text style={[styles.sectionTitle, { color: theme.ink, marginBottom: 10 }]}>
              Archived
            </Text>
            {archivedBooks.map((b) => renderBook(b, true))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  title: { fontWeight: '900', fontSize: 18, marginBottom: 6 },
  hint: { lineHeight: 20, marginBottom: 10, fontSize: 13 },
  activeLine: { fontWeight: '800', fontSize: 14 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontWeight: '900', fontSize: 16 },
  createBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bookRow: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  bookMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookIcon: { fontSize: 28 },
  bookName: { fontWeight: '800', fontSize: 16 },
  editInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: '700',
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  actionBtn: { paddingVertical: 2 },
  iconRow: { gap: 8, paddingTop: 10 },
  iconWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
