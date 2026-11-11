import { useState, useEffect } from 'react';
import { MapPin, Phone, Navigation, Search, Loader2 } from 'lucide-react';
import { getBackendUrl } from '@/lib/gemini';

const store = {
  get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};
const norm = (s) => String(s || '').toLowerCase().replace(/\s*x\d+$/, '').trim();
const money = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : `$${Number(n).toFixed(2)}`);
const qty = (q) => parseInt(q, 10) || 1;

export default function PartsFinder({ ticketId, vehicle, repair, parts = [] }) {
  const [zip, setZip] = useState(store.get('ah_zip'));
  const [rate, setRate] = useState(store.get('ah_rate'));
  const [hours, setHours] = useState(store.get('ah_hours'));
  const [data, setData] = useState(() => { try { return JSON.parse(store.get(`ah_parts_${ticketId}`) || 'null')?.data || null; } catch { return null; } });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const validZip = /^\d{5}$/.test(zip);

  const find = async () => {
    setLoading(true); setErr(''); store.set('ah_zip', zip);
    try {
      const res = await fetch(`${getBackendUrl()}/api/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle, repair, zip, items: parts.map((p) => ({ name: p.name, quantity: p.quantity, is_tool: !!p.is_tool })) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `Backend error ${res.status}`);
      setData(j);
    } catch (e) { setErr(e.message || 'Lookup failed'); }
    setLoading(false);
  };

  const priceFor = (p) => (data?.items || []).find((i) => norm(i.name) === norm(p.name));
  let pLow = 0, pHigh = 0;
  parts.filter((p) => !p.is_tool).forEach((p) => {
    const f = priceFor(p);
    if (f?.low != null) pLow += f.low * qty(p.quantity);
    if (f?.high != null) pHigh += f.high * qty(p.quantity);
  });
  const L = data?.labor || {};
  const myRate = Number(rate) || 0;
  const myHours = Number(hours) || 0;
  const r1 = myRate || L.rate_low, r2 = myRate || L.rate_high;
  const h1 = myHours || L.hours_low, h2 = myHours || L.hours_high;
  const lLow = r1 != null && h1 != null ? r1 * h1 : null;
  const lHigh = r2 != null && h2 != null ? r2 * h2 : null;
  useEffect(() => {
    if (!data || !ticketId) return;
    store.set(`ah_parts_${ticketId}`, JSON.stringify({ data, zip, savedAt: Date.now(), totals: { pLow, pHigh, lLow, lHigh, h1, h2, r1, r2, mine: !!(myRate || myHours) } }));
  }, [data, rate, hours]);
  const input = 'bg-zinc-950 border border-border rounded-lg px-2.5 py-2 text-sm text-mono outline-none focus:border-primary w-full';

  return (
    <div className="space-y-3 mt-6">
      <h3 className="font-display font-bold uppercase tracking-wide text-base">Prices, Stores & Labor</h3>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-muted-foreground">ZIP
          <input value={zip} inputMode="numeric" maxLength={5} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} placeholder="62675" className={input} /></label>
        <label className="text-xs text-muted-foreground">My rate $/hr
          <input value={rate} inputMode="decimal" onChange={(e) => { setRate(e.target.value); store.set('ah_rate', e.target.value); }} placeholder="auto" className={input} /></label>
        <label className="text-xs text-muted-foreground">My hours
          <input value={hours} inputMode="decimal" onChange={(e) => { setHours(e.target.value); store.set('ah_hours', e.target.value); }} placeholder="auto" className={input} /></label>
      </div>
      <button onClick={find} disabled={!validZip || loading} className="tap-target w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide disabled:opacity-40">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {loading ? 'Searching (up to 40 sec)' : 'Find prices & stores'}
      </button>
      {!validZip && <p className="text-xs text-muted-foreground">Enter a 5-digit ZIP code to search.</p>}
      {err && <p className="text-xs text-red-400">{err}</p>}
      {data && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border divide-y divide-border">
            {parts.map((p, i) => { const f = priceFor(p); return (
              <div key={i} className="p-3 text-sm flex justify-between gap-3">
                <span>{p.name}{p.quantity ? ` ×${p.quantity}` : ''}{p.is_tool ? ' (tool)' : ''}</span>
                <span className="text-mono text-amber-300 text-right shrink-0">
                  {f ? <>{money(f.low)}–{money(f.high)}{f.url && <a href={f.url} target="_blank" rel="noreferrer" className="block text-[10px] text-sky-300 underline">{f.source || 'source'}</a>}</> : '—'}
                </span>
              </div>); })}
          </div>
          <div className="rounded-xl border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Parts (excl. tools)</span><span className="text-mono text-amber-300">{money(pLow)}–{money(pHigh)}</span></div>
            <div className="flex justify-between"><span>Labor {h1 != null ? `${h1}${h2 !== h1 ? `–${h2}` : ''} hr` : ''} {r1 != null ? `@ $${r1}${r2 !== r1 ? `–${r2}` : ''}/hr` : ''}</span><span className="text-mono text-amber-300">{money(lLow)}–{money(lHigh)}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-1"><span>Estimated total</span><span className="text-mono text-amber-300">{money(pLow + (lLow || 0))}–{money(pHigh + (lHigh || 0))}</span></div>
            {L.rate_source && !myRate && <p className="text-[10px] text-muted-foreground">Labor rate source: {L.rate_source}. Type your own rate above to override.</p>}
          </div>
          {data.price_note && <p className="text-xs text-red-400">{data.price_note}</p>}
          <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
          <h4 className="font-display font-bold uppercase tracking-wide text-sm">Nearby parts stores</h4>
          {data.store_note && <p className="text-xs text-red-400">{data.store_note}</p>}
          {(data.stores || []).map((s, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
              <p className="font-medium text-sm">{s.name}</p>
              <p className="text-xs text-muted-foreground flex gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" />{s.address}</p>
              <div className="flex gap-2 flex-wrap">
                {s.phone && <a href={`tel:${s.phone}`} className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs"><Phone size={13} />{s.phone}</a>}
                <a href={s.directions_url} target="_blank" rel="noreferrer" className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs"><Navigation size={13} />Directions</a>
              </div>
              {s.hours?.length > 0 && <details className="text-xs text-muted-foreground"><summary>Hours</summary>{s.hours.map((h, k) => <p key={k}>{h}</p>)}</details>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
