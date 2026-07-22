import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useAlarms } from '../alarms/AlarmContext';
import { daysUntil } from '../alarms/engine';
import { GROCERY_CATEGORIES } from '../constants';
import { Card, EmptyState, Field, PrimaryButton, Screen } from '../components/ui';
import { DateField } from '../components/DateField';
import {
  ChipRow,
  HintBox,
  MED_SLOTS,
  ModeToggle,
  OffsetPicker,
  SectionLabel,
  WEEK_DAYS,
  offsetsLabel,
} from '../components/ReminderFormBits';
import { theme as pulse } from '../theme';
import { fmt, todayStr, uid } from '../utils';
import type { ExpenseReminder, GeneralReminder, GroceryReminder, MedReminder } from '../types';

function DueBadge({ date }: { date: string }) {
  const d = daysUntil(date);
  let label = '';
  let color = pulse.muted;
  if (d < 0) {
    label = `Overdue ${Math.abs(d)}d`;
    color = pulse.red;
  } else if (d === 0) {
    label = 'Today';
    color = pulse.red;
  } else if (d === 1) {
    label = 'Tomorrow';
    color = '#E5A100';
  } else if (d <= 3) {
    label = `${d}d left`;
    color = '#E5A100';
  } else {
    label = `${d}d left`;
    color = pulse.green;
  }
  return <Text style={{ color, fontWeight: '800', fontSize: 12, marginTop: 4 }}>{label}</Text>;
}

function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={pulse.muted}
      style={{
        borderWidth: 1.5,
        borderColor: pulse.line,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 11,
        marginBottom: 12,
        color: pulse.ink,
        backgroundColor: pulse.card,
        fontWeight: '600',
      }}
    />
  );
}

function ModeTag({ mode }: { mode: 'default' | 'custom' }) {
  return (
    <Text
      style={{
        marginTop: 4,
        fontSize: 11,
        fontWeight: '800',
        color: mode === 'custom' ? pulse.accent : pulse.muted,
      }}
    >
      {mode === 'custom' ? 'Custom timing' : 'Default timing'}
    </Text>
  );
}

