import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useApp } from '../context/AppContext';
import { useFinance } from '../FinanceContext';
import {
  findImportableSms,
  reasonForScanError,
  recordAutoImportRun,
  writeImportRows,
} from '../lib/autoSmsImport';

/** Don't re-read the inbox every time the user flicks back into the app. */
const FOREGROUND_COOLDOWN_MS = 60_000;

/**
 * Mounted for the life of the app, renders nothing.
 *
 * With automatic import switched on, bank SMS become transactions when the app
 * opens, so the Import screen is somewhere you go to review rules rather than a
 * chore you repeat. Deliberately quiet: no dialogs, no permission prompt, and
 * nothing at all unless the user asked for this.
 */
export function AutoSmsImportRunner() {
  const {
    ready,
    config,
    finance,
    addTransaction,
    expenseCategories,
    incomeCategories,
  } = useApp();
  const { isGuest } = useFinance();

  const on =
    ready && config.smsAutoImport === true && config.features.smsImport !== false && !isGuest;

  // Read the ledger through a ref: every transaction written updates finance
  // state, and the run must not restart underneath itself.
  const financeRef = useRef(finance);
  financeRef.current = finance;
  const busy = useRef(false);
  const lastRunAt = useRef(0);

  const knownCategories = useMemo(
    () =>
      new Set([
        ...expenseCategories.map((c) => c.name),
        ...incomeCategories.map((c) => c.name),
      ]),
    [expenseCategories, incomeCategories],
  );

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const state = financeRef.current;
      const found = await findImportableSms({
        importRules: config.importRules,
        knownCategories,
        transactions: state.transactions,
        // Never raise the Android dialog here. A permission asked for out of
        // nowhere on launch is startling, and a poor way to earn a yes.
        permission: 'existing',
      });
      lastRunAt.current = Date.now();
      if (found.error) {
        await recordAutoImportRun({
          at: Date.now(),
          reason: reasonForScanError(found.error),
          added: 0,
          found: 0,
        });
        return;
      }
      if (!found.fresh.length) {
        await recordAutoImportRun({
          at: Date.now(),
          reason: 'nothing',
          added: 0,
          found: found.rows.length,
        });
        return;
      }
      const res = await writeImportRows(found.fresh, {
        accounts: state.accounts,
        fallbackAccountId:
          state.defaultAccountId ||
          state.accounts.find((a) => !a.excluded)?.id ||
          state.accounts[0]?.id,
        transactions: state.transactions,
        addTransaction,
      });
      await recordAutoImportRun({
        at: Date.now(),
        reason: 'added',
        added: res.added,
        found: found.fresh.length,
      });
    } catch {
      // A failed pass is not worth interrupting the user over: the Import screen
      // still lists everything this missed, and the note above says what broke.
      await recordAutoImportRun({ at: Date.now(), reason: 'error', added: 0, found: 0 });
    } finally {
      busy.current = false;
    }
  }, [addTransaction, config.importRules, knownCategories]);

  useEffect(() => {
    if (!on) {
      // Leaving a trace even when the gate is shut: otherwise a phone that never
      // qualifies looks exactly like one that found nothing to import.
      void recordAutoImportRun({ at: Date.now(), reason: 'waiting', added: 0, found: 0 });
      return;
    }
    void run();
  }, [on, run]);

  // Accounts and history arrive with the workspace. A pass that ran before them
  // would have nothing to file against, so try again once they show up.
  const hadAccounts = useRef(finance.accounts.length > 0);
  useEffect(() => {
    const has = finance.accounts.length > 0;
    const appeared = has && !hadAccounts.current;
    hadAccounts.current = has;
    if (on && appeared) void run();
  }, [finance.accounts.length, on, run]);

  useEffect(() => {
    if (!on) return;
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (Date.now() - lastRunAt.current < FOREGROUND_COOLDOWN_MS) return;
      void run();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [on, run]);

  return null;
}
