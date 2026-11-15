// Terms & Disclaimer — the full liability clause, verbatim.
// Linked from Subscribe (before paying) and from Settings (/api-keys).
// This is a draft, not legal advice — have a local attorney review it
// before relying on it.
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { goBackOrHome } from '@/lib/goBack';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-5 pt-4 pb-10">
      <button onClick={() => goBackOrHome(navigate)} className="tap-target inline-flex items-center gap-1 text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft size={18} /> Back
      </button>
      <div className="flex items-center gap-2 text-primary">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
          <Wrench size={20} strokeWidth={2.5} />
        </div>
        <span className="font-display font-bold uppercase tracking-widest text-sm">Auto-Hustle</span>
      </div>
      <h1 className="mt-5 font-display font-bold text-3xl leading-tight">
        Terms &amp; Disclaimer
      </h1>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4 space-y-4 text-[15px] leading-relaxed">
        <p>
          IMPORTANT — READ BEFORE USE. AutoHustle is an informational tool only. Its
          diagnostics, repair guidance, torque specifications, parts prices, and cost
          estimates are general information, not professional mechanical advice, and are
          not a substitute for a qualified mechanic.
        </p>
        <p>
          Always verify all specifications against your vehicle&apos;s manufacturer manual,
          and have any work checked by a qualified professional before driving the
          vehicle. You use AutoHustle, and follow any guidance it provides, entirely at
          your own risk.
        </p>
        <p>
          To the fullest extent permitted by law, AtotheI and Jeramy Adams assume no
          liability for any damage, injury, loss, cost, or lost earnings resulting from
          the use of the app, its diagnostics, or any repair performed based on its
          guidance, whether in whole or in part. No warranty is made as to the accuracy
          or completeness of any code reading, specification, estimate, or recommendation.
        </p>
      </div>
    </div>
  );
}
