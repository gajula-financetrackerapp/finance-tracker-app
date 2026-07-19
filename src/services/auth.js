/**
 * Auth service — wraps Supabase Auth.
 *
 * Supabase supports email+password, magic-link (OTP), and anonymous sign-in
 * out of the box.  The functions below expose exactly what the app needs.
 */

import { supabase } from '../config/supabase';

// ─── Email + Password ─────────────────────────────────────────────────────────

/**
 * Register a new account with email + password.
 * Returns { user, session, error }.
 */
export async function signUpWithEmail(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { user: data?.user ?? null, session: data?.session ?? null, error };
}

/**
 * Sign in with email + password.
 * Returns { user, session, error }.
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { user: data?.user ?? null, session: data?.session ?? null, error };
}

// ─── Magic Link / OTP ─────────────────────────────────────────────────────────

/**
 * Send a one-time-password (magic link) to the given email.
 * The user taps the link → app handles the deep-link → call verifyOtp().
 * Returns { error }.
 */
export async function sendOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  return { error };
}

/**
 * Verify a 6-digit OTP that Supabase emailed to the user.
 * Returns { user, session, error }.
 */
export async function verifyOtp(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });
  return { user: data?.user ?? null, session: data?.session ?? null, error };
}

// ─── Anonymous sign-in ────────────────────────────────────────────────────────

/**
 * Sign in anonymously (no email required).
 * Useful for letting users try the app before registering.
 * Returns { user, session, error }.
 */
export async function signInAnonymously() {
  const { data, error } = await supabase.auth.signInAnonymously();
  return { user: data?.user ?? null, session: data?.session ?? null, error };
}

// ─── Password reset ───────────────────────────────────────────────────────────

/**
 * Send a password-reset email.
 * Returns { error }.
 */
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

/**
 * Update the authenticated user's password (after they click the reset link).
 * Returns { user, error }.
 */
export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  return { user: data?.user ?? null, error };
}

// ─── Session / current user ───────────────────────────────────────────────────

/**
 * Returns the currently authenticated user, or null.
 */
export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the current session object, or null.
 */
export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// ─── Auth state listener ──────────────────────────────────────────────────────

/**
 * Subscribe to auth state changes.
 * callback(event, session) is called on sign-in, sign-out, token-refresh, etc.
 * Returns an unsubscribe function.
 *
 * Usage:
 *   const unsubscribe = onAuthStateChanged((event, session) => { ... });
 *   // later:
 *   unsubscribe();
 */
export function onAuthStateChanged(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);
  return () => subscription.unsubscribe();
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

/**
 * Sign the current user out.
 * Returns { error }.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}
