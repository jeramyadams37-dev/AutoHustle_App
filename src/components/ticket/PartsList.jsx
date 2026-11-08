import { Package, Check } from 'lucide-react';

export default function PartsList({ parts = [], partsState = {}, onTogglePart }) {
  if (!parts.length) return null;
  const tools = parts.filter((p) => p.is_tool);
  const items = parts.filter((p) => !p.is_tool);
  const Row = ({ p, i }) => {
    const key = p.name;
    const checked = partsState[key]?.checked;
    return (
      <button
        onClick={() => onTogglePart(key)}
        className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}
      >
        <span className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-transparent'}`}>
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="flex-1 text-sm font-medium">{p.name}</span>
        {p.quantity && <span className="text-xs text-mono text-muted-foreground">×{p.quantity}</span>}
      </button>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package size={18} className="text-primary" />
        <h3 className="font-display font-bold uppercase tracking-wide text-base">Parts & Tools List</h3>
      </div>
      {items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase font-display tracking-wide text-muted-foreground">Parts</p>
          {items.map((p, i) => <Row key={i} p={p} i={i} />)}
        </div>
      )}
      {tools.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase font-display tracking-wide text-muted-foreground">Tools</p>
          {tools.map((p, i) => <Row key={i} p={p} i={i} />)}
        </div>
      )}
    </div>
  );
}
