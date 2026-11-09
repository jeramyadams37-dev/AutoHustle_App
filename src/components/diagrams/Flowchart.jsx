import DiagramViewer from './DiagramViewer';

// Lays out a binary decision tree (yes = left child, no = right child) and renders it as SVG.
// currentId is highlighted as the active step.
export default function Flowchart({ flowchart, currentId }) {
  const nodes = flowchart?.nodes || [];
  if (!nodes.length) return null;

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const startId = nodes[0].id;
  const NODE_W = 150;
  const NODE_H = 54;
  const DX = 18;
  const DY = 78;
  const visited = new Set();

  const widthOf = (id) => {
    if (!id || !byId[id] || visited.has(id)) return 0;
    visited.add(id);
    const n = byId[id];
    const yesW = n.yes_id ? widthOf(n.yes_id) : 0;
    const noW = n.no_id ? widthOf(n.no_id) : 0;
    visited.delete(id);
    return Math.max(NODE_W, yesW + noW + (yesW && noW ? DX : 0));
  };

  const positions = {};
  const place = (id, x, y) => {
    if (!id || !byId[id] || positions[id]) return;
    const n = byId[id];
    const w = widthOf(id);
    positions[id] = { x: x + w / 2, y, node: n };
    const yesW = n.yes_id ? widthOf(n.yes_id) : 0;
    if (n.yes_id) place(n.yes_id, x, y + DY);
    if (n.no_id) place(n.no_id, x + yesW + (yesW ? DX : 0), y + DY);
  };
  place(startId, 0, 0);

  const xs = Object.values(positions).map((p) => p.x);
  const ys = Object.values(positions).map((p) => p.y);
  const minX = Math.min(...xs) - NODE_W / 2 - 8;
  const maxX = Math.max(...xs) + NODE_W / 2 + 8;
  const minY = 0;
  const maxY = Math.max(...ys) + NODE_H + 8;
  const width = maxX - minX;
  const height = maxY - minY;

  const active = currentId && positions[currentId] ? currentId : startId;

  const edges = [];
  Object.values(positions).forEach((p) => {
    const n = p.node;
    if (n.yes_id && positions[n.yes_id]) {
      edges.push({ from: p, to: positions[n.yes_id], label: n.yes_label || 'YES', color: '#22c55e' });
    }
    if (n.no_id && positions[n.no_id]) {
      edges.push({ from: p, to: positions[n.no_id], label: n.no_label || 'NO', color: '#ef4444' });
    }
  });

  return (
    <DiagramViewer title={flowchart.title || 'Diagnostic Flowchart'} svgId="flowchart-svg" caveat>
      <svg id="flowchart-svg" viewBox={`${minX} ${minY} ${width} ${height}`} width="100%" style={{ display: 'block', maxHeight: '70vh' }} xmlns="http://www.w3.org/2000/svg">
        {edges.map((e, i) => {
          const x1 = e.from.x, y1 = e.from.y + NODE_H;
          const x2 = e.to.x, y2 = e.to.y;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const isOutcome = e.to.node.is_outcome;
          return (
            <g key={i}>
              <path d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke={e.color} strokeWidth={2.2} opacity={0.85} />
              <circle cx={mx} cy={my} r={11} fill="#1c1917" stroke={e.color} strokeWidth={1.5} />
              <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={e.color} fontFamily="Inter, sans-serif">{e.label.slice(0, 3).toUpperCase()}</text>
            </g>
          );
        })}
        {Object.entries(positions).map(([id, p]) => {
          const n = p.node;
          const isActive = id === active;
          const isOutcome = n.is_outcome;
          const fill = isOutcome ? '#3f1d1d' : isActive ? '#2a1a0c' : '#211b16';
          const stroke = isOutcome ? '#ef4444' : isActive ? '#f97316' : '#3f3530';
          const label = (n.label || n.question || '').slice(0, 90);
          const cut = label.length > 22 ? (label.lastIndexOf(' ', 22) > 8 ? label.lastIndexOf(' ', 22) : 22) : label.length;
          return (
            <g key={id}>
              <rect x={p.x - NODE_W / 2} y={p.y} width={NODE_W} height={NODE_H} rx={10} fill={fill} stroke={stroke} strokeWidth={isActive ? 2.6 : 1.6} />
              <text x={p.x} y={p.y + 20} textAnchor="middle" fontSize={11} fontWeight={700} fill={isOutcome ? '#fca5a5' : '#fed7aa'} fontFamily="'Barlow Condensed', sans-serif">
                {isOutcome ? '✓ ' : ''}{label.slice(0, cut)}
              </text>
              {label.length > 22 && (
                <text x={p.x} y={p.y + 35} textAnchor="middle" fontSize={9} fill="#a8a29e" fontFamily="Inter, sans-serif">
                  {label.slice(cut, cut + 24).trim()}
                </text>
              )}
              {isActive && <text x={p.x} y={p.y + NODE_H - 6} textAnchor="middle" fontSize={8} fontWeight={700} fill="#f97316" fontFamily="Inter, sans-serif">YOU ARE HERE</text>}
            </g>
          );
        })}
      </svg>
    </DiagramViewer>
  );
}
