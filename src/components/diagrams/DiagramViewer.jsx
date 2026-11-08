import { useRef, useState } from 'react';
import { Download, Maximize2, AlertTriangle } from 'lucide-react';

// Wraps an SVG or image diagram with pinch-zoom, double-tap zoom, and a Save button.
export default function DiagramViewer({ title, svgId, image, caveat, children, accent = '#f97316' }) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0.5, y: 0.5 });
  const pointers = useRef(new Map());
  const startDist = useRef(0);
  const startScale = useRef(1);
  const lastTap = useRef(0);
  const containerRef = useRef(null);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      startDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      startScale.current = scale;
    }
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && startDist.current > 0) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ns = Math.max(1, Math.min(5, startScale.current * (dist / startDist.current)));
      setScale(ns);
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) startDist.current = 0;
  };
  const onClick = (e) => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      const rect = containerRef.current?.getBoundingClientRect();
      const ox = rect ? (e.clientX - rect.left) / rect.width : 0.5;
      const oy = rect ? (e.clientY - rect.top) / rect.height : 0.5;
      setOrigin({ x: ox, y: oy });
      setScale((s) => (s > 1.4 ? 1 : 2.4));
    }
    lastTap.current = now;
  };

  const handleSave = async () => {
    const svg = svgId ? document.getElementById(svgId) : null;
    if (svg) {
      const data = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${(title || 'diagram').replace(/\s+/g, '_')}.svg`; a.click();
      URL.revokeObjectURL(url);
    } else if (image) {
      try {
        const res = await fetch(image);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${(title || 'diagram').replace(/\s+/g, '_')}.png`; a.click();
        URL.revokeObjectURL(url);
      } catch {
        window.open(image, '_blank');
      }
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-zinc-900/40">
        <span className="font-display font-semibold text-sm uppercase tracking-wide" style={{ color: accent }}>{title}</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground hidden sm:inline mr-1">pinch / double-tap</span>
          <button onClick={handleSave} className="tap-target inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground/80 hover:text-primary hover:bg-primary/10 transition">
            <Download size={15} /> Save
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden touch-none select-none bg-zinc-950"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        style={{ cursor: 'grab' }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: `${origin.x * 100}% ${origin.y * 100}%`,
            transition: pointers.current.size < 2 ? 'transform 0.18s ease-out' : 'none',
          }}
        >
          {children}
        </div>
        {scale > 1.05 && (
          <button
            onClick={(e) => { e.stopPropagation(); setScale(1); }}
            className="absolute top-2 right-2 tap-target inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800/90 text-foreground border border-border"
          >
            <Maximize2 size={14} /> Reset
          </button>
        )}
      </div>
      {caveat && (
        <div className="px-3 py-2 text-[11px] text-amber-400/90 bg-amber-500/5 border-t border-border flex items-center gap-2">
          <AlertTriangle size={13} /> Typical layout — verify on your vehicle
        </div>
      )}
    </div>
  );
}
