/**
 * LoginScreen.js
 *
 * Supports three modes toggled by the user:
 *   'login'    — email + password sign-in
 *   'otp'      — email + 6-digit OTP (magic link)
 *   'register' — name + email + password sign-up
 *
 * Uses the yellow theme by default because the user is not yet logged in.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { getTheme } from '../../constants/colors';
import {
  signInWithEmail,
  signUpWithEmail,
  sendOtp,
  verifyOtp,
} from '../../services/auth';

// Always use the yellow theme on the auth screen (user hasn't chosen a theme yet)
const theme = getTheme('yellow');

// ─── Small reusable components ────────────────────────────────────────────────

function Label({ text }) {
  return <Text style={styles.label}>{text}</Text>;
}

function StyledInput({ placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize }) {
  return (
    <TextInput
      style={styles.input}
      placeholder={placeholder}
      placeholderTextColor={theme.placeholderText}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry ?? false}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize={autoCapitalize ?? 'none'}
      autoCorrect={false}
    />
  );
}

function PrimaryButton({ label, onPress, loading, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, (loading || disabled) && styles.primaryBtnDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={theme.buttonText} />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress }) {
  return (
    <TouchableOpacity style={styles.secondaryBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function SuccessBox({ message }) {
  if (!message) return null;
  return (
    <View style={styles.successBox}>
      <Text style={styles.successText}>{message}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LoginScreen() {
  // 'login' | 'otp' | 'register'
  const [mode, setMode] = useState('login');

  // Shared fields
  const [email, setEmail] = useState('');

  // Login / Register fields
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // OTP fields
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ── Helpers ────────────────────────────────────────────────────────────────

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function switchMode(next) {
    clearMessages();
    setOtpSent(false);
    setOtp('');
    setPassword('');
    setName('');
    setMode(next);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const { error: err } = await signInWithEmail(email.trim(), password);
      if (err) setError(err.message ?? 'Sign-in failed.');
      // On success, AppContext auth listener fires → navigation handled by AppNavigator
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const { error: err } = await signUpWithEmail(email.trim(), password);
      if (err) {
        setError(err.message ?? 'Registration failed.');
      } else {
        setSuccess('Account created! Check your email to confirm, then sign in.');
        switchMode('login');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    clearMessages();
    setSendingOtp(true);
    try {
      const { error: err } = await sendOtp(email.trim());
      if (err) {
        setError(err.message ?? 'Failed to send OTP.');
      } else {
        setOtpSent(true);
        setSuccess(`OTP sent to ${email.trim()}. Check your inbox.`);
      }
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) {
      setError('Please enter the OTP from your email.');
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      const { error: err } = await verifyOtp(email.trim(), otp.trim());
      if (err) setError(err.message ?? 'Invalid OTP.');
      // On success, auth listener fires
    } finally {
      setLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoEmoji}>💠</Text>
          </View>
          <Text style={styles.appName}>Finance Tracker</Text>
          <Text style={styles.tagline}>Your personal money manager</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          {/* Mode tabs */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                Password
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'otp' && styles.tabActive]}
              onPress={() => switchMode('otp')}
            >
              <Text style={[styles.tabText, mode === 'otp' && styles.tabTextActive]}>
                OTP / Magic Link
              </Text>
            </TouchableOpacity>
          </View>

          <ErrorBox message={error} />
          <SuccessBox message={success} />

          {/* ── Email/Password login ── */}
          {mode === 'login' && (
            <>
              <Label text="Email" />
              <StyledInput
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />

              <Label text="Password" />
              <StyledInput
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <PrimaryButton
                label="Sign In"
                onPress={handleLogin}
                loading={loading}
              />

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <SecondaryButton
                label="Create an account"
                onPress={() => switchMode('register')}
              />
            </>
          )}

          {/* ── OTP login ── */}
          {mode === 'otp' && (
            <>
              <Label text="Email" />
              <View style={styles.otpEmailRow}>
                <TextInput
                  style={[styles.input, styles.otpEmailInput]}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.placeholderText}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.sendOtpBtn, sendingOtp && styles.primaryBtnDisabled]}
                  onPress={handleSendOtp}
                  disabled={sendingOtp}
                  activeOpacity={0.8}
                >
                  {sendingOtp ? (
                    <ActivityIndicator color={theme.buttonText} size="small" />
                  ) : (
                    <Text style={styles.sendOtpBtnText}>{otpSent ? 'Resend' : 'Send OTP'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              {otpSent && (
                <>
                  <Label text="OTP Code" />
                  <StyledInput
                    placeholder="6-digit code"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                  />
                  <PrimaryButton
                    label="Verify & Sign In"
                    onPress={handleVerifyOtp}
                    loading={loading}
                  />
                </>
              )}

              {!otpSent && (
                <Text style={styles.otpHint}>
                  We'll email you a one-time code to sign in — no password needed.
                </Text>
              )}

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <SecondaryButton
                label="Create an account"
                onPress={() => switchMode('register')}
              />
            </>
          )}

          {/* ── Register ── */}
          {mode === 'register' && (
            <>
              <Text style={styles.cardTitle}>Create Account</Text>

              <Label text="Name (optional)" />
              <StyledInput
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />

              <Label text="Email" />
              <StyledInput
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />

              <Label text="Password" />
              <StyledInput
                placeholder="At least 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <PrimaryButton
                label="Create Account"
                onPress={handleRegister}
                loading={loading}
              />

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <SecondaryButton
                label="Back to Sign In"
                onPress={() => switchMode('login')}
              />
            </>
          )}
        </View>

        <Text style={styles.footer}>Finance Tracker © 2025</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.primary,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },

  // Logo area
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 14,
  },
  logoEmoji: {
    fontSize: 40,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.ink,
    letterSpacing: 0.3,
  },
  tagline: {
    fontSize: 14,
    color: theme.ink,
    opacity: 0.65,
    marginTop: 4,
  },

  // Card
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: theme.card,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.ink,
    marginBottom: 16,
  },

  // Mode tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: theme.inputBg,
    borderRadius: 10,
    marginBottom: 20,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: theme.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.muted,
  },
  tabTextActive: {
    color: theme.ink,
  },

  // Labels & inputs
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.muted,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: theme.inputBg,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 15,
    color: theme.inputText,
  },

  // OTP email row
  otpEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otpEmailInput: {
    flex: 1,
  },
  sendOtpBtn: {
    backgroundColor: theme.primaryDark,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  sendOtpBtnText: {
    color: theme.buttonText,
    fontWeight: '700',
    fontSize: 13,
  },
  otpHint: {
    fontSize: 13,
    color: theme.muted,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 19,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: theme.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: theme.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: theme.buttonText,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Secondary button
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: theme.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.line,
  },
  dividerText: {
    marginHorizontal: 12,
    color: theme.muted,
    fontSize: 12,
    fontWeight: '500',
  },

  // Error / Success boxes
  errorBox: {
    backgroundColor: theme.redLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  errorText: {
    color: theme.red,
    fontSize: 13,
    fontWeight: '500',
  },
  successBox: {
    backgroundColor: theme.greenLight,
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  successText: {
    color: theme.green,
    fontSize: 13,
    fontWeight: '500',
  },

  // Footer
  footer: {
    marginTop: 32,
    fontSize: 12,
    color: theme.ink,
    opacity: 0.45,
  },
});
