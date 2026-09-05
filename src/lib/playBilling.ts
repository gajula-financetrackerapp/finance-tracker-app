import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ErrorCode,
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';
import { isExpoGo } from './googleAds';
import { applyPlaySubscriptionGrant } from './premium';

/** Paid Plus / Premium checkout goes through Google Play (not in-app UPI). */
export const PLAY_BILLING_READY = true;

export const PLAY_SUBSCRIPTION_SKUS = [
  'moneylit_plus_monthly',
  'moneylit_plus_yearly',
  'moneylit_premium_monthly',
  'moneylit_premium_yearly',
] as const;

export type PlaySubscriptionSku = (typeof PLAY_SUBSCRIPTION_SKUS)[number];
export type PlayPlanKind = 'plus' | 'premium';
export type PlayBillingPeriod = 'month' | 'year';

export function isPlayBillingNativeAvailable(): boolean {
  return Platform.OS === 'android' && !isExpoGo();
}

export function playSkuFor(kind: PlayPlanKind, billing: PlayBillingPeriod): PlaySubscriptionSku {
  if (kind === 'plus') {
    return billing === 'month' ? 'moneylit_plus_monthly' : 'moneylit_plus_yearly';
  }
  return billing === 'month' ? 'moneylit_premium_monthly' : 'moneylit_premium_yearly';
}

export function isPlaySubscriptionSku(sku: string | null | undefined): sku is PlaySubscriptionSku {
  return !!sku && (PLAY_SUBSCRIPTION_SKUS as readonly string[]).includes(sku);
}

function offerTokenForPeriod(
  product: ProductSubscription | undefined,
  billing: PlayBillingPeriod,
): string | null {
  if (!product) return null;
  const offers = product.subscriptionOffers ?? [];
  const withToken = offers.filter((offer) => !!offer.offerTokenAndroid);
  if (!withToken.length) return null;
  const unit = billing === 'month' ? 'month' : 'year';
  const needle = billing === 'month' ? 'month' : 'year';
  const byPeriod = withToken.find((offer) => offer.period?.unit === unit);
  if (byPeriod?.offerTokenAndroid) return byPeriod.offerTokenAndroid;
  const byId = withToken.find((offer) =>
    String(offer.id || '')
      .toLowerCase()
      .includes(needle),
  );
  if (byId?.offerTokenAndroid) return byId.offerTokenAndroid;
  return withToken[0]?.offerTokenAndroid ?? null;
}

function obfuscatedAccountId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 64);
}

function isCancellablePurchaseError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  return code === ErrorCode.UserCancelled;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code || '');
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object' || !('message' in error)) return '';
  return String((error as { message?: unknown }).message || '');
}

async function fulfillPlayPurchase(purchase: Purchase): Promise<{
  ok: boolean;
  pending?: boolean;
  reason?: 'missing' | 'unknownSku' | 'suspended' | 'grant';
  error?: string;
}> {
  if (purchase.purchaseState === 'pending') return { ok: false, pending: true };
  if ('isSuspendedAndroid' in purchase && purchase.isSuspendedAndroid) {
    return { ok: false, reason: 'suspended' };
  }
  const token = String(purchase.purchaseToken || '').trim();
  const productId = String(purchase.productId || '').trim();
  if (!token) return { ok: false, reason: 'missing' };
  if (!isPlaySubscriptionSku(productId)) return { ok: false, reason: 'unknownSku' };

  const granted = await applyPlaySubscriptionGrant({
    purchaseToken: token,
    productId,
    transactionId: purchase.transactionId ? String(purchase.transactionId) : null,
  });
  if (!granted.ok) return { ok: false, reason: 'grant', error: granted.error };

  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch (err) {
    console.warn('[playBilling] finishTransaction failed', err);
  }
  return { ok: true };
}

export type PlayCheckoutStatus =
  | 'off'
  | 'connecting'
  | 'ready'
  | 'unavailable'
  | 'missingProducts';

