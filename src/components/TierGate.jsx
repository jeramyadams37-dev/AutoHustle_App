// Minimal tier gate. Wraps a Plus/Pro-only feature: shows it when the
// signed-in account's tier qualifies, otherwise a locked card that links
// to /subscribe. Usage:
//   <TierGate required="plus" feature="Prices, Stores & Labor">
//     <PartsFinder ... />
//   </TierGate>
import { Link } from 'react-router-dom';
import { Lock, Crown } from 'lucide-react';
import { useTier, tierMeets } from '@/lib/subscription';

const TIER_LABEL = { plus: 'Plus', pro: 'Pro' };

export default function TierGate({ required = 'plus', feature = 'This feature', children }) {
  const { tier, loading } = useTier();
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Checking your plan…
      </div>
    );
  }
  if (tierMeets(tier, required)) return <>{children}</>;
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Lock size={18} className="text-primary" />
        <span className="font-display font-semibold uppercase text-sm tracking-wide">
          {feature} is {TIER_LABEL[required]}-only
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Subscribe to AutoHustle {TIER_LABEL[required]} to unlock it. Your plan is checked with
        the same email as your AutoHustle account.
      </p>
      <Link
        to="/subscribe"
        className="tap-target inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm py-3"
      >
        <Crown size={16} /> See plans — Plus $10/mo · Pro $30/mo
      </Link>
    </div>
  );
}
