import { Sparkles } from 'lucide-react';

export default function Module4({ data }) {
  const m = data?.module4 || {};
  const recs = m.recommendations || [];
  if (!recs.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} className="text-primary" />
        <h3 className="font-display font-bold uppercase tracking-wide text-base">While You're In There</h3>
      </div>
      <p className="text-sm text-muted-foreground">Preventive & overlapping service worth doing with the area already open.</p>
      <div className="space-y-2">
        {recs.map((r, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <span className="font-display font-bold text-primary text-lg leading-none">+</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{r.job}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{r.reason}</p>
                {r.overlap && <p className="text-[11px] text-amber-300/80 mt-1">↳ {r.overlap}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