/* ---------------- Expense ---------------- */
export function ExpenseReminderScreen() {
  const { theme, config, expenseReminders, setExpenseReminders } = useApp();
  const { syncAlarmIfType } = useAlarms();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayStr());
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customTime, setCustomTime] = useState(config.alertTime);
  const [offsets, setOffsets] = useState<number[]>(config.expenseOffsets);
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));

  const reset = () => {
    setEditingId(null);
    setName('');
    setAmount('');
    setDueDate(todayStr());
    setMode('default');
    setCustomTime(config.alertTime);
    setOffsets(config.expenseOffsets);
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const startEdit = (r: ExpenseReminder) => {
    setEditingId(r.id);
    setName(r.name);
    setAmount(String(r.amount || ''));
    setDueDate(r.dueDate);
    setMode(r.mode || 'default');
    setCustomTime(r.customTime || config.alertTime);
    setOffsets(r.offsets?.length ? r.offsets : config.expenseOffsets);
    setAlarmDurationSec(String(r.alarmDurationSec ?? config.alarmDurationSec));
  };

  const save = async () => {
    if (!name.trim() || !dueDate) {
      Alert.alert('Required', 'Enter a name and due date');
      return;
    }
    const payload: ExpenseReminder = {
      id: editingId || uid(),
      name: name.trim(),
      amount: parseFloat(amount) || 0,
      dueDate,
      paid: editingId
        ? expenseReminders.find((x) => x.id === editingId)?.paid || false
        : false,
      mode,
      offsets: mode === 'custom' ? (offsets.length ? offsets : config.expenseOffsets) : config.expenseOffsets,
      customTime: mode === 'custom' ? customTime || config.alertTime : undefined,
      alarmDurationSec:
        mode === 'custom' ? parseInt(alarmDurationSec, 10) || 0 : undefined,
    };
    if (editingId) {
      await setExpenseReminders(expenseReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setExpenseReminders([payload, ...expenseReminders]);
    }
    reset();
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenseReminders
      .filter((r) => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [expenseReminders, search]);

  const pending = expenseReminders.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Expense name" value={name} onChangeText={setName} placeholder="e.g. Rent" />
          <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <DateField label="Due date" value={dueDate} onChange={setDueDate} />

          <SectionLabel>Reminder timing</SectionLabel>
          <ModeToggle mode={mode} onChange={setMode} />
          {mode === 'default' ? (
            <HintBox>
              {`Uses admin schedule — alerts at ${config.alertTime} on: ${offsetsLabel(config.expenseOffsets)}.`}
            </HintBox>
          ) : (
            <>
              <Field label="Alert time (HH:MM)" value={customTime} onChangeText={setCustomTime} />
              <SectionLabel>Remind me</SectionLabel>
              <OffsetPicker selected={offsets} onChange={setOffsets} />
              <Field
                label="Alarm duration (seconds, 0 = until dismissed)"
                value={alarmDurationSec}
                onChangeText={setAlarmDurationSec}
                keyboardType="number-pad"
              />
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PrimaryButton
              title={editingId ? 'Update Reminder' : '+ Save Reminder'}
              onPress={save}
              style={{ flex: 1 }}
            />
            {editingId ? <PrimaryButton title="Cancel" danger onPress={reset} /> : null}
          </View>
        </Card>

        <SearchField value={search} onChangeText={setSearch} placeholder="Search expense reminders…" />
        <Text style={{ color: theme.muted, fontWeight: '700', marginBottom: 8 }}>
          Pending: {fmt(pending, config.currency)}
        </Text>

        {list.length === 0 ? (
          <EmptyState icon="💸" title={search ? 'No matching reminders' : 'No expense reminders'} />
        ) : (
          list.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.ink, fontWeight: '800' }}>{r.name}</Text>
                  <Text style={{ color: theme.muted }}>Due {r.dueDate}</Text>
                  <ModeTag mode={r.mode || 'default'} />
                  {!r.paid ? <DueBadge date={r.dueDate} /> : (
                    <Text style={{ color: pulse.green, fontWeight: '700', marginTop: 4 }}>Paid</Text>
                  )}
                </View>
                <Text style={{ color: theme.ink, fontWeight: '800' }}>
                  {fmt(r.amount, config.currency)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <PrimaryButton
                  title={r.paid ? '✓ Paid' : 'Mark as Paid'}
                  onPress={async () => {
                    await setExpenseReminders(
                      expenseReminders.map((x) => (x.id === r.id ? { ...x, paid: !x.paid } : x)),
                    );
                    syncAlarmIfType('expense', r.id);
                  }}
                  style={{ flex: 1, minWidth: 120 }}
                />
                <PrimaryButton title="Edit" onPress={() => startEdit(r)} />
                <PrimaryButton
                  title="Delete"
                  danger
                  onPress={() => {
                    setExpenseReminders(expenseReminders.filter((x) => x.id !== r.id));
                    if (editingId === r.id) reset();
                    syncAlarmIfType('expense', r.id);
                  }}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

/* ---------------- Medicine ---------------- */
export function MedicineReminderScreen() {
  const { theme, config, medReminders, setMedReminders } = useApp();
  const { syncAlarmIfType } = useAlarms();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
  const [days, setDays] = useState<string[]>([]);
  const [times, setTimes] = useState<string[]>(['Morning']);
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customTimes, setCustomTimes] = useState<Record<string, string>>({});
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));

  const reset = () => {
    setEditingId(null);
    setName('');
    setFrequency('daily');
    setDays([]);
    setTimes(['Morning']);
    setMode('default');
    setCustomTimes({});
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const toggleTime = (slot: string) => {
    setTimes((prev) => (prev.includes(slot) ? prev.filter((t) => t !== slot) : [...prev, slot]));
  };

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const startEdit = (m: MedReminder) => {
    setEditingId(m.id);
    setName(m.name);
    setFrequency(m.frequency);
    setDays(m.days || []);
    setTimes(m.times?.length ? m.times : ['Morning']);
    setMode(m.mode || 'default');
    setCustomTimes(m.customTimes || {});
    setAlarmDurationSec(String(m.alarmDurationSec ?? config.alarmDurationSec));
  };

  const save = async () => {
    if (!name.trim() || times.length === 0) {
      Alert.alert('Required', 'Enter a name and select at least one time');
      return;
    }
    if (frequency === 'weekly' && days.length === 0) {
      Alert.alert('Required', 'Select at least one day for weekly');
      return;
    }
    const builtCustom: Record<string, string> = {};
    if (mode === 'custom') {
      times.forEach((slot) => {
        builtCustom[slot] =
          customTimes[slot] ||
          config.medicineTimes[slot as keyof typeof config.medicineTimes] ||
          '08:00';
      });
    }
    const payload: MedReminder = {
      id: editingId || uid(),
      name: name.trim(),
      frequency,
      days: frequency === 'weekly' ? days : [],
      times,
      customTimes: builtCustom,
      done: editingId ? medReminders.find((x) => x.id === editingId)?.done || {} : {},
      mode,
      alarmDurationSec: mode === 'custom' ? parseInt(alarmDurationSec, 10) || 0 : undefined,
    };
    if (editingId) {
      await setMedReminders(medReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setMedReminders([payload, ...medReminders]);
    }
    reset();
  };

  const markDone = async (id: string, slot: string) => {
    const day = todayStr();
    await setMedReminders(
      medReminders.map((m) => {
        if (m.id !== id) return m;
        const done = { ...(m.done || {}) };
        const dayMap = { ...(done[day] || {}) };
        dayMap[slot] = !dayMap[slot];
        done[day] = dayMap;
        return { ...m, done };
      }),
    );
    syncAlarmIfType('medicine', id);
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return medReminders.filter((m) => !term || m.name.toLowerCase().includes(term));
  }, [medReminders, search]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Vitamin D" />

          <SectionLabel>Frequency</SectionLabel>
          <ChipRow
            options={['daily', 'weekly']}
            selected={[frequency]}
            multi={false}
            onToggle={(v) => setFrequency(v as 'daily' | 'weekly')}
          />
          {frequency === 'weekly' ? (
            <>
              <SectionLabel>Select days</SectionLabel>
              <ChipRow options={[...WEEK_DAYS]} selected={days} onToggle={toggleDay} />
            </>
          ) : null}

          <SectionLabel>Times</SectionLabel>
          <ChipRow options={[...MED_SLOTS]} selected={times} onToggle={toggleTime} />

          <SectionLabel>Reminder timing</SectionLabel>
          <ModeToggle mode={mode} onChange={setMode} />
          {mode === 'default' ? (
            <HintBox>
              {`Uses admin times — Morning ${config.medicineTimes.Morning}, Afternoon ${config.medicineTimes.Afternoon}, Evening ${config.medicineTimes.Evening}.`}
            </HintBox>
          ) : (
            <>
              {times.length === 0 ? (
                <HintBox>Select at least one time above to set a custom clock time.</HintBox>
              ) : (
                times.map((slot) => (
                  <Field
                    key={slot}
                    label={`${slot} time (HH:MM)`}
                    value={
                      customTimes[slot] ||
                      config.medicineTimes[slot as keyof typeof config.medicineTimes] ||
                      '08:00'
                    }
                    onChangeText={(t) => setCustomTimes((prev) => ({ ...prev, [slot]: t }))}
                  />
                ))
              )}
              <Field
                label="Alarm duration (seconds, 0 = until dismissed)"
                value={alarmDurationSec}
                onChangeText={setAlarmDurationSec}
                keyboardType="number-pad"
              />
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PrimaryButton
              title={editingId ? 'Update Medicine' : '+ Add Medicine'}
              onPress={save}
              style={{ flex: 1 }}
            />
            {editingId ? <PrimaryButton title="Cancel" danger onPress={reset} /> : null}
          </View>
        </Card>

        <SearchField value={search} onChangeText={setSearch} placeholder="Search medicines…" />

        {list.length === 0 ? (
          <EmptyState icon="💊" title={search ? 'No matching medicines' : 'No medicines added'} />
        ) : (
          list.map((m) => {
            const doneToday = m.done?.[todayStr()] || {};
            return (
              <Card key={m.id}>
                <Text style={{ color: theme.ink, fontWeight: '800', fontSize: 16 }}>{m.name}</Text>
                <Text style={{ color: theme.muted, marginTop: 2 }}>
                  {m.frequency === 'weekly' ? `Weekly · ${m.days.join(', ')}` : 'Daily'}
                </Text>
                <ModeTag mode={m.mode || 'default'} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {m.times.map((t) => {
                    const label =
                      m.mode === 'custom' && m.customTimes?.[t] ? `${t} (${m.customTimes[t]})` : t;
                    return (
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
                        <Text style={{ fontWeight: '700' }}>{doneToday[t] ? `✓ ${label}` : label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <PrimaryButton title="Edit" onPress={() => startEdit(m)} style={{ flex: 1 }} />
                  <PrimaryButton
                    title="Delete"
                    danger
                    onPress={() => {
                      setMedReminders(medReminders.filter((x) => x.id !== m.id));
                      if (editingId === m.id) reset();
                      syncAlarmIfType('medicine', m.id);
                    }}
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

/* ---------------- Grocery ---------------- */
export function GroceryReminderScreen() {
  const { theme, config, groceryReminders, setGroceryReminders } = useApp();
  const { syncAlarmIfType } = useAlarms();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<'list' | 'category' | 'item' | 'details'>('list');
  const [category, setCategory] = useState('');
  const [item, setItem] = useState('');
  const [icon, setIcon] = useState('🛒');
  const [customName, setCustomName] = useState('');
  const [expiryDate, setExpiryDate] = useState(todayStr());
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customTime, setCustomTime] = useState(config.alertTime);
  const [offsets, setOffsets] = useState<number[]>(config.groceryOffsets);
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));

  const resetForm = () => {
    setEditingId(null);
    setStep('list');
    setCategory('');
    setItem('');
    setIcon('🛒');
    setCustomName('');
    setExpiryDate(todayStr());
    setQuantity('');
    setNote('');
    setMode('default');
    setCustomTime(config.alertTime);
    setOffsets(config.groceryOffsets);
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const startAdd = () => {
    resetForm();
    setStep('category');
  };

  const startEdit = (g: GroceryReminder) => {
    setEditingId(g.id);
    setCategory(g.category);
    setItem(g.item);
    setIcon(g.icon || '🛒');
    setExpiryDate(g.expiryDate);
    setQuantity(g.quantity || '');
    setNote(g.note || '');
    setMode(g.mode || 'default');
    setCustomTime(g.customTime || config.alertTime);
    setOffsets(g.offsets?.length ? g.offsets : config.groceryOffsets);
    setAlarmDurationSec(String(g.alarmDurationSec ?? config.alarmDurationSec));
    setStep('details');
  };

  const save = async () => {
    const finalItem = item.trim() || customName.trim();
    if (!finalItem || !expiryDate || !category) {
      Alert.alert('Required', 'Pick category, item and expiry date');
      return;
    }
    const payload: GroceryReminder = {
      id: editingId || uid(),
      category,
      item: finalItem,
      icon,
      expiryDate,
      quantity: quantity.trim() || undefined,
      note: note.trim() || undefined,
      mode,
      offsets: mode === 'custom' ? (offsets.length ? offsets : config.groceryOffsets) : config.groceryOffsets,
      customTime: mode === 'custom' ? customTime || config.alertTime : undefined,
      alarmDurationSec: mode === 'custom' ? parseInt(alarmDurationSec, 10) || 0 : undefined,
    };
    if (editingId) {
      await setGroceryReminders(groceryReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setGroceryReminders([payload, ...groceryReminders]);
    }
    resetForm();
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groceryReminders
      .filter(
        (g) =>
          !term ||
          g.item.toLowerCase().includes(term) ||
          g.category.toLowerCase().includes(term),
      )
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }, [groceryReminders, search]);

  const groups = useMemo(() => {
    const expired: GroceryReminder[] = [];
    const soon: GroceryReminder[] = [];
    const fresh: GroceryReminder[] = [];
    list.forEach((g) => {
      const d = daysUntil(g.expiryDate);
      if (d < 0) expired.push(g);
      else if (d <= 3) soon.push(g);
      else fresh.push(g);
    });
    return { expired, soon, fresh };
  }, [list]);

  const cat = GROCERY_CATEGORIES.find((c) => c.name === category);

  if (step !== 'list') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => (step === 'category' ? resetForm() : setStep(step === 'details' ? (editingId ? 'list' : 'item') : 'category'))}>
            <Text style={{ color: pulse.header, fontWeight: '800', marginBottom: 12 }}>‹ Back</Text>
          </Pressable>

          {step === 'category' ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 12, color: theme.ink }}>
                Select category
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {GROCERY_CATEGORIES.map((c) => (
                  <Pressable
                    key={c.name}
                    onPress={() => {
                      setCategory(c.name);
                      setStep('item');
                    }}
                    style={{
                      width: '47%',
                      backgroundColor: pulse.bg,
                      borderRadius: 14,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: pulse.line,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{c.icon}</Text>
                    <Text style={{ fontWeight: '800', marginTop: 6, color: theme.ink }}>{c.name}</Text>
                    <Text style={{ color: theme.muted, fontSize: 11 }}>{c.items.length} items</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setCategory('Others');
                    setIcon('🥡');
                    setItem('');
                    setStep('details');
                  }}
                  style={{
                    width: '47%',
                    backgroundColor: pulse.bg,
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: pulse.line,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 28 }}>🥡</Text>
                  <Text style={{ fontWeight: '800', marginTop: 6, color: theme.ink }}>Others</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>custom item</Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          {step === 'item' && cat ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 18, marginBottom: 12, color: theme.ink }}>
                {cat.name}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {cat.items.map((it) => (
                  <Pressable
                    key={it.name}
                    onPress={() => {
                      setItem(it.name);
                      setIcon(it.icon);
                      setStep('details');
                    }}
                    style={{
                      width: '30%',
                      alignItems: 'center',
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: pulse.bg,
                      borderWidth: 1,
                      borderColor: pulse.line,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{it.icon}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4, textAlign: 'center' }}>
                      {it.name}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setItem('');
                    setIcon('➕');
                    setStep('details');
                  }}
                  style={{
                    width: '30%',
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 12,
                    backgroundColor: pulse.bg,
                    borderWidth: 1,
                    borderColor: pulse.line,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>➕</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4 }}>Others</Text>
                </Pressable>
              </View>
            </Card>
          ) : null}

          {step === 'details' ? (
            <Card>
              <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink, marginBottom: 4 }}>
                {icon} {item || 'Custom item'} · {category}
              </Text>
              {!item ? (
                <Field
                  label="Item name"
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder="Enter item name"
                />
              ) : null}
              <DateField label="Expiry date" value={expiryDate} onChange={setExpiryDate} />
              <Field label="Quantity (optional)" value={quantity} onChangeText={setQuantity} placeholder="e.g. 2 kg" />
              <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Add a note" />

              <SectionLabel>Reminder timing</SectionLabel>
              <ModeToggle mode={mode} onChange={setMode} />
              {mode === 'default' ? (
                <HintBox>
                  {`Uses admin schedule — alerts at ${config.alertTime} on: ${offsetsLabel(config.groceryOffsets, 'Expiry day')}.`}
                </HintBox>
              ) : (
                <>
                  <Field label="Alert time (HH:MM)" value={customTime} onChangeText={setCustomTime} />
                  <SectionLabel>Remind me</SectionLabel>
                  <OffsetPicker selected={offsets} onChange={setOffsets} forExpiry />
                  <Field
                    label="Alarm duration (seconds, 0 = until dismissed)"
                    value={alarmDurationSec}
                    onChangeText={setAlarmDurationSec}
                    keyboardType="number-pad"
                  />
                </>
              )}
              <PrimaryButton title={editingId ? 'Update Item' : 'Save Item'} onPress={save} />
            </Card>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  const renderGroup = (title: string, items: GroceryReminder[]) => {
    if (!items.length) return null;
    return (
      <View key={title} style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: '800', color: theme.ink, marginBottom: 8 }}>
          {title} ({items.length})
        </Text>
        {items.map((g) => (
          <Card key={g.id}>
            <Pressable onPress={() => startEdit(g)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
                  <Text style={{ fontSize: 28 }}>{g.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.ink, fontWeight: '800' }}>{g.item}</Text>
                    <Text style={{ color: theme.muted }}>
                      {g.category}
                      {g.quantity ? ` · ${g.quantity}` : ''}
                    </Text>
                    <ModeTag mode={g.mode || 'default'} />
                    <DueBadge date={g.expiryDate} />
                  </View>
                </View>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <PrimaryButton title="Edit" onPress={() => startEdit(g)} style={{ flex: 1 }} />
              <PrimaryButton
                title="Delete"
                danger
                onPress={() => {
                  setGroceryReminders(groceryReminders.filter((x) => x.id !== g.id));
                  syncAlarmIfType('grocery', g.id);
                }}
              />
            </View>
          </Card>
        ))}
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <PrimaryButton title="+ Add Grocery Item" onPress={startAdd} />
        <View style={{ height: 12 }} />
        <SearchField value={search} onChangeText={setSearch} placeholder="Search grocery items…" />
        {list.length === 0 ? (
          <EmptyState icon="🥬" title={search ? 'No matching items' : 'No grocery expiry items'} />
        ) : (
          <>
            {renderGroup('Expired', groups.expired)}
            {renderGroup('Expiring Soon', groups.soon)}
            {renderGroup('Fresh', groups.fresh)}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ---------------- General ---------------- */
export function GeneralReminderScreen() {
  const { theme, config, generalReminders, setGeneralReminders } = useApp();
  const { syncAlarmIfType } = useAlarms();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState('08:00');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekly'>('once');
  const [days, setDays] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [alarmDurationSec, setAlarmDurationSec] = useState(String(config.alarmDurationSec));

  const reset = () => {
    setEditingId(null);
    setTitle('');
    setDate(todayStr());
    setTime('08:00');
    setRepeat('once');
    setDays([]);
    setNote('');
    setAlarmDurationSec(String(config.alarmDurationSec));
  };

  const startEdit = (r: GeneralReminder) => {
    setEditingId(r.id);
    setTitle(r.title);
    setDate(r.date);
    setTime(r.time);
    setRepeat(r.repeat);
    setDays(r.days || []);
    setNote(r.note || '');
    setAlarmDurationSec(String(r.alarmDurationSec ?? config.alarmDurationSec));
  };

  const save = async () => {
    if (!title.trim() || !date || !time) {
      Alert.alert('Required', 'Enter title, date and time');
      return;
    }
    if (repeat === 'weekly' && days.length === 0) {
      Alert.alert('Required', 'Select at least one day for weekly');
      return;
    }
    const payload: GeneralReminder = {
      id: editingId || uid(),
      title: title.trim(),
      date,
      time,
      repeat,
      days: repeat === 'weekly' ? days : [],
      note: note.trim() || undefined,
      done: editingId ? generalReminders.find((x) => x.id === editingId)?.done || false : false,
      doneDate: editingId ? generalReminders.find((x) => x.id === editingId)?.doneDate : undefined,
      alarmDurationSec: parseInt(alarmDurationSec, 10) || 0,
    };
    if (editingId) {
      await setGeneralReminders(generalReminders.map((x) => (x.id === editingId ? payload : x)));
    } else {
      await setGeneralReminders([payload, ...generalReminders]);
    }
    reset();
  };

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return generalReminders
      .filter((r) => !term || r.title.toLowerCase().includes(term))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }, [generalReminders, search]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Wake up, Team meeting" />
          <DateField label="Date" value={date} onChange={setDate} />
          <Field label="Time (HH:MM)" value={time} onChangeText={setTime} />

          <SectionLabel>Repeat</SectionLabel>
          <ChipRow
            options={['once', 'daily', 'weekly']}
            selected={[repeat]}
            multi={false}
            onToggle={(v) => setRepeat(v as 'once' | 'daily' | 'weekly')}
          />
          {repeat === 'weekly' ? (
            <>
              <SectionLabel>Select days</SectionLabel>
              <ChipRow
                options={[...WEEK_DAYS]}
                selected={days}
                onToggle={(d) =>
                  setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
                }
              />
            </>
          ) : null}

          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Any extra detail" />
          <Field
            label="Alarm duration (seconds, 0 = until dismissed)"
            value={alarmDurationSec}
            onChangeText={setAlarmDurationSec}
            keyboardType="number-pad"
          />

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <PrimaryButton
              title={editingId ? 'Update Reminder' : '+ Save Reminder'}
              onPress={save}
              style={{ flex: 1 }}
            />
            {editingId ? <PrimaryButton title="Cancel" danger onPress={reset} /> : null}
          </View>
        </Card>

        <SearchField value={search} onChangeText={setSearch} placeholder="Search reminders…" />

        {list.length === 0 ? (
          <EmptyState icon="🔔" title={search ? 'No matching reminders' : 'No general reminders'} />
        ) : (
          list.map((r) => {
            const repeatLabel =
              r.repeat === 'once'
                ? r.date
                : r.repeat === 'daily'
                  ? 'Every day'
                  : `Weekly · ${r.days.join(', ')}`;
            return (
              <Card key={r.id}>
                <Text style={{ color: theme.ink, fontWeight: '800' }}>{r.title}</Text>
                <Text style={{ color: theme.muted }}>
                  {repeatLabel} at {r.time}
                  {r.note ? ` · ${r.note}` : ''}
                </Text>
                {!r.done ? <DueBadge date={r.date} /> : (
                  <Text style={{ color: pulse.green, fontWeight: '700', marginTop: 4 }}>Done</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <PrimaryButton
                    title={r.done ? '✓ Done' : 'Mark Done'}
                    onPress={async () => {
                      await setGeneralReminders(
                        generalReminders.map((x) =>
                          x.id === r.id
                            ? { ...x, done: !x.done, doneDate: todayStr() }
                            : x,
                        ),
                      );
                      syncAlarmIfType('general', r.id);
                    }}
                    style={{ flex: 1, minWidth: 110 }}
                  />
                  <PrimaryButton title="Edit" onPress={() => startEdit(r)} />
                  <PrimaryButton
                    title="Delete"
                    danger
                    onPress={() => {
                      setGeneralReminders(generalReminders.filter((x) => x.id !== r.id));
                      if (editingId === r.id) reset();
                      syncAlarmIfType('general', r.id);
                    }}
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
