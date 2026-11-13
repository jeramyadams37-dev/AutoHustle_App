// Subscribe page — Plus $10/mo, Pro $30/mo.
// Pay on Stripe with the SAME email as the AutoHustle account, then tap
// "Check my plan" — the backend asks Stripe live and unlocks the tier.
// No code, no restart, no Play Store.
import { useState } from 'react';
import { getCurrentAccount } from '@/lib/accounts';
import { useTier, clearTierCache, PLUS_CHECKOUT_URL, PRO_CHECKOUT_URL } from '@/lib/subscription';
import { Crown, Check, RefreshCw, Wrench } from 'lucide-react';

const PLANS = [
  {
    tier: 'plus',
    name: 'Plus',
    price: '$10',
    per: '/month',
    url: PLUS_CHECKOUT_URL,
    blurb: 'For drivers who want the full mechanic in their pocket.',
    features: [
      'Parts prices, nearby stores & labor on every ticket',
      'PDF shop tickets',
      'Unlimited AI diagnoses',
      'Pre-shift Driver Uptime check',
    ],
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$30',
    per: '/month',
    url: PRO_CHECKOUT_URL,
    blurb: 'For fleets and power users. Everything in Plus, plus more to come.',
    features: [
      'Everything in Plus',
      'Fleet / multi-vehicle tools (coming soon)',
      'Priority support',
    ],
  },
];

const TIER_NAME = { free: 'Free', plus: 'Plus', pro: 'Pro' };

export default function Subscribe() {
  const account = getCurrentAccount();
  const { tier, status, loading, refresh } = useTier();
  const [checking, setChecking] = useState(false);
  const [checkedMsg, setCheckedMsg] = useState('');

  const handleRefresh = async () => {
    setChecking(true);
    setCheckedMsg('');
    clearTierCache();
    await refresh();
    setChecking(false);
    setCheckedMsg('Plan checked just now.');
  };

  const periodEnd = status?.current_period_end
    ? new Date(status.current_period_end * 1000).toLocaleDateString()
    : null;

  return (
    <div className="min-h-screen px-5 pt-8 pb-10">
      <div className="flex items-center gap-2 text-primary">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <Wrench size={20} strokeWidth={2.5} />
        </div>
        <span className="font-display font-bold uppercase tracking-widest text-sm">Auto-Hustle</span>
      </div>
      <h1 className="mt-5 font-display font-bold text-3xl leading-tight">
        Your car is your paycheck.
      </h1>
      <p className="mt-2 text-muted-foreground text-[15px] leading-relaxed">
        Stop guessing. Know before you go. Subscribe to unlock the full mechanic — billed
        monthly by Stripe, cancel anytime.
      </p>

      {/* Current plan */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">Signed in as</div>
        <div className="font-semibold text-sm mt-0.5 break-all">{account?.email || 'Not signed in'}</div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm">
            Current plan:{' '}
            <span className="font-display font-bold uppercase text-primary">
              {loading ? 'Checking…' : TIER_NAME[tier] || 'Free'}
            </span>
            {periodEnd && tier !== 'free' ? (
              <span className="text-xs text-muted-foreground"> · renews {periodEnd}</span>
            ) : null}
          </span>
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-sm hover:border-primary/40 disabled:opacity-50"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking…' : 'Check my plan'}
          </button>
        </div>
        {checkedMsg ? <p className="text-xs text-muted-foreground mt-2">{checkedMsg}</p> : null}
        {status?.status === 'unavailable' ? (
          <p className="text-xs text-amber-600 mt-2">
            Subscription checks aren&apos;t set up on the server yet — the app owner needs to
            add the Stripe key first. Your plan shows as Free until then.
          </p>
        ) : null}
      </div>

      {/* Plans */}
      <div className="mt-4 space-y-3">
        {PLANS.map((p) => (
          <div key={p.tier} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display font-bold uppercase tracking-wide text-lg flex items-center gap-2">
                <Crown size={18} className="text-primary" /> {p.name}
              </span>
              <span className="font-display font-bold text-2xl">
                {p.price}
                <span className="text-sm text-muted-foreground font-normal">{p.per}</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{p.blurb}</p>
            <ul className="space-y-1.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check size={16} className="text-primary mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="tap-target mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm py-3"
            >
              Subscribe to {p.name} — {p.price}
              {p.per}
            </a>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display font-bold uppercase tracking-wide text-sm">How it works</h2>
        <ol className="mt-2 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>You are signed in with your AutoHustle account.</li>
          <li>
            Tap Subscribe and pay on Stripe with the{' '}
            <span className="text-foreground font-medium">same email</span> as your account —
            that is how the app finds your subscription.
          </li>
          <li>Come back here and tap “Check my plan”.</li>
          <li>Your tier unlocks in the app. No code, no restart.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Subscriptions are billed by Stripe. Cancel anytime from the link in your Stripe
          receipt email — your plan stays active until the end of the paid month.
        </p>
      </div>
    </div>
  );
}
