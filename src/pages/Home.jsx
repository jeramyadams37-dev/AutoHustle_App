import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wrench, PlusCircle, SearchCode, Car, ArrowRight, Zap, ListChecks, MessageSquare, Bluetooth, ClipboardCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ tickets: 0, vehicles: 0 });
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [tc, vc, tpage] = await Promise.all([
          base44.entities.Ticket.count({}),
          base44.entities.Vehicle.count({}),
          base44.entities.Ticket.filter({}, { sort: '-created_date', limit: 3, fields: ['id', 'vehicle_summary', 'symptoms', 'created_date'] }),
        ]);
        setStats({ tickets: tc, vehicles: vc });
        setRecent(tpage.items || []);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 grain opacity-60" />
        <div className="relative px-5 pt-10 pb-8">
          <div className="flex items-center gap-2 text-primary">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Wrench size={20} strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold uppercase tracking-widest text-sm">Auto-Hustle</span>
          </div>
          <h1 className="mt-5 font-display font-bold text-4xl leading-[1.05]">
            AI Mechanic<br /><span className="text-primary">in your pocket.</span>
          </h1>
          <p className="mt-3 text-muted-foreground text-[15px] leading-relaxed max-w-sm">
            Powered by AuroraOS Master Mechanic. Turn your vehicle and a symptom into a pro diagnostic shop ticket, repair guide, and interactive checklist.
          </p>
          <button
            onClick={() => navigate('/new')}
            className="tap-target mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-lg py-4 shadow-lg shadow-primary/20 active:scale-[0.99] transition"
          >
            <PlusCircle size={22} /> Start a Diagnostic Ticket
          </button>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Link to="/pre-shift" className="tap-target rounded-2xl border border-primary/40 bg-primary/10 p-4 flex flex-col gap-1 hover:border-primary/60 transition">
              <ClipboardCheck size={20} className="text-primary" />
              <span className="font-display font-semibold uppercase text-sm tracking-wide">Pre-Shift Check</span>
              <span className="text-xs text-muted-foreground">Is this car safe to earn with today?</span>
            </Link>
            <Link to="/scan" className="tap-target rounded-2xl border border-border bg-card p-4 flex flex-col gap-1 hover:border-primary/40 transition">
              <Bluetooth size={20} className="text-primary" />
              <span className="font-display font-semibold uppercase text-sm tracking-wide">Live Scan</span>
              <span className="text-xs text-muted-foreground">ELM327 codes + live data</span>
            </Link>
            <Link to="/codes" className="tap-target rounded-2xl border border-border bg-card p-4 flex flex-col gap-1 hover:border-primary/40 transition">
              <SearchCode size={20} className="text-primary" />
              <span className="font-display font-semibold uppercase text-sm tracking-wide">OBD2 Lookup</span>
              <span className="text-xs text-muted-foreground">Decode any DTC</span>
            </Link>
            <Link to="/garage" className="tap-target rounded-2xl border border-border bg-card p-4 flex flex-col gap-1 hover:border-primary/40 transition">
              <Car size={20} className="text-primary" />
              <span className="font-display font-semibold uppercase text-sm tracking-wide">My Garage</span>
              <span className="text-xs text-muted-foreground">{stats.vehicles} vehicles · {stats.tickets} tickets</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent tickets */}
      <div className="px-5 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold uppercase tracking-wide text-sm text-muted-foreground">Recent Tickets</h2>
          <Link to="/garage" className="text-xs text-primary inline-flex items-center gap-1">All <ArrowRight size={13} /></Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
            No tickets yet. Start your first diagnosis above.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <Link key={t.id} to={`/ticket/${t.id}`} className="block rounded-2xl border border-border bg-card p-3.5 hover:border-primary/40 transition">
                <div className="font-display font-semibold text-sm">{t.vehicle_summary}</div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.symptoms}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Feature strip */}
      <div className="px-5 pb-10">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: ListChecks, label: 'Interactive checklist + AI re-rank' },
            { icon: Zap, label: 'Wiring & belt diagrams' },
            { icon: MessageSquare, label: 'Ask the Mechanic chat' },
          ].map((f, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 text-center">
              <f.icon size={20} className="mx-auto text-primary mb-1.5" />
              <p className="text-[11px] text-muted-foreground leading-tight">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
