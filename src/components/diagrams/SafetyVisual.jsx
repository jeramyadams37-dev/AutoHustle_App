import { AlertTriangle } from 'lucide-react';

// Small red safety visual: a simple schematic illustration based on the warning type.
export default function SafetyVisual({ warning }) {
  const t = (warning.title || '').toLowerCase();
  let svg;
  if (t.includes('battery') || t.includes('disconnect')) {
    svg = (
      <svg viewBox="0 0 120 80" width="100%" style={{ maxHeight: 90 }} xmlns="http://www.w3.org/2000/svg">
        <rect x="20" y="25" width="50" height="40" rx="5" fill="#3f1d1d" stroke="#ef4444" strokeWidth="2" />
        <rect x="28" y="20" width="10" height="8" fill="#ef4444" />
        <rect x="52" y="20" width="10" height="8" fill="#1c1917" stroke="#ef4444" />
        <text x="33" y="50" fontSize="9" fill="#fca5a5" fontWeight="700">+</text>
        <text x="56" y="50" fontSize="9" fill="#fca5a5" fontWeight="700">−</text>
        <path d="M78 45 L100 45 M95 40 L100 45 L95 50" stroke="#22c55e" strokeWidth="2" fill="none" />
        <text x="89" y="62" fontSize="7" fill="#22c55e">NEG FIRST</text>
      </svg>
    );
  } else if (t.includes('jack') || t.includes('stand') || t.includes('lift')) {
    svg = (
      <svg viewBox="0 0 120 80" width="100%" style={{ maxHeight: 90 }} xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="55" width="100" height="6" fill="#3f3530" />
        <path d="M30 55 L40 30 L60 30 L70 55" fill="none" stroke="#ef4444" strokeWidth="2" />
        <rect x="44" y="34" width="12" height="14" fill="#3f1d1d" stroke="#ef4444" strokeWidth="1.5" />
        <text x="60" y="22" fontSize="7" fill="#fca5a5">JACK STAND</text>
      </svg>
    );
  } else if (t.includes('fuel')) {
    svg = (
      <svg viewBox="0 0 120 80" width="100%" style={{ maxHeight: 90 }} xmlns="http://www.w3.org/2000/svg">
        <rect x="35" y="20" width="50" height="45" rx="6" fill="#3f1d1d" stroke="#ef4444" strokeWidth="2" />
        <path d="M60 20 L60 12 M55 14 L65 14" stroke="#ef4444" strokeWidth="2" />
        <text x="60" y="48" textAnchor="middle" fontSize="8" fill="#fca5a5" fontWeight="700">RELIEVE</text>
        <text x="60" y="58" textAnchor="middle" fontSize="8" fill="#fca5a5" fontWeight="700">PRESSURE</text>
      </svg>
    );
  } else if (t.includes('airbag') || t.includes('srs')) {
    svg = (
      <svg viewBox="0 0 120 80" width="100%" style={{ maxHeight: 90 }} xmlns="http://www.w3.org/2000/svg">
        <circle cx="60" cy="42" r="26" fill="#3f1d1d" stroke="#ef4444" strokeWidth="2" />
        <text x="60" y="40" textAnchor="middle" fontSize="11" fill="#fca5a5" fontWeight="800">SRS</text>
        <text x="60" y="52" textAnchor="middle" fontSize="7" fill="#fca5a5">DISCONNECT</text>
      </svg>
    );
  } else {
    svg = (
      <svg viewBox="0 0 120 80" width="100%" style={{ maxHeight: 90 }} xmlns="http://www.w3.org/2000/svg">
        <path d="M60 12 L102 70 L18 70 Z" fill="#3f1d1d" stroke="#ef4444" strokeWidth="2" />
        <text x="60" y="58" textAnchor="middle" fontSize="22" fill="#fca5a5" fontWeight="800">!</text>
      </svg>
    );
  }

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3 flex gap-3">
      <div className="shrink-0 w-20 sm:w-24">{svg}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-red-400 font-display font-semibold uppercase text-sm tracking-wide">
          <AlertTriangle size={15} /> {warning.title}
        </div>
        <p className="text-sm text-red-200/80 mt-1 leading-snug">{warning.text}</p>
      </div>
    </div>
  );
}
