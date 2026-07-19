/**
 * Database service — all Supabase CRUD operations.
 *
 * Convention:
 *   - Every function receives userId as the first argument.
 *   - Every function returns { data, error }.
 *   - The `data` field is the row / array of rows on success, null on error.
 *
 * Tables (see supabase.js for SQL to create them):
 *   accounts, transactions, expense_reminders, med_reminders,
 *   grocery_reminders, buy_list, user_config
 *
 * Rows that hold arbitrary shape (reminders, buy list) are stored in a
 * single `data` jsonb column so the schema never needs migrating when
 * app-level fields change.
 */

import { supabase } from '../config/supabase';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrap(promise) {
  return promise.then(({ data, error }) => ({ data, error }));
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Upsert the user's config document.
 * config is a plain JS object; stored as jsonb.
 */
export async function saveConfig(userId, config) {
  return wrap(
    supabase
      .from('user_config')
      .upsert(
        { user_id: userId, data: config, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .select()
      .single()
  );
}

/**
 * Fetch the user's config document.
 * Returns { data: configObject | null, error }.
 */
export async function getConfig(userId) {
  const { data, error } = await supabase
    .from('user_config')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  return { data: data?.data ?? null, error };
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function saveAccount(userId, account) {
  return wrap(
    supabase
      .from('accounts')
      .insert({ ...account, user_id: userId })
      .select()
      .single()
  );
}

export async function getAccounts(userId) {
  return wrap(
    supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
  );
}

export async function updateAccount(userId, accountId, updates) {
  return wrap(
    supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId)
      .eq('user_id', userId)
      .select()
      .single()
  );
}

export async function deleteAccount(userId, accountId) {
  return wrap(
    supabase
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId)
  );
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function saveTransaction(userId, transaction) {
  return wrap(
    supabase
      .from('transactions')
      .insert({ ...transaction, user_id: userId })
      .select()
      .single()
  );
}

export async function getTransactions(userId, { limit = 200, offset = 0 } = {}) {
  return wrap(
    supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1)
  );
}

export async function updateTransaction(userId, transactionId, updates) {
  return wrap(
    supabase
      .from('transactions')
      .update(updates)
      .eq('id', transactionId)
      .eq('user_id', userId)
      .select()
      .single()
  );
}

export async function deleteTransaction(userId, transactionId) {
  return wrap(
    supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .eq('user_id', userId)
  );
}

// ─── Expense / Bill Reminders ─────────────────────────────────────────────────

export async function saveExpenseReminder(userId, reminder) {
  return wrap(
    supabase
      .from('expense_reminders')
      .insert({ user_id: userId, data: reminder })
      .select()
      .single()
  );
}

export async function getExpenseReminders(userId) {
  const { data, error } = await supabase
    .from('expense_reminders')
    .select('id, data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Flatten: merge the row id into the data payload for easy use in the app
  const rows = data
    ? data.map((row) => ({ id: row.id, createdAt: row.created_at, ...row.data }))
    : null;
  return { data: rows, error };
}

export async function updateExpenseReminder(userId, reminderId, updates) {
  // Merge updates into the existing jsonb data column
  const { data: existing, error: fetchErr } = await supabase
    .from('expense_reminders')
    .select('data')
    .eq('id', reminderId)
    .eq('user_id', userId)
    .single();
  if (fetchErr) return { data: null, error: fetchErr };

  const merged = { ...(existing?.data ?? {}), ...updates };
  return wrap(
    supabase
      .from('expense_reminders')
      .update({ data: merged })
      .eq('id', reminderId)
      .eq('user_id', userId)
      .select()
      .single()
  );
}

export async function deleteExpenseReminder(userId, reminderId) {
  return wrap(
    supabase
      .from('expense_reminders')
      .delete()
      .eq('id', reminderId)
      .eq('user_id', userId)
  );
}

// ─── Medicine Reminders ───────────────────────────────────────────────────────

export async function saveMedReminder(userId, reminder) {
  return wrap(
    supabase
      .from('med_reminders')
      .insert({ user_id: userId, data: reminder })
      .select()
      .single()
  );
}

export async function getMedReminders(userId) {
  const { data, error } = await supabase
    .from('med_reminders')
    .select('id, data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = data
    ? data.map((row) => ({ id: row.id, createdAt: row.created_at, ...row.data }))
    : null;
  return { data: rows, error };
}

export async function updateMedReminder(userId, reminderId, updates) {
  const { data: existing, error: fetchErr } = await supabase
    .from('med_reminders')
    .select('data')
    .eq('id', reminderId)
    .eq('user_id', userId)
    .single();
  if (fetchErr) return { data: null, error: fetchErr };

  const merged = { ...(existing?.data ?? {}), ...updates };
  return wrap(
    supabase
      .from('med_reminders')
      .update({ data: merged })
      .eq('id', reminderId)
      .eq('user_id', userId)
      .select()
      .single()
  );
}

export async function deleteMedReminder(userId, reminderId) {
  return wrap(
    supabase
      .from('med_reminders')
      .delete()
      .eq('id', reminderId)
      .eq('user_id', userId)
  );
}

// ─── Grocery Reminders ────────────────────────────────────────────────────────

export async function saveGroceryReminder(userId, reminder) {
  return wrap(
    supabase
      .from('grocery_reminders')
      .insert({ user_id: userId, data: reminder })
      .select()
      .single()
  );
}

export async function getGroceryReminders(userId) {
  const { data, error } = await supabase
    .from('grocery_reminders')
    .select('id, data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const rows = data
    ? data.map((row) => ({ id: row.id, createdAt: row.created_at, ...row.data }))
    : null;
  return { data: rows, error };
}

export async function updateGroceryReminder(userId, reminderId, updates) {
  const { data: existing, error: fetchErr } = await supabase
    .from('grocery_reminders')
    .select('data')
    .eq('id', reminderId)
    .eq('user_id', userId)
    .single();
  if (fetchErr) return { data: null, error: fetchErr };

  const merged = { ...(existing?.data ?? {}), ...updates };
  return wrap(
    supabase
      .from('grocery_reminders')
      .update({ data: merged })
      .eq('id', reminderId)
      .eq('user_id', userId)
      .select()
      .single()
  );
}

export async function deleteGroceryReminder(userId, reminderId) {
  return wrap(
    supabase
      .from('grocery_reminders')
      .delete()
      .eq('id', reminderId)
      .eq('user_id', userId)
  );
}

// ─── Buy List ─────────────────────────────────────────────────────────────────

export async function saveBuyListItem(userId, item) {
  return wrap(
    supabase
      .from('buy_list')
      .insert({ user_id: userId, data: item })
      .select()
      .single()
  );
}

export async function getBuyList(userId) {
  const { data, error } = await supabase
    .from('buy_list')
    .select('id, data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  const rows = data
    ? data.map((row) => ({ id: row.id, createdAt: row.created_at, ...row.data }))
    : null;
  return { data: rows, error };
}

export async function updateBuyListItem(userId, itemId, updates) {
  const { data: existing, error: fetchErr } = await supabase
    .from('buy_list')
    .select('data')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();
  if (fetchErr) return { data: null, error: fetchErr };

  const merged = { ...(existing?.data ?? {}), ...updates };
  return wrap(
    supabase
      .from('buy_list')
      .update({ data: merged })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single()
  );
}

export async function deleteBuyListItem(userId, itemId) {
  return wrap(
    supabase
      .from('buy_list')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId)
  );
}

// ─── Budget ───────────────────────────────────────────────────────────────────
// Budget is stored inside user_config.data.budget, so no separate table needed.
// Use saveConfig / getConfig from above.
