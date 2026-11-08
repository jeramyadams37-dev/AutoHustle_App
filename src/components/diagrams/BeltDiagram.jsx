import DiagramViewer from './DiagramViewer';

// Schematic serpentine belt routing with labeled pulleys, tensioner, and rotation arrow.
export default function BeltDiagram({ routing, caveat }) {
  const pulleys = routing?.pulleys || [];
  if (!routing?.needed || !pulleys.length) return null;

  const cx = 200, cy = 150;
  const rx = 150, ry = 95;
  const count = pulleys.length;
  const positions = pulleys.map((p, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { ...p, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });

  const tensioner = positions.find((p) => /tension/i.test(p.type || p.name));
  const path = positions.map((p) => `${p.x},${p.y}`).join(' ');
  const isTensioner = (p) => /tension/i.test(p.type || p.name);

  return (
    <DiagramViewer title="Belt Routing Diagram" svgId="belt-svg" caveat={caveat}>
      <svg id="belt-svg" viewBox="0 0 400 300" width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
        {/* belt path */}
        <polygon points={path} fill="none" stroke="#f97316" strokeWidth={3} strokeLinejoin="round" opacity={0.85} />
        {/* rotation arrow */}
        <g opacity={0.9}>
          <path d={`M${cx + 60},${cy} A60 38 0 0 1 ${cx},${cy + 38}`} fill="none" stroke="#f97316" strokeWidth={2.5} />
          <polygon points={`${cx - 4},${cy + 40} ${cx + 8},${cy + 36} ${cx + 2},${cy + 50}`} fill="#f97316" />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fill="#a8a29e" fontFamily="Inter, sans-serif">rotation</text>
        </g>
        {positions.map((p, i) => {
          const t = isTensioner(p);
          const r = t ? 16 : 20;
          return (
            <g key={p.id || i}>
              <circle cx={p.x} cy={p.y} r={r} fill={t ? '#3f2a14' : '#211b16'} stroke={t ? '#f97316' : '#52525b'} strokeWidth={t ? 2.4 : 1.6} />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={10} fontWeight={700} fill={t ? '#f97316' : '#d6d3d1'} fontFamily="'Barlow Condensed', sans-serif">{p.id || i + 1}</text>
              <text x={p.x} y={p.y - r - 5} textAnchor="middle" fontSize={8} fill="#a8a29e" fontFamily="Inter, sans-serif">{(p.name || '').slice(0, 16)}</text>
            </g>
          );
        })}
      </svg>
    </DiagramViewer>
  );
}
