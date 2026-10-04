import DiagramViewer from './DiagramViewer';

// Stylized component-location diagram with numbered callouts matching Module 3 rows.
// view: 'engine_bay' | 'under_seat' | 'underbody' | 'generic'
export default function ComponentLocationDiagram({ components = [], view = 'engine_bay', caveat = true, image }) {
  if (!components.length && !image) return null;

  // Spread callouts across the outline.
  const n = components.length || 1;
  const positions = components.map((_, i) => {
    const cols = Math.ceil(Math.sqrt(n));
    const row = Math.floor(i / cols);
    const col = i % cols;
    return { x: 60 + col * (260 / Math.max(1, cols - 1 || 1)), y: 50 + row * 70 };
  });

  const outline = () => {
    if (view === 'under_seat') {
      return (
        <g>
          <rect x="40" y="40" width="320" height="150" rx="18" fill="none" stroke="#3f3530" strokeWidth="2" />
          <rect x="70" y="70" width="120" height="90" rx="8" fill="#2a1a0c" stroke="#f97316" strokeWidth="1.6" />
          <text x="130" y="118" textAnchor="middle" fontSize="10" fill="#a8a29e" fontFamily="Inter, sans-serif">BATTERY</text>
          <text x="200" y="30" textAnchor="middle" fontSize="11" fill="#fed7aa" fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">UNDER-SEAT BATTERY AREA</text>
        </g>
      );
    }
    if (view === 'underbody') {
      return (
        <g>
          <rect x="30" y="80" width="340" height="90" rx="14" fill="none" stroke="#3f3530" strokeWidth="2" />
          <text x="200" y="40" textAnchor="middle" fontSize="11" fill="#fed7aa" fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">UNDERBODY</text>
        </g>
      );
    }
    // engine_bay / generic
    return (
      <g>
        <rect x="30" y="40" width="340" height="190" rx="16" fill="none" stroke="#3f3530" strokeWidth="2" />
        <rect x="70" y="70" width="180" height="120" rx="10" fill="#1c1917" stroke="#52525b" strokeWidth="1.4" />
        <text x="160" y="135" textAnchor="middle" fontSize="11" fill="#52525b" fontFamily="Inter, sans-serif">ENGINE</text>
        <text x="200" y="30" textAnchor="middle" fontSize="11" fill="#fed7aa" fontWeight="700" fontFamily="'Barlow Condensed', sans-serif">ENGINE BAY · TOP VIEW</text>
      </g>
    );
  };

  return (
    <DiagramViewer title="Component Location" svgId={`loc-${view}`} caveat={caveat}>
      {image ? (
        <img src={image} alt="Component location illustration" className="w-full block" />
      ) : (
        <svg id={`loc-${view}`} viewBox="0 0 400 260" width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
          {outline()}
          {components.map((c, i) => {
            const p = positions[i];
            return (
              <g key={c.id || i}>
                <line x1={p.x} y1={p.y} x2={p.x + 18} y2={p.y - 18} stroke="#f97316" strokeWidth="1.4" opacity={0.6} />
                <circle cx={p.x} cy={p.y} r={13} fill="#f97316" />
                <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#1c1917" fontFamily="'Barlow Condensed', sans-serif">{(c.id || '').replace(/\D/g, '') || i + 1}</text>
                <text x={p.x + 22} y={p.y - 16} fontSize={9} fill="#d6d3d1" fontFamily="Inter, sans-serif">{(c.name || '').slice(0, 18)}</text>
              </g>
            );
          })}
        </svg>
      )}
    </DiagramViewer>
  );
}
