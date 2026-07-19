/**
 * BuyListScreen — "List to Buy" feature.
 *
 * Displays items the user plans to purchase in a 3-column table:
 *   Col 1: Item name (with emoji icon if present)
 *   Col 2: Quantity + unit
 *   Col 3: Bought status toggle (checkmark / circle)
 *
 * Features:
 * - Unbought items sorted first, bought items at bottom
 * - Green row tint + strikethrough for bought items
 * - Count badge "X/Y bought"
 * - Add / Edit form modal with grocery-sync duplicate check
 * - Row tap → Edit / Delete action sheet
 * - Status column tap → instant toggle
 * - Empty state illustration
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  Animated,
} from 'react-native';
import { useAppContext } from '../../state/AppContext';
import { getTheme } from '../../constants/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const UNITS = ['g', 'kg', 'piece', 'pack', 'L', 'number'];

const EMPTY_FORM = {
  name: '',
  quantity: '',
  unit: 'piece',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CountBadge({ bought, total, theme }) {
  const s = styles(theme);
  return (
    <View style={s.badgeRow}>
      <View style={s.badge}>
        <Text style={s.badgeText}>
          {bought}/{total} bought
        </Text>
      </View>
    </View>
  );
}

function TableHeader({ theme }) {
  const s = styles(theme);
  return (
    <View style={s.headerRow}>
      <Text style={[s.headerCell, s.colName]}>Item</Text>
      <Text style={[s.headerCell, s.colQty]}>Quantity</Text>
      <Text style={[s.headerCell, s.colStatus]}>Status</Text>
    </View>
  );
}

function BuyRow({ item, onPressRow, onToggleStatus, theme }) {
  const s = styles(theme);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleToggle = () => {
    if (!item.bought) {
      // Animate when marking bought
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.08, duration: 100, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    onToggleStatus(item.id);
  };

  const rowStyle = [
    s.tableRow,
    item.bought && s.tableRowBought,
  ];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity style={rowStyle} onPress={() => onPressRow(item)} activeOpacity={0.7}>
        {/* Col 1: Name */}
        <View style={s.colName}>
          <Text
            style={[s.itemName, item.bought && s.itemNameBought]}
            numberOfLines={2}
          >
            {item.emoji ? `${item.emoji} ` : ''}{item.name}
          </Text>
        </View>

        {/* Col 2: Quantity */}
        <View style={s.colQty}>
          <Text style={[s.itemQty, item.bought && s.itemTextMuted]}>
            {item.quantity} {item.unit}
          </Text>
        </View>

        {/* Col 3: Status toggle */}
        <TouchableOpacity
          style={s.colStatus}
          onPress={handleToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {item.bought ? (
            <View style={s.checkCircle}>
              <Text style={s.checkMark}>✓</Text>
            </View>
          ) : (
            <View style={s.emptyCircle} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

function UnitSelector({ selectedUnit, onSelect, theme }) {
  const s = styles(theme);
  return (
    <View style={s.unitRow}>
      {UNITS.map((u) => (
        <TouchableOpacity
          key={u}
          style={[s.unitChip, selectedUnit === u && s.unitChipSelected]}
          onPress={() => onSelect(u)}
        >
          <Text style={[s.unitChipText, selectedUnit === u && s.unitChipTextSelected]}>
            {u}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ItemFormModal({
  visible,
  onClose,
  onSave,
  initialValues,
  isEditing,
  onBlurName,
  theme,
  saving,
}) {
  const s = styles(theme);
  const [form, setForm] = useState(initialValues);

  // Sync when initialValues change (edit mode)
  React.useEffect(() => {
    setForm(initialValues);
  }, [initialValues, visible]);

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Please enter an item name.');
      return;
    }
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) {
      Alert.alert('Required', 'Please enter a valid quantity.');
      return;
    }
    onSave(form);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.modalKAV}
        >
          <Pressable style={s.modalSheet} onPress={(e) => e.stopPropagation()}>
            {/* Handle bar */}
            <View style={s.handleBar} />

            <Text style={s.modalTitle}>{isEditing ? 'Edit Item' : 'Add to Buy List'}</Text>

            {/* Item Name */}
            <Text style={s.fieldLabel}>Item Name</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Milk, Eggs, Bread..."
              placeholderTextColor={theme.placeholderText}
              value={form.name}
              onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
              onBlur={() => onBlurName(form.name)}
              autoCapitalize="sentences"
              returnKeyType="next"
            />

            {/* Quantity */}
            <Text style={s.fieldLabel}>Quantity</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. 2, 500, 1.5..."
              placeholderTextColor={theme.placeholderText}
              value={form.quantity}
              onChangeText={(v) => setForm((p) => ({ ...p, quantity: v }))}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />

            {/* Unit */}
            <Text style={s.fieldLabel}>Unit</Text>
            <UnitSelector
              selectedUnit={form.unit}
              onSelect={(u) => setForm((p) => ({ ...p, unit: u }))}
              theme={theme}
            />

            {/* Actions */}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={theme.buttonText} size="small" />
                ) : (
                  <Text style={s.saveBtnText}>{isEditing ? 'Save Changes' : 'Add Item'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function EmptyState({ theme }) {
  const s = styles(theme);
  return (
    <View style={s.emptyContainer}>
      <Text style={s.emptyIcon}>🛒</Text>
      <Text style={s.emptyTitle}>Your buy list is empty</Text>
      <Text style={s.emptySubtitle}>Tap + to add items you plan to purchase</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BuyListScreen() {
  const {
    config,
    buyList,
    findDuplicateInGrocery,
    addBuyItem,
    editBuyItem,
    toggleBuyItem,
    removeBuyItem,
  } = useAppContext();

  const theme = getTheme(config.theme);
  const s = styles(theme);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Sorted list: unbought first, bought at bottom
  const sortedList = useMemo(() => {
    const unbought = buyList.filter((i) => !i.bought);
    const bought = buyList.filter((i) => i.bought);
    return [...unbought, ...bought];
  }, [buyList]);

  const boughtCount = useMemo(() => buyList.filter((i) => i.bought).length, [buyList]);

  // ── Grocery sync check ──────────────────────────────────────────────────────
  const handleNameBlur = useCallback(
    (name) => {
      if (!name.trim()) return;
      const duplicate = findDuplicateInGrocery(name.trim());
      if (duplicate) {
        Alert.alert(
          '⚠️ Already in Grocery List',
          `"${duplicate.name}" with ${duplicate.quantity ?? ''} ${duplicate.unit ?? ''} is already in your Grocery Expiry Reminder list. Do you still want to add it to your Buy List?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Add Anyway', style: 'default' },
          ]
        );
      }
    },
    [findDuplicateInGrocery]
  );

  // ── Open add modal ──────────────────────────────────────────────────────────
  const openAddModal = useCallback(() => {
    setEditingItem(null);
    setFormValues(EMPTY_FORM);
    setModalVisible(true);
  }, []);

  // ── Open edit modal ─────────────────────────────────────────────────────────
  const openEditModal = useCallback((item) => {
    setEditingItem(item);
    setFormValues({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      emoji: item.emoji ?? '',
    });
    setModalVisible(true);
  }, []);

  // ── Row tap → action sheet ──────────────────────────────────────────────────
  const handleRowPress = useCallback(
    (item) => {
      Alert.alert(item.name, 'What would you like to do?', [
        {
          text: 'Edit',
          onPress: () => openEditModal(item),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Item',
              `Remove "${item.name}" from your buy list?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    const { error } = await removeBuyItem(item.id);
                    if (error) {
                      Alert.alert('Error', 'Could not delete item. Please try again.');
                    }
                  },
                },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [openEditModal, removeBuyItem]
  );

  // ── Save (add or edit) ──────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (form) => {
      setSaving(true);
      try {
        const payload = {
          name: form.name.trim(),
          quantity: parseFloat(form.quantity),
          unit: form.unit,
        };

        if (editingItem) {
          const { error } = await editBuyItem(editingItem.id, payload);
          if (error) {
            Alert.alert('Error', 'Could not update item. Please try again.');
            return;
          }
        } else {
          const { error } = await addBuyItem({ ...payload, bought: false });
          if (error) {
            Alert.alert('Error', 'Could not add item. Please try again.');
            return;
          }
        }
        setModalVisible(false);
      } finally {
        setSaving(false);
      }
    },
    [editingItem, editBuyItem, addBuyItem]
  );

  // ── Toggle bought ───────────────────────────────────────────────────────────
  const handleToggleStatus = useCallback(
    async (itemId) => {
      const { error } = await toggleBuyItem(itemId);
      if (error) {
        Alert.alert('Error', 'Could not update status. Please try again.');
      }
    },
    [toggleBuyItem]
  );

  // ── Render item ─────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }) => (
      <BuyRow
        item={item}
        onPressRow={handleRowPress}
        onToggleStatus={handleToggleStatus}
        theme={theme}
      />
    ),
    [handleRowPress, handleToggleStatus, theme]
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>List to Buy</Text>
        <TouchableOpacity style={s.addButton} onPress={openAddModal}>
          <Text style={s.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Count badge */}
      {buyList.length > 0 && (
        <CountBadge bought={boughtCount} total={buyList.length} theme={theme} />
      )}

      {/* Table */}
      {sortedList.length === 0 ? (
        <EmptyState theme={theme} />
      ) : (
        <View style={s.tableContainer}>
          <TableHeader theme={theme} />
          <FlatList
            data={sortedList}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={s.separator} />}
          />
        </View>
      )}

      {/* Add / Edit Modal */}
      <ItemFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        initialValues={formValues}
        isEditing={!!editingItem}
        onBlurName={handleNameBlur}
        theme={theme}
        saving={saving}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function styles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.headerBg,
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 52 : 16,
      paddingBottom: 14,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.headerText,
    },
    addButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 3,
    },
    addButtonText: {
      fontSize: 24,
      fontWeight: '400',
      color: theme.primaryDark,
      lineHeight: 28,
    },

    // Badge
    badgeRow: {
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: theme.primaryLight,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.primaryDark,
    },

    // Table
    tableContainer: {
      flex: 1,
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 12,
      backgroundColor: theme.card,
      overflow: 'hidden',
      shadowColor: theme.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 6,
      elevation: 3,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.primaryLight,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.line,
    },
    headerCell: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.primaryDark,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // Column widths
    colName: { flex: 2, paddingRight: 4 },
    colQty: { flex: 1, paddingRight: 4 },
    colStatus: { width: 48, alignItems: 'center' },

    // Row
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: theme.card,
    },
    tableRowBought: {
      backgroundColor: theme.greenLight,
    },
    listContent: {
      flexGrow: 1,
    },
    separator: {
      height: 1,
      backgroundColor: theme.line,
      marginHorizontal: 12,
    },

    // Row cells
    itemName: {
      fontSize: 15,
      fontWeight: '500',
      color: theme.ink,
    },
    itemNameBought: {
      textDecorationLine: 'line-through',
      color: theme.muted,
    },
    itemQty: {
      fontSize: 14,
      color: theme.ink,
    },
    itemTextMuted: {
      color: theme.muted,
    },

    // Status indicators
    checkCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkMark: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    emptyCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: theme.line,
    },

    // Empty state
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyIcon: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.ink,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.muted,
      textAlign: 'center',
      lineHeight: 20,
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    modalKAV: {
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      paddingTop: 12,
    },
    handleBar: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.line,
      alignSelf: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.ink,
      marginBottom: 20,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.muted,
      marginBottom: 6,
      marginTop: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    input: {
      backgroundColor: theme.inputBg,
      borderWidth: 1,
      borderColor: theme.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.inputText,
    },

    // Unit selector
    unitRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    unitChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: theme.line,
      backgroundColor: theme.inputBg,
    },
    unitChipSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primaryDark,
    },
    unitChipText: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.muted,
    },
    unitChipTextSelected: {
      color: theme.buttonText,
      fontWeight: '700',
    },

    // Modal actions
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.line,
      alignItems: 'center',
    },
    cancelBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.muted,
    },
    saveBtn: {
      flex: 2,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    saveBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.buttonText,
    },
  });
}
