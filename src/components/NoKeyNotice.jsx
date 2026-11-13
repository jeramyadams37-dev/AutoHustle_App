// Shown when a backend call fails because the user has no Gemini key saved.
// Links straight to Settings → API Keys so the fix is one tap away.
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

export default function NoKeyNotice({ message }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <div className="flex items-center gap-2 font-display font-semibold uppercase tracking-wide text-amber-300">
        <KeyRound size={16} /> Gemini key needed
      </div>
      <p className="text-muted-foreground mt-1.5 leading-relaxed">
        {message || 'Add your free Gemini key to run a diagnosis. It takes about a minute and the key stays on your phone.'}
      </p>
      <Link
        to="/settings"
        className="tap-target mt-3 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm px-4 py-2.5"
      >
        <KeyRound size={16} /> Add my free key
      </Link>
    </div>
  );
}
