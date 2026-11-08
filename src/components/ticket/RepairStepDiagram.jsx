import DiagramViewer from '@/components/diagrams/DiagramViewer';

// A compact schematic illustration for a single repair step, drawn from its diagram_hint.
// Arrow on a bolt, highlight on a connector, etc. — clean line art, orange on dark.
export default function RepairStepDiagram({ step }) {
  const hint = (step.diagram_hint || '').toLowerCase();
  let art;
  if (hint.includes('connector') || hint.includes('plug') || hint.includes('clip')) {
    art = (
      <g>
        <rect x="150" y="70" width="100" height="60" rx="8" fill="#211b16" stroke="#f97316" strokeWidth="2.4" />
        <rect x="120" y="85" width="30" height="30" rx="4" fill="#2a1a0c" stroke="#52525b" />
        <circle cx="175" cy="100" r="6" fill="#f97316" opacity="0.9" />
        <path d="M60 100 L120 100" stroke="#f97316" strokeWidth="3" markerEnd="url(#arr)" />
        <text x="200" y="160" textAnchor="middle" fontSize="11" fill="#fed7aa" fontFamily="'Barlow Condensed', sans-serif">DISCONNECT CONNECTOR</text>
      </g>
    );
  } else if (hint.includes('hose') || hint.includes('clamp')) {
    art = (
      <g>
        <path d="M60 100 C120 60 180 140 240 100" stroke="#f97316" strokeWidth="6" fill="none" strokeLinecap="round" />
        <rect x="140" y="86" width="22" height="28" rx="4" fill="#2a1a0c" stroke="#f97316" strokeWidth="2" />
        <path d="M40 100 L60 100" stroke="#f97316" strokeWidth="3" markerEnd="url(#arr)" />
        <text x="150" y="160" textAnchor="middle" fontSize="11" fill="#fed7aa" fontFamily="'Barlow Condensed', sans-serif">RELEASE CLAMP / HOSE</text>
      </g>
    );
  } else if (hint.includes('belt') || hint.includes('tension')) {
    art = (
      <g>
        <circle cx="120" cy="100" r="34" fill="none" stroke="#52525b" strokeWidth="2" />
        <circle cx="220" cy="100" r="34" fill="none" stroke="#52525b" strokeWidth="2" />
        <path d="M120 66 A34 34 0 0 1 220 66 M120 134 A34 34 0 0 0 220 134" stroke="#f97316" strokeWidth="3" fill="none" />
        <rect x="160" y="90" width="20" height="20" rx="3" fill="#2a1a0c" stroke="#f97316" strokeWidth="2" />
        <path d="M260 60 L240 90" stroke="#f97316" strokeWidth="3" markerEnd="url(#arr)" />
        <text x="170" y="170" textAnchor="middle" fontSize="11" fill="#fed7aa" fontFamily="'Barlow Condensed', sans-serif">ROTATE TENSIONER</text>
      </g>
    );
  } else {
    // default: bolt with arrow
    art = (
      <g>
        <circle cx="170" cy="100" r="26" fill="#211b16" stroke="#52525b" strokeWidth="2" />
        <path d="M170 78 L170 122 M148 100 L192 100 M155 85 L185 115 M185 85 L155 115" stroke="#3f3530" strokeWidth="2" />
        <path d="M70 100 L138 100" stroke="#f97316" strokeWidth="3.5" markerEnd="url(#arr)" />
        <text x="170" y="160" textAnchor="middle" fontSize="11" fill="#fed7aa" fontFamily="'Barlow Condensed', sans-serif">REMOVE FASTENER</text>
      </g>
    );
  }

  return (
    <DiagramViewer title="Step Illustration" svgId={`step-${step.id}`} caveat>
      <svg id={`step-${step.id}`} viewBox="0 0 300 180" width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arr" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
            <path d="M0 0 L7 3 L0 6 Z" fill="#f97316" />
          </marker>
        </defs>
        {art}
      </svg>
    </DiagramViewer>
  );
}
