import { useState } from 'react';
import { X } from 'lucide-react';
import DiagramViewer from './DiagramViewer';

const WIRE_COLORS = {
  red: '#ef4444', black: '#27272a', white: '#e4e4e7', yellow: '#eab308',
  green: '#22c55e', blue: '#3b82f6', orange: '#f97316', pink: '#ec4899',
  purple: '#a855f7', brown: '#92400e', gray: '#9ca3af', grey: '#9ca3af', tan: '#d6b88f',
};

function wireColor(label) {
  const l = (label || '').toLowerCase();
  const key = Object.keys(WIRE_COLORS).find((c) => l.includes(c));
  return key ? WIRE_COLORS[key] : '#f97316';
}

// Color-coded wiring diagram with tappable test-point markers.
// onLog(id, value) persists a measured reading.
export default function WiringDiagram({ circuitTests = [], logged = {}, onLog, caveat }) {
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState('');
  if (!circuitTests.length) return null;

  const n = circuitTests.length;
  const NODE_W = 150, NODE_H = 70, GAP = 36;
  const width = Math.max(320, n * (NODE_W + GAP) + 40);
  const height = 220;

  return (
    <DiagramViewer title="Circuit Test Path" svgId="wiring-svg" caveat={caveat}>
      <div className="relative">
        <svg id="wiring-svg" viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          {/* battery source on the left */}
          <rect x="8" y={height / 2 - 26} width="46" height="52" rx="6" fill="#211b16" stroke="#3f3530" strokeWidth="1.6" />
          <text x="31" y={height / 2 - 2} textAnchor="middle" fontSize="9" fill="#a8a29e" fontFamily="Inter, sans-serif">B+</text>
          <text x="31" y={height / 2 + 14} textAnchor="middle" fontSize="9" fill="#a8a29e" fontFamily="Inter, sans-serif">GND</text>
          <line x1="54" y1={height / 2} x2={width - 8} y2={height / 2} stroke="#3f3530" strokeWidth="1.5" strokeDasharray="4 4" opacity={0.5} />

          {circuitTests.map((t, i) => {
            const x = 70 + i * (NODE_W + GAP);
            const y = height / 2 - NODE_H / 2;
            const color = wireColor(t.wire_color);
            const hasLog = logged[t.id];
            return (
              <g key={t.id} onClick={() => { setActive(t); setDraft(logged[t.id] || ''); }} style={{ cursor: 'pointer' }}>
                {/* wire from bus to node */}
                <line x1={x + NODE_W / 2} y1={height / 2} x2={x + NODE_W / 2} y2={y + NODE_H} stroke={color} strokeWidth={3} />
                <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={9} fill="#211b16" stroke={hasLog ? '#22c55e' : color} strokeWidth={hasLog ? 2.4 : 1.6} />
                <text x={x + NODE_W / 2} y={y + 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fed7aa" fontFamily="'Barlow Condensed', sans-serif">{t.id} · {t.label?.slice(0, 16)}</text>
                <text x={x + NODE_W / 2} y={y + 34} textAnchor="middle" fontSize={9} fill={color} fontWeight={700} fontFamily="Inter, sans-serif">{(t.wire_color || '').slice(0, 18)}</text>
                <text x={x + NODE_W / 2} y={y + 50} textAnchor="middle" fontSize={9} fill={hasLog ? '#22c55e' : '#a8a29e'} fontFamily="'JetBrains Mono', monospace">exp: {(t.expected_value || '').slice(0, 16)}</text>
                {hasLog && <circle cx={x + NODE_W - 10} cy={y + 10} r={5} fill="#22c55e" />}
              </g>
            );
          })}
        </svg>

        {active && (
          <div className="absolute inset-x-2 bottom-2 rounded-xl border border-primary/40 bg-zinc-900/95 p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-semibold text-primary text-sm uppercase">{active.id} · {active.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{active.location}</div>
                <div className="text-xs text-mono mt-1">Expected: <span className="text-amber-300">{active.expected_value}</span></div>
              </div>
              <button onClick={() => setActive(null)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            <div className="flex gap-2 mt-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Log reading (e.g. 12.4V)"
                className="flex-1 bg-zinc-950 border border-border rounded-lg px-3 py-2 text-sm text-mono outline-none focus:border-primary"
              />
              <button
                onClick={() => { onLog?.(active.id, draft); setActive(null); }}
                className="tap-target px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm"
              >Log</button>
            </div>
          </div>
        )}
      </div>
    </DiagramViewer>
  );
}
