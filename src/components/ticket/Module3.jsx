import { MapPin } from 'lucide-react';
import ComponentLocationDiagram from '@/components/diagrams/ComponentLocationDiagram';

export default function Module3({ data, illustrations }) {
  const m = data?.module3 || {};
  const components = m.components || [];
  if (!components.length) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={18} className="text-primary" />
        <h3 className="font-display font-bold uppercase tracking-wide text-base">Component Location Reference</h3>
      </div>
      <ComponentLocationDiagram components={components} view="engine_bay" image={illustrations?.engine_bay} />
      {illustrations?.under_seat && (
        <ComponentLocationDiagram
          components={components.filter((c) => /battery|fuse|terminal/i.test(c.name))}
          view="under_seat"
          image={illustrations.under_seat}
        />
      )}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900/60 text-muted-foreground text-xs uppercase font-display tracking-wide">
              <th className="px-3 py-2 text-left w-10">#</th>
              <th className="px-3 py-2 text-left">Component</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">Tool</th>
            </tr>
          </thead>
          <tbody>
            {components.map((c, i) => (
              <tr key={c.id || i} className={i % 2 ? 'bg-zinc-900/40' : ''}>
                <td className="px-3 py-2 text-primary font-display font-bold">{(c.id || '').replace(/\D/g, '') || i + 1}</td>
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{c.location}</td>
                <td className="px-3 py-2 text-mono text-xs text-sky-300">{c.tool_needed || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
