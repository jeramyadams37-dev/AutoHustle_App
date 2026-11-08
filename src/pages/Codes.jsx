import { useState } from 'react';
import { SearchCode, Loader2, AlertCircle, Wrench, ListChecks } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const severityColor = (s) => {
  const v = (s || '').toLowerCase();
  if (v.includes('high')) return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (v.includes('med')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
};

export default function Codes() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookup = async () => {
    setError('');
    if (!code.trim()) { setError('Enter a DTC code.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await base44.functions.invoke('obd2Lookup', { code });
      setResult(res.data);
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen px-5 pt-5">
      <h1 className="font-display font-bold text-3xl">OBD2 Code Lookup</h1>
      <p className="text-muted-foreground text-sm mt-1">Enter any DTC to get its meaning, common causes, and the first test to run.</p>

      <div className="mt-5 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="e.g. P0562"
          className="flex-1 bg-zinc-950 border border-border rounded-xl px-4 py-3.5 text-base text-mono uppercase outline-none focus:border-primary"
        />
        <button onClick={lookup} disabled={loading} className="tap-target px-5 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase tracking-wide disabled:opacity-40">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <SearchCode size={20} />}
        </button>
      </div>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

      {result && (
        <div className="mt-5 space-y-4 pb-4">
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <span className="text-mono text-2xl font-bold text-primary">{result.code}</span>
              {result.severity && <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md border ${severityColor(result.severity)}`}>{result.severity}</span>}
            </div>
            <p className="mt-2 font-medium">{result.meaning}</p>
            {result.system && <p className="text-xs text-muted-foreground mt-1 uppercase font-display tracking-wide">{result.system}</p>}
          </div>

          {result.common_causes?.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><AlertCircle size={16} className="text-primary" /><h3 className="font-display font-semibold uppercase tracking-wide text-sm">Common Causes</h3></div>
              <div className="space-y-2">
                {result.common_causes.map((c, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3 flex items-start gap-2">
                    <span className="font-display font-bold text-primary/70">{i + 1}</span>
                    <span className="text-sm">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.first_test && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-2"><ListChecks size={16} className="text-primary" /><h3 className="font-display font-semibold uppercase tracking-wide text-sm">First Test to Run</h3></div>
              <p className="font-medium text-sm">{result.first_test.name}</p>
              <p className="text-sm text-muted-foreground mt-1">{result.first_test.description}</p>
              {result.first_test.expected_reading && <p className="text-xs text-mono text-amber-300 mt-2">Expected: {result.first_test.expected_reading}</p>}
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="mt-10 text-center text-muted-foreground">
          <Wrench size={32} className="mx-auto mb-2 text-primary/40" />
          <p className="text-sm">Try P0562 (low system voltage) or P0420 (catalyst efficiency).</p>
        </div>
      )}
    </div>
  );
}