export function usePlayBillingCheckout(opts: {
  enabled: boolean;
  userId: string | null;
  onEntitlement: () => Promise<unknown>;
  onCheckoutGranted?: () => void;
  onFulfillError?: (message: string, pending?: boolean) => void;
}) {
  const { enabled, userId, onEntitlement, onCheckoutGranted, onFulfillError } = opts;
  const native = enabled && isPlayBillingNativeAvailable();
  const [connected, setConnected] = useState(false);
  const [subscriptions, setSubscriptions] = useState<ProductSubscription[]>([]);
  const [busy, setBusy] = useState(false);
  const userIdRef = useRef(userId);
  const onEntitlementRef = useRef(onEntitlement);
  const onCheckoutGrantedRef = useRef(onCheckoutGranted);
  const onFulfillErrorRef = useRef(onFulfillError);
  const expectingPurchaseRef = useRef(false);
  const fulfillingRef = useRef<Set<string>>(new Set());
  userIdRef.current = userId;
  onEntitlementRef.current = onEntitlement;
  onCheckoutGrantedRef.current = onCheckoutGranted;
  onFulfillErrorRef.current = onFulfillError;

  const productMap = useMemo(() => skuMapFrom(subscriptions), [subscriptions]);

  const handlePurchase = useCallback(async (purchase: Purchase) => {
    const key = `${purchase.productId}:${purchase.purchaseToken || purchase.id || ''}`;
    if (fulfillingRef.current.has(key)) return { ok: false as const, duplicate: true };
    fulfillingRef.current.add(key);
    try {
      const result = await fulfillPlayPurchase(purchase);
      if (result.ok) {
        await onEntitlementRef.current();
        if (expectingPurchaseRef.current) {
          expectingPurchaseRef.current = false;
          onCheckoutGrantedRef.current?.();
        }
      } else if (expectingPurchaseRef.current) {
        expectingPurchaseRef.current = false;
        if (result.pending) {
          onFulfillErrorRef.current?.('', true);
        } else if (result.reason === 'grant') {
          onFulfillErrorRef.current?.(result.error || '', false);
        }
      }
      return result;
    } finally {
      fulfillingRef.current.delete(key);
    }
  }, []);

  useEffect(() => {
    if (!native) {
      setConnected(false);
      setSubscriptions([]);
      return;
    }

    let alive = true;
    const purchaseSub = purchaseUpdatedListener((purchase) => {
      void handlePurchase(purchase);
    });
    const errorSub = purchaseErrorListener((error) => {
      expectingPurchaseRef.current = false;
      if (isCancellablePurchaseError(error)) return;
      console.warn('[playBilling] purchase error', error.code, error.message);
    });

    (async () => {
      try {
        await initConnection();
        if (!alive) return;
        setConnected(true);
        const items = (await fetchProducts({
          skus: [...PLAY_SUBSCRIPTION_SKUS],
          type: 'subs',
        })) as ProductSubscription[];
        if (alive) setSubscriptions(Array.isArray(items) ? items : []);
      } catch (err) {
        console.warn('[playBilling] init failed', err);
        if (alive) {
          setConnected(false);
          setSubscriptions([]);
        }
      }
    })();

    return () => {
      alive = false;
      purchaseSub.remove();
      errorSub.remove();
      void endConnection().catch(() => undefined);
    };
  }, [native, handlePurchase]);

  useEffect(() => {
    if (!native || !connected || !userId) return;
    void restorePurchasesInternal(handlePurchase);
  }, [native, connected, userId, handlePurchase]);

  const status: PlayCheckoutStatus = !enabled
    ? 'off'
    : !isPlayBillingNativeAvailable()
      ? 'unavailable'
      : !connected
        ? 'connecting'
        : subscriptions.length
          ? 'ready'
          : 'missingProducts';

  const displayPrice = useCallback(
    (kind: PlayPlanKind, billing: PlayBillingPeriod): string | null => {
      const sku = playSkuFor(kind, billing);
      const price = productMap.get(sku)?.displayPrice;
      return price ? String(price) : null;
    },
    [productMap],
  );

  const subscribe = useCallback(
    async (kind: PlayPlanKind, billing: PlayBillingPeriod) => {
      const uid = userIdRef.current;
      if (!uid) return { ok: false as const, reason: 'signedOut' as const };
      if (!native) return { ok: false as const, reason: 'unavailable' as const };
      const sku = playSkuFor(kind, billing);
      const product = productMap.get(sku);
      const offerToken = offerTokenForPeriod(product, billing);
      if (!offerToken) return { ok: false as const, reason: 'missingProducts' as const };

      setBusy(true);
      expectingPurchaseRef.current = true;
      try {
        await requestPurchase({
          type: 'subs',
          request: {
            google: {
              skus: [sku],
              subscriptionOffers: [{ sku, offerToken }],
              obfuscatedAccountId: obfuscatedAccountId(uid),
            },
          },
        });
        return { ok: true as const };
      } catch (err) {
        expectingPurchaseRef.current = false;
        if (isCancellablePurchaseError(err)) return { ok: false as const, reason: 'cancelled' as const };
        if (errorCode(err) === ErrorCode.AlreadyOwned) {
          const restored = await restorePurchasesInternal(handlePurchase);
          return restored.ok
            ? { ok: true as const, restored: true as const }
            : { ok: false as const, reason: 'restoreNone' as const };
        }
        return { ok: false as const, reason: 'purchase' as const, detail: errorMessage(err) };
      } finally {
        setBusy(false);
      }
    },
    [handlePurchase, native, productMap],
  );

  const restore = useCallback(async () => {
    if (!native) return { ok: false as const, reason: 'unavailable' as const, count: 0 };
    setBusy(true);
    try {
      return await restorePurchasesInternal(handlePurchase);
    } finally {
      setBusy(false);
    }
  }, [handlePurchase, native]);

  return {
    native,
    connected,
    busy,
    status,
    displayPrice,
    subscribe,
    restore,
  };
}

function skuMapFrom(subscriptions: ProductSubscription[]) {
  const map = new Map<PlaySubscriptionSku, ProductSubscription>();
  for (const item of subscriptions) {
    const id = String(item.id || '').trim();
    if (isPlaySubscriptionSku(id)) map.set(id, item);
  }
  return map;
}

async function restorePurchasesInternal(
  handlePurchase: (purchase: Purchase) => Promise<{ ok: boolean }>,
): Promise<{ ok: boolean; reason?: 'restoreNone'; count: number }> {
  try {
    const purchases = await getAvailablePurchases();
    let count = 0;
    for (const purchase of purchases || []) {
      if (!isPlaySubscriptionSku(purchase.productId)) continue;
      const result = await handlePurchase(purchase);
      if (result.ok) count += 1;
    }
    return count > 0 ? { ok: true, count } : { ok: false, reason: 'restoreNone', count: 0 };
  } catch (err) {
    console.warn('[playBilling] restore failed', err);
    return { ok: false, reason: 'restoreNone', count: 0 };
  }
}
