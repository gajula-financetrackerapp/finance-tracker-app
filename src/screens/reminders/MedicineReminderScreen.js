import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const RING_DURATIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
];

const DEFAULT_SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
];

const MAX_CUSTOM_TIMES = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function parseTimeToDate(timeStr) {
  const [h, m] = (timeStr || '08:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function slotTimeFromConfig(slotKey, medicineTimes) {
  return medicineTimes?.[slotKey] || (slotKey === 'morning' ? '08:00' : slotKey === 'afternoon' ? '13:00' : '19:00');
}

// ─── Picker Modal ─────────────────────────────────────────────────────────────

function PickerModal({ visible, mode, value, onDone, onClose, theme }) {
  const [localVal, setLocalVal] = useState(value);

  React.useEffect(() => {
    if (visible) setLocalVal(value);
  }, [visible, value]);

  const styles = pickerStyles(theme);

  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={localVal}
        mode={mode}
        display="default"
        onChange={(e, date) => {
          if (e.type === 'dismissed') { onClose(); return; }
          if (date) onDone(date);
        }}
      />
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.sheetAction, { color: theme.muted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>{mode === 'date' ? 'Pick Date' : 'Pick Time'}</Text>
            <TouchableOpacity onPress={() => onDone(localVal)}>
              <Text style={[styles.sheetAction, { color: theme.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={localVal}
            mode={mode}
            display="spinner"
            onChange={(e, date) => { if (date) setLocalVal(date); }}
            style={{ width: '100%' }}
          />
        </View>
      </View>
    </Modal>
  );
}

function pickerStyles(theme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.overlay,
    },
    sheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 30,
    },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.ink,
    },
    sheetAction: {
      fontSize: 15,
      fontWeight: '500',
    },
  });
}

// ─── Medicine Form Modal ──────────────────────────────────────────────────────

