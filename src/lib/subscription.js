// AutoHustle subscriptions — tier check (frontend).
// The signed-in account's email (BYOK accounts.js) is the identity that
// links the app to the Stripe subscription. The backend asks Stripe live
// on every check; nothing about the subscription is stored on the phone
// except a per-session cache of the last answer.
// Fail-closed: any error (no account, no network, backend not configured)
// means tier 'free' — nothing unlocks by accident.
import { useEffect, useState, useCallback } from 'react';
import { getBackendUrl } from './gemini.js';
import { getCurrentAccount } from './accounts.js';

export const PLUS_PRICE_ID = 'price_1UbS7PBgA7fLheT7e64XwvK0';
export const PRO_PRICE_ID = 'price_1UbS7qBgA7fLheT7tbdLU8XG';
export const PLUS_CHECKOUT_URL = 'https://buy.stripe.com/6oU28q9dnfHYeKT90Ies000';
export const PRO_CHECKOUT_URL = 'https://buy.stripe.com/4gM5kCexH2VcfOXgtaes001';

const TIER_RANK = { free: 0, plus: 1, pro: 2 };

let cachedTier = null;
let cachedEmail = null;
let cachedStatus = null;

export function clearTierCache() {
  cachedTier = null;
  cachedEmail = null;
  cachedStatus = null;
}

export async function getSubscriptionStatus() {
  const account = getCurrentAccount();
  const email = account?.email || '';
  if (!email) return { tier: 'free', status: 'none', current_period_end: null, email: '' };
  if (cachedEmail === email && cachedTier) return cachedStatus;
  let out = { tier: 'free', status: 'none', current_period_end: null, email };
  try {
    const res = await fetch(`${getBackendUrl()}/api/subscription?email=${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && (data.tier === 'plus' || data.tier === 'pro')) {
      out = {
        tier: data.tier,
        status: data.status || 'active',
        current_period_end: data.current_period_end ?? null,
        email,
      };
    } else if (res.status === 503) {
      // Backend has no Stripe key configured — subscription checks are not
      // set up yet. Fail closed to Free, but say so (status 'unavailable')
      // so the Subscribe page can show the difference instead of silently
      // pretending the user has no subscription.
      out = { tier: 'free', status: 'unavailable', current_period_end: null, email };
    }
  } catch {
    // No network / backend down / subscriptions not configured -> free.
  }
  cachedTier = out.tier;
  cachedEmail = email;
  cachedStatus = out;
  return out;
}

export async function getTier() {
  return (await getSubscriptionStatus()).tier;
}

export async function isPlus() {
  return TIER_RANK[await getTier()] >= TIER_RANK.plus;
}

export async function isPro() {
  return TIER_RANK[await getTier()] >= TIER_RANK.pro;
}

export function getCachedTier() {
  return cachedTier || 'free';
}

export function tierMeets(tier, required) {
  return (TIER_RANK[tier] || 0) >= (TIER_RANK[required] || 0);
}

export function useTier() {
  const [tier, setTier] = useState(getCachedTier());
  const [status, setStatus] = useState(cachedStatus);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const out = await getSubscriptionStatus();
    setTier(out.tier);
    setStatus(out);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const refresh = useCallback(async () => {
    clearTierCache();
    await load();
  }, [load]);
  return { tier, status, loading, refresh };
}
