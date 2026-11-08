import { Check, X } from 'lucide-react';

// A single interactive checklist row: checkbox + title + expected reading + a value-logging field.
export default function ChecklistItem({ id, title, subtitle, expected, checked, value, badge, onToggle, onLog, accent = '#f97316' }) {
  return (
    <div className={`rounded-xl border p-3 transition ${checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(id)}
          className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition ${
            checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent hover:border-primary/60'
          }`}
          aria-label={checked ? 'Mark incomplete' : 'Mark complete'}
        >
          <Check size={16} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium leading-snug ${checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{title}</p>
            {badge && (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-zinc-800 text-amber-300 text-mono whitespace-nowrap">{badge}</span>
            )}
          </div>
          {subtitle && <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>}
          {expected && <p className="text-xs text-mono mt-1 text-amber-300/90">Expected: {expected}</p>}
          <div className="flex gap-2 mt-2">
            <input
              value={value || ''}
              onChange={(e) => onLog(id, e.target.value)}
              placeholder="Log measured value (e.g. 12.4V)"
              className="flex-1 bg-zinc-950 border border-border rounded-lg px-2.5 py-1.5 text-xs text-mono outline-none focus:border-primary"
            />
            {value && (
              <button onClick={() => onLog(id, '')} className="px-2 rounded-lg text-muted-foreground hover:text-foreground border border-border">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