function MedicineFormModal({ visible, editItem, onClose, theme, config }) {
  const { addMedReminder, editMedReminder } = useAppContext();

  // Form state
  const [formName, setFormName] = useState('');
  const [formFrequency, setFormFrequency] = useState('daily'); // 'daily' | 'weekly'
  const [formDays, setFormDays] = useState([]); // for weekly
  const [formStartDate, setFormStartDate] = useState(new Date());
  const [formEndDate, setFormEndDate] = useState(null);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [formMode, setFormMode] = useState('default');
  // Default slots selected
  const [formSlots, setFormSlots] = useState(['morning', 'afternoon', 'evening']);
  // Custom times (array of "HH:MM" strings)
  const [formCustomTimes, setFormCustomTimes] = useState(['08:00']);
  const [formRingDuration, setFormRingDuration] = useState(30);
  const [saving, setSaving] = useState(false);

  // Picker state
  const [picker, setPicker] = useState({ visible: false, mode: 'time', field: '' });
  const [customTimePickerIndex, setCustomTimePickerIndex] = useState(null);

  React.useEffect(() => {
    if (visible) {
      if (editItem) {
        setFormName(editItem.name || '');
        setFormFrequency(editItem.frequency || 'daily');
        setFormDays(editItem.days || []);
        setFormStartDate(editItem.startDate ? new Date(editItem.startDate) : new Date());
        const endD = editItem.endDate ? new Date(editItem.endDate) : null;
        setFormEndDate(endD);
        setHasEndDate(!!endD);
        setFormMode(editItem.mode || 'default');
        setFormSlots(editItem.slots || ['morning', 'afternoon', 'evening']);
        setFormCustomTimes(editItem.customTimes?.length ? editItem.customTimes : ['08:00']);
        setFormRingDuration(editItem.ringDuration || 30);
      } else {
        setFormName('');
        setFormFrequency('daily');
        setFormDays([]);
        setFormStartDate(new Date());
        setFormEndDate(null);
        setHasEndDate(false);
        setFormMode('default');
        setFormSlots(['morning', 'afternoon', 'evening']);
        setFormCustomTimes(['08:00']);
        setFormRingDuration(30);
      }
    }
  }, [visible, editItem]);

  function toggleDay(day) {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function toggleSlot(slotKey) {
    setFormSlots((prev) =>
      prev.includes(slotKey) ? prev.filter((s) => s !== slotKey) : [...prev, slotKey]
    );
  }

  function openDatePicker(field) {
    setPicker({ visible: true, mode: 'date', field });
  }

  function openCustomTimePicker(index) {
    setCustomTimePickerIndex(index);
    setPicker({ visible: true, mode: 'time', field: 'customTime' });
  }

  function onPickerDone(date) {
    const f = picker.field;
    setPicker((p) => ({ ...p, visible: false }));
    if (f === 'startDate') {
      setFormStartDate(date);
    } else if (f === 'endDate') {
      setFormEndDate(date);
    } else if (f === 'customTime' && customTimePickerIndex !== null) {
      const updated = [...formCustomTimes];
      updated[customTimePickerIndex] = formatTime(date);
      setFormCustomTimes(updated);
      setCustomTimePickerIndex(null);
    }
  }

  function addCustomTime() {
    if (formCustomTimes.length < MAX_CUSTOM_TIMES) {
      setFormCustomTimes((prev) => [...prev, '08:00']);
    }
  }

  function removeCustomTime(index) {
    if (formCustomTimes.length > 1) {
      setFormCustomTimes((prev) => prev.filter((_, i) => i !== index));
    }
  }

  async function handleSave() {
    if (!formName.trim()) {
      Alert.alert('Required', 'Please enter a medicine name.');
      return;
    }
    if (formFrequency === 'weekly' && formDays.length === 0) {
      Alert.alert('Required', 'Please select at least one day for weekly frequency.');
      return;
    }
    if (formMode === 'default' && formSlots.length === 0) {
      Alert.alert('Required', 'Please select at least one time slot.');
      return;
    }

    setSaving(true);
    const payload = {
      name: formName.trim(),
      frequency: formFrequency,
      days: formFrequency === 'weekly' ? formDays : [],
      slots: formMode === 'default' ? formSlots : [],
      startDate: formStartDate.toISOString().split('T')[0],
      endDate: hasEndDate && formEndDate ? formEndDate.toISOString().split('T')[0] : null,
      mode: formMode,
      customTimes: formMode === 'custom' ? formCustomTimes : [],
      ringDuration: formMode === 'custom' ? formRingDuration : 30,
    };

    if (editItem) {
      await editMedReminder(editItem.id, payload);
    } else {
      await addMedReminder(payload);
    }
    setSaving(false);
    onClose();
  }

  const styles = formStyles(theme);
  const medicineTimes = config.medicineTimes || { morning: '08:00', afternoon: '13:00', evening: '19:00' };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={theme.ink} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editItem ? 'Edit Medicine' : 'Add Medicine'}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Reminder Mode Toggle */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeTab, formMode === 'default' && { backgroundColor: theme.primary }]}
              onPress={() => setFormMode('default')}
            >
              <Text style={[styles.modeTabText, formMode === 'default' && { color: theme.buttonText, fontWeight: '700' }]}>
                Default
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, formMode === 'custom' && { backgroundColor: theme.primary }]}
              onPress={() => setFormMode('custom')}
            >
              <Text style={[styles.modeTabText, formMode === 'custom' && { color: theme.buttonText, fontWeight: '700' }]}>
                Customize
              </Text>
            </TouchableOpacity>
          </View>

          {/* Medicine Name */}
          <Text style={styles.fieldLabel}>Medicine Name</Text>
          <TextInput
            style={styles.input}
            value={formName}
            onChangeText={setFormName}
            placeholder="e.g. Metformin 500mg"
            placeholderTextColor={theme.placeholderText}
          />

          {/* Frequency */}
          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.segmentRow}>
            {['daily', 'weekly'].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.segmentBtn, formFrequency === f && { backgroundColor: theme.primary }]}
                onPress={() => setFormFrequency(f)}
              >
                <Text style={[styles.segmentText, formFrequency === f && { color: theme.buttonText, fontWeight: '700' }]}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Day selector (weekly) */}
          {formFrequency === 'weekly' && (
            <>
              <Text style={styles.fieldLabel}>Days</Text>
              <View style={styles.dayRow}>
                {DAYS_OF_WEEK.map((day) => {
                  const selected = formDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[styles.dayChip, selected && { backgroundColor: theme.primary }]}
                      onPress={() => toggleDay(day)}
                    >
                      <Text style={[styles.dayChipText, selected && { color: theme.buttonText }]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Start Date */}
          <Text style={styles.fieldLabel}>Start Date</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => openDatePicker('startDate')}>
            <Ionicons name="calendar-outline" size={18} color={theme.primary} />
            <Text style={styles.dateBtnText}>{formatDate(formStartDate.toISOString())}</Text>
          </TouchableOpacity>

          {/* End Date */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Set End Date</Text>
            <TouchableOpacity
              style={[styles.toggle, { backgroundColor: hasEndDate ? theme.toggleOn : theme.toggleOff }]}
              onPress={() => setHasEndDate((v) => !v)}
            >
              <View style={[styles.toggleThumb, hasEndDate && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
          {hasEndDate && (
            <TouchableOpacity style={styles.dateBtn} onPress={() => openDatePicker('endDate')}>
              <Ionicons name="calendar-outline" size={18} color={theme.primary} />
              <Text style={styles.dateBtnText}>
                {formEndDate ? formatDate(formEndDate.toISOString()) : 'Pick end date'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Time Slots — Default mode */}
          {formMode === 'default' && (
            <>
              <Text style={styles.fieldLabel}>Reminder Slots</Text>
              {DEFAULT_SLOTS.map((slot) => {
                const checked = formSlots.includes(slot.key);
                const slotTime = slotTimeFromConfig(slot.key, medicineTimes);
                return (
                  <TouchableOpacity
                    key={slot.key}
                    style={[styles.slotRow, checked && { borderColor: theme.primary }]}
                    onPress={() => toggleSlot(slot.key)}
                  >
                    <View style={[styles.checkbox, checked && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                      {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <View style={styles.slotInfo}>
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      <Text style={styles.slotTime}>{slotTime}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* Custom mode */}
          {formMode === 'custom' && (
            <>
              <Text style={styles.fieldLabel}>Custom Times</Text>
              {formCustomTimes.map((t, i) => (
                <View key={i} style={styles.customTimeRow}>
                  <TouchableOpacity
                    style={[styles.dateBtn, styles.flex]}
                    onPress={() => openCustomTimePicker(i)}
                  >
                    <Ionicons name="time-outline" size={18} color={theme.primary} />
                    <Text style={styles.dateBtnText}>{t}</Text>
                  </TouchableOpacity>
                  {formCustomTimes.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeCustomTime(i)}
                    >
                      <Ionicons name="close-circle" size={22} color={theme.red} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {formCustomTimes.length < MAX_CUSTOM_TIMES && (
                <TouchableOpacity style={styles.addTimeBtn} onPress={addCustomTime}>
                  <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                  <Text style={[styles.addTimeBtnText, { color: theme.primary }]}>Add Time</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.fieldLabel}>Ring Duration</Text>
              <View style={styles.durationRow}>
                {RING_DURATIONS.map((rd) => (
                  <TouchableOpacity
                    key={rd.value}
                    style={[styles.durationChip, formRingDuration === rd.value && { backgroundColor: theme.primary }]}
                    onPress={() => setFormRingDuration(rd.value)}
                  >
                    <Text style={[styles.durationText, formRingDuration === rd.value && { color: theme.buttonText }]}>
                      {rd.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={theme.buttonText} />
              : <Text style={styles.saveBtnText}>{editItem ? 'Save Changes' : 'Add Medicine'}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal
        visible={picker.visible}
        mode={picker.mode}
        value={
          picker.field === 'endDate' ? (formEndDate || new Date())
          : picker.field === 'customTime' && customTimePickerIndex !== null
            ? parseTimeToDate(formCustomTimes[customTimePickerIndex] || '08:00')
          : formStartDate
        }
        onDone={onPickerDone}
        onClose={() => setPicker((p) => ({ ...p, visible: false }))}
        theme={theme}
      />
    </Modal>
  );
}

// ─── Medicine List Item ───────────────────────────────────────────────────────

function MedicineItem({ item, theme, config, onEdit, onDelete, onToggleTaken, styles }) {
  const today = todayStr();
  const takenToday = item.takenStatus?.[today] || {};
  const medicineTimes = config.medicineTimes || { morning: '08:00', afternoon: '13:00', evening: '19:00' };

  const displaySlots = item.mode === 'custom'
    ? (item.customTimes || []).map((t, i) => ({ key: `custom_${i}`, label: t, time: t }))
    : (item.slots || []).map((s) => ({
        key: s,
        label: DEFAULT_SLOTS.find((ds) => ds.key === s)?.label || s,
        time: slotTimeFromConfig(s, medicineTimes),
      }));

  const totalSlots = displaySlots.length;
  const takenCount = displaySlots.filter((s) => takenToday[s.key]).length;

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleRow}>
          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.freqBadge, { backgroundColor: theme.purpleLight }]}>
            <Text style={[styles.freqText, { color: theme.purple }]}>
              {item.frequency === 'weekly' && item.days?.length
                ? item.days.join(', ')
                : 'Daily'}
            </Text>
          </View>
        </View>
        <View style={styles.itemActions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.blueLight }]} onPress={onEdit}>
            <Ionicons name="pencil" size={14} color={theme.blue} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.redLight }]} onPress={onDelete}>
            <Ionicons name="trash" size={14} color={theme.red} />
          </TouchableOpacity>
        </View>
      </View>

      {item.startDate && (
        <Text style={styles.itemMeta}>
          {formatDate(item.startDate)}{item.endDate ? ` → ${formatDate(item.endDate)}` : ''}
        </Text>
      )}

      {/* Today's taken status */}
      <View style={styles.slotSection}>
        <Text style={styles.slotSectionLabel}>
          Today — {takenCount}/{totalSlots} taken
        </Text>
        <View style={styles.slotChips}>
          {displaySlots.map((slot) => {
            const taken = !!takenToday[slot.key];
            return (
              <TouchableOpacity
                key={slot.key}
                style={[
                  styles.slotChip,
                  taken
                    ? { backgroundColor: theme.green, borderColor: theme.green }
                    : { backgroundColor: theme.inputBg, borderColor: theme.line },
                ]}
                onPress={() => onToggleTaken(slot.key, taken)}
              >
                <Text style={[styles.slotChipText, { color: taken ? '#fff' : theme.muted }]}>
                  {taken ? '✓ ' : ''}{slot.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MedicineReminderScreen() {
  const { config, medReminders, editMedReminder, removeMedReminder } = useAppContext();
  const theme = getTheme(config.theme);
  const styles = makeStyles(theme);

  const [modalVisible, setModalVisible] = useState(false);
  const [editItem, setEditItem] = useState(null);

  function openAdd() {
    setEditItem(null);
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setModalVisible(true);
  }

  function confirmDelete(item) {
    Alert.alert(
      'Delete Medicine',
      `Remove "${item.name}"? This will cancel all scheduled reminders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeMedReminder(item.id),
        },
      ]
    );
  }

  async function handleToggleTaken(medicine, slotKey, currentValue) {
    const today = todayStr();
    const currentStatus = medicine.takenStatus || {};
    const todayStatus = currentStatus[today] || {};
    const newStatus = {
      ...currentStatus,
      [today]: { ...todayStatus, [slotKey]: !currentValue },
    };
    await editMedReminder(medicine.id, { takenStatus: newStatus });
  }

  const today = todayStr();
  const takenAllCount = medReminders.filter((m) => {
    const ts = m.takenStatus?.[today] || {};
    const slots = m.mode === 'custom'
      ? (m.customTimes || []).map((_, i) => `custom_${i}`)
      : (m.slots || []);
    return slots.length > 0 && slots.every((s) => ts[s]);
  }).length;

  const renderItem = useCallback(
    ({ item }) => (
      <MedicineItem
        item={item}
        theme={theme}
        config={config}
        styles={styles}
        onEdit={() => openEdit(item)}
        onDelete={() => confirmDelete(item)}
        onToggleTaken={(slotKey, currentValue) => handleToggleTaken(item, slotKey, currentValue)}
      />
    ),
    [theme, config]
  );

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={theme.statusBar === 'dark' ? 'dark-content' : 'light-content'}
        backgroundColor={theme.headerBg}
      />

      {/* Summary */}
      <View style={styles.summaryBanner}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNum}>{medReminders.length}</Text>
          <Text style={styles.summaryLabel}>Medicines</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: theme.green }]}>{takenAllCount}</Text>
          <Text style={styles.summaryLabel}>All taken today</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: theme.orange }]}>
            {medReminders.length - takenAllCount}
          </Text>
          <Text style={styles.summaryLabel}>Pending today</Text>
        </View>
      </View>

      {medReminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>💊</Text>
          <Text style={styles.emptyTitle}>No medicines yet</Text>
          <Text style={styles.emptySubtitle}>Tap + to add a medicine reminder</Text>
        </View>
      ) : (
        <FlatList
          data={medReminders}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={theme.buttonText} />
      </TouchableOpacity>

      <MedicineFormModal
        visible={modalVisible}
        editItem={editItem}
        onClose={() => setModalVisible(false)}
        theme={theme}
        config={config}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    summaryBanner: {
      flexDirection: 'row',
      backgroundColor: theme.card,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    summaryItem: {
      flex: 1,
      alignItems: 'center',
    },
    summaryNum: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.ink,
    },
    summaryLabel: {
      fontSize: 11,
      color: theme.muted,
      marginTop: 2,
      textAlign: 'center',
    },
    summaryDivider: {
      width: 1,
      backgroundColor: theme.line,
      marginVertical: 4,
    },
    listContent: {
      padding: 16,
      paddingBottom: 100,
    },
    itemCard: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 2,
    },
    itemHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 4,
    },
    itemTitleRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    itemName: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.ink,
    },
    freqBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    freqText: {
      fontSize: 11,
      fontWeight: '600',
    },
    itemActions: {
      flexDirection: 'row',
      gap: 6,
      marginLeft: 8,
    },
    actionBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemMeta: {
      fontSize: 12,
      color: theme.muted,
      marginBottom: 10,
    },
    slotSection: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.line,
    },
    slotSectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.muted,
      marginBottom: 8,
    },
    slotChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    slotChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1.5,
    },
    slotChipText: {
      fontSize: 13,
      fontWeight: '500',
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    },
    emptyEmoji: {
      fontSize: 52,
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.ink,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.muted,
      textAlign: 'center',
    },
    fab: {
      position: 'absolute',
      bottom: 24,
      right: 24,
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 6,
    },
  });
}

function formStyles(theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: theme.card,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.ink,
    },
    formContent: {
      padding: 20,
      paddingBottom: 40,
    },
    modeToggleRow: {
      flexDirection: 'row',
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      padding: 3,
      marginBottom: 16,
    },
    modeTab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    modeTabText: {
      fontSize: 14,
      color: theme.muted,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.muted,
      marginBottom: 6,
      marginTop: 14,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: theme.inputText,
    },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: theme.inputBg,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 8,
      alignItems: 'center',
    },
    segmentText: {
      fontSize: 14,
      color: theme.muted,
    },
    dayRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    dayChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
    },
    dayChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.ink,
    },
    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    dateBtnText: {
      fontSize: 15,
      color: theme.inputText,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      marginBottom: 8,
    },
    switchLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.ink,
    },
    toggle: {
      width: 46,
      height: 26,
      borderRadius: 13,
      padding: 2,
    },
    toggleThumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#fff',
    },
    toggleThumbOn: {
      marginLeft: 20,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.inputBorder,
      backgroundColor: theme.inputBg,
      marginBottom: 8,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.inputBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slotInfo: {
      flex: 1,
    },
    slotLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.ink,
    },
    slotTime: {
      fontSize: 13,
      color: theme.muted,
    },
    customTimeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    removeBtn: {
      padding: 4,
    },
    addTimeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
    },
    addTimeBtnText: {
      fontSize: 14,
      fontWeight: '600',
    },
    durationRow: {
      flexDirection: 'row',
      gap: 8,
    },
    durationChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      alignItems: 'center',
    },
    durationText: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.ink,
    },
    saveBtn: {
      marginTop: 28,
      backgroundColor: theme.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.buttonText,
    },
  });
}
