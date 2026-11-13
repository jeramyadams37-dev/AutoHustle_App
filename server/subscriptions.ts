// AutoHustle subscriptions — live Stripe tier check (server side only).
// No webhook, no stored subscription data: every check asks Stripe.
// The Stripe secret key comes ONLY from the STRIPE_SECRET_KEY env var
// (Secret Manager secret `autohustle-stripe` on Cloud Run). It is never
// logged, never stored, and never sent to the app.
// Price IDs (live, AtotheI account):
//   Plus $10/mo  price_1UbS7PBgA7fLheT7e64XwvK0
//   Pro  $30/mo  price_1UbS7qBgA7fLheT7tbdLU8XG
// Tier rule: an active (or trialing) subscription whose items include
// the Pro price -> 'pro'; the Plus price -> 'plus'; otherwise 'free'.
// Pro wins if a customer somehow holds both.

export const PLUS_PRICE_ID = 'price_1UbS7PBgA7fLheT7e64XwvK0';
export const PRO_PRICE_ID = 'price_1UbS7qBgA7fLheT7tbdLU8XG';

export type Tier = 'free' | 'plus' | 'pro';

export interface SubscriptionStatus {
  tier: Tier;
  status: string;
  current_period_end: number | null;
  email: string;
}

const STRIPE_API = 'https://api.stripe.com/v1';
const FETCH_TIMEOUT_MS = 8000;

function stripeHeaders(): Record<string, string> {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return {
    Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

async function stripeGet(path: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(STRIPE_API + path, { headers: stripeHeaders(), signal: ctrl.signal });
    if (!res.ok) {
      const err: any = new Error('STRIPE_ERROR');
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function tierFromSubscription(sub: any): Tier | null {
  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) return null;
  const items = sub.items?.data || [];
  if (items.some((it: any) => it.price?.id === PRO_PRICE_ID)) return 'pro';
  if (items.some((it: any) => it.price?.id === PLUS_PRICE_ID)) return 'plus';
  return null;
}

export async function getSubscriptionForEmail(email: string): Promise<SubscriptionStatus> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_NOT_CONFIGURED');
  }
  const clean = String(email || '').trim().toLowerCase();
  const customers = await stripeGet('/customers?email=' + encodeURIComponent(clean) + '&limit=1');
  const customer = customers?.data?.[0];
  if (!customer) {
    return { tier: 'free', status: 'none', current_period_end: null, email: clean };
  }
  const subs = await stripeGet(
    '/subscriptions?customer=' + encodeURIComponent(customer.id) + '&status=all&limit=10',
  );
  let best: Tier | null = null;
  let bestStatus = 'none';
  let bestEnd: number | null = null;
  for (const sub of subs?.data || []) {
    const t = tierFromSubscription(sub);
    if (!t) continue;
    // Pro outranks Plus; otherwise keep the first match.
    if (t === 'pro' || best === null) {
      best = t;
      bestStatus = sub.status;
      bestEnd = sub.current_period_end ?? null;
    }
  }
  if (!best) {
    return { tier: 'free', status: 'none', current_period_end: null, email: clean };
  }
  return { tier: best, status: bestStatus, current_period_end: bestEnd, email: clean };
}
