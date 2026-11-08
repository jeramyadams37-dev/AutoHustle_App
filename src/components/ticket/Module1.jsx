import { useState } from 'react';
import { Gauge, ListChecks, Activity, Zap, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import ChecklistItem from './ChecklistItem';
import WiringDiagram from '@/components/diagrams/WiringDiagram';

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className="text-primary" />
      <h3 className="font-display font-bold uppercase tracking-wide text-base">{children}</h3>
    </div>
  );
}

const likelihoodColor = (l) => {
  const s = (l || '').toLowerCase();
  if (s.includes('high')) return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (s.includes('med')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30';
};

export default function Module1({ data, progress, onToggle, onLog, rerank, onRerank, reranking }) {
  const m = data?.module1 || {};
  const [showAllCauses, setShowAllCauses] = useState(true);
  const loggedReadings = Object.entries(progress || {})
    .filter(([, v]) => v?.value)
    .map(([id, v]) => ({ id, value: v.value }));

  const causes = rerank?.ranked_causes || m.root_causes || [];

  return (
    <div className="space-y-6">
      {/* Specs */}
      {m.specs?.length > 0 && (
        <div>
          <SectionTitle icon={Gauge}>Quick-Reference Specs</SectionTitle>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {m.specs.map((s, i) => (
                  <tr key={i} className={i % 2 ? 'bg-zinc-900/40' : ''}>
                    <td className="px-3 py-2 text-muted-foreground w-1/2">{s.component}</td>
                    <td className="px-3 py-2 text-mono text-amber-300">{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Root causes */}
      {causes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle icon={Activity}>Possible Root Causes</SectionTitle>
            <button
              onClick={onRerank}
              disabled={reranking || loggedReadings.length === 0}
              className="tap-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/30 disabled:opacity-40"
            >
              <RefreshCw size={14} className={reranking ? 'animate-spin' : ''} /> {rerank ? 'Re-rank again' : 'Re-rank with readings'}
            </button>
          </div>
          {rerank?.diagnosis && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="text-primary font-display uppercase text-xs tracking-wide">Diagnosis</span>
              <p className="mt-1">{rerank.diagnosis}</p>
            </div>
          )}
          <div className="space-y-2">
            {causes.map((c, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-3 flex items-start gap-3">
                <span className="font-display font-bold text-2xl text-primary/70 leading-none w-7">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.cause}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${likelihoodColor(c.likelihood)}`}>{c.likelihood}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">{c.reasoning || c.explanation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostic tests */}
      {m.diagnostic_tests?.length > 0 && (
        <div>
          <SectionTitle icon={ListChecks}>Diagnostic Tests (in order)</SectionTitle>
          <div className="space-y-2">
            {m.diagnostic_tests.map((t) => (
              <ChecklistItem
                key={t.id}
                id={t.id}
                title={`${t.id} · ${t.name}`}
                subtitle={t.description}
                expected={t.expected_reading}
                checked={progress?.[t.id]?.checked}
                value={progress?.[t.id]?.value}
                onToggle={onToggle}
                onLog={onLog}
              />
            ))}
          </div>
        </div>
      )}

      {/* Circuit tests */}
      {m.circuit_tests?.length > 0 && (
        <div>
          <SectionTitle icon={Zap}>Circuit Test Path</SectionTitle>
          <WiringDiagram
            circuitTests={m.circuit_tests}
            logged={Object.fromEntries(Object.entries(progress || {}).filter(([, v]) => v?.value).map(([k, v]) => [k, v.value]))}
            onLog={onLog}
          />
          <div className="mt-2 text-xs text-muted-foreground">Tap a test-point marker to log its measured value.</div>
        </div>
      )}
    </div>
  );
}
