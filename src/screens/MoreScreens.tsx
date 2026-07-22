import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { fmt, todayStr, uid } from '../utils';

export function ExpenseReminderScreen() {
  const { theme, config, expenseReminders, setExpenseReminders } = useApp();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayStr());

  const save = async () => {
    if (!name.trim()) {
      Alert.alert('Name required');
      return;
    }
    await setExpenseReminders([
      {
        id: uid(),
        name: name.trim(),
        amount: parseFloat(amount) || 0,
        dueDate,
        paid: false,
        offsets: config.expenseOffsets,
        mode: 'default',
      },
      ...expenseReminders,
    ]);
    setName('');
    setAmount('');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Field label="Expense name" value={name} onChangeText={setName} placeholder="e.g. Rent" />
          <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Field label="Due date (YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} />
          <PrimaryButton title="+ Save Reminder" onPress={save} />
        </Card>

        {expenseReminders.length === 0 ? (
          <EmptyState icon="💸" title="No expense reminders" />
        ) : (
          expenseReminders.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>{r.name}</Text>
                  <Text style={{ color: theme.muted }}>Due {r.dueDate}</Text>
                </View>
                <Text style={{ color: theme.ink, fontWeight: '800' }}>{fmt(r.amount, config.currency)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <PrimaryButton
                  title={r.paid ? '✓ Paid' : 'Mark as Paid'}
                  onPress={() =>
                    setExpenseReminders(expenseReminders.map((x) => (x.id === r.id ? { ...x, paid: !x.paid } : x)))
                  }
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Delete"
                  danger
                  onPress={() => setExpenseReminders(expenseReminders.filter((x) => x.id !== r.id))}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

export function MedicineReminderScreen() {
  const { theme, medReminders, setMedReminders } = useApp();
  const [name, setName] = useState('');

  const save = async () => {
    if (!name.trim()) return Alert.alert('Name required');
    await setMedReminders([
      {
        id: uid(),
        name: name.trim(),
        frequency: 'daily',
        days: [],
        times: ['Morning'],
        customTimes: {},
        done: {},
        mode: 'default',
      },
      ...medReminders,
    ]);
    setName('');
  };

  const markDone = (id: string, slot: string) => {
    const day = todayStr();
    setMedReminders(
      medReminders.map((m) => {
        if (m.id !== id) return m;
        const done = { ...(m.done || {}) };
        done[day] = { ...(done[day] || {}), [slot]: true };
        return { ...m, done };
      }),
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Field label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Vitamin D" />
          <PrimaryButton title="+ Add Medicine" onPress={save} />
        </Card>
        {medReminders.length === 0 ? (
          <EmptyState icon="💊" title="No medicines added" />
        ) : (
          medReminders.map((m) => {
            const doneToday = m.done?.[todayStr()] || {};
            return (
              <Card key={m.id}>
                <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>{m.name}</Text>
                <Text style={{ color: theme.muted, marginBottom: 8 }}>{m.frequency} · {m.times.join(', ')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {m.times.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => markDone(m.id, t)}
                      style={{
                        backgroundColor: doneToday[t] ? '#D6F0DF' : '#FBD8D8',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ fontWeight: '700' }}>{doneToday[t] ? `✓ ${t}` : t}</Text>
                    </Pressable>
                  ))}
                  <PrimaryButton
                    title="Delete"
                    danger
                    onPress={() => setMedReminders(medReminders.filter((x) => x.id !== m.id))}
                  />
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

export function GroceryReminderScreen() {
  const { theme, groceryReminders, setGroceryReminders } = useApp();
  const [item, setItem] = useState('');
  const [expiryDate, setExpiryDate] = useState(todayStr());

  const save = async () => {
    if (!item.trim()) return Alert.alert('Item required');
    await setGroceryReminders([
      {
        id: uid(),
        category: 'Others',
        item: item.trim(),
        icon: '🛒',
        expiryDate,
        offsets: [2, 1, 0],
        mode: 'default',
      },
      ...groceryReminders,
    ]);
    setItem('');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Field label="Item name" value={item} onChangeText={setItem} placeholder="e.g. Milk" />
          <Field label="Expiry date (YYYY-MM-DD)" value={expiryDate} onChangeText={setExpiryDate} />
          <PrimaryButton title="+ Add Grocery Item" onPress={save} />
        </Card>
        {groceryReminders.length === 0 ? (
          <EmptyState icon="🥬" title="No grocery expiry items" />
        ) : (
          groceryReminders.map((g) => (
            <Card key={g.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>
                    {g.icon} {g.item}
                  </Text>
                  <Text style={{ color: theme.muted }}>Expires {g.expiryDate}</Text>
                </View>
                <PrimaryButton
                  title="Delete"
                  danger
                  onPress={() => setGroceryReminders(groceryReminders.filter((x) => x.id !== g.id))}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

export function GeneralReminderScreen() {
  const { theme, generalReminders, setGeneralReminders } = useApp();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('09:00');

  const save = async () => {
    if (!title.trim()) return Alert.alert('Title required');
    await setGeneralReminders([
      {
        id: uid(),
        title: title.trim(),
        date,
        time,
        repeat: 'once',
        days: [],
        done: false,
      },
      ...generalReminders,
    ]);
    setTitle('');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Call mom" />
          <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          <Field label="Time (HH:MM)" value={time} onChangeText={setTime} />
          <PrimaryButton title="+ Add Reminder" onPress={save} />
        </Card>
        {generalReminders.length === 0 ? (
          <EmptyState icon="🔔" title="No general reminders" />
        ) : (
          generalReminders.map((r) => (
            <Card key={r.id}>
              <Text style={{ color: theme.ink, fontWeight: '800' }}>{r.title}</Text>
              <Text style={{ color: theme.muted }}>
                {r.date} · {r.time}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <PrimaryButton
                  title={r.done ? '✓ Done' : 'Mark Done'}
                  onPress={() =>
                    setGeneralReminders(
                      generalReminders.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)),
                    )
                  }
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  title="Delete"
                  danger
                  onPress={() => setGeneralReminders(generalReminders.filter((x) => x.id !== r.id))}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
