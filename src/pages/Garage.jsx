import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Plus, Wrench, ArrowRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function Garage() {
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [vp, tp] = await Promise.all([
          base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 50 }),
          base44.entities.Ticket.filter({}, { sort: '-created_date', limit: 50, fields: ['id', 'vehicle_id', 'vehicle_summary', 'symptoms', 'created_date'] }),
        ]);
        setVehicles(vp.items || []);
        setTickets(tp.items || []);
      } catch (e) {} finally { setLoading(false); }
    })();
  }, []);

  const ticketsFor = (vid) => tickets.filter((t) => t.vehicle_id === vid);

  return (
    <div className="min-h-screen px-5 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-3xl">My Garage</h1>
        <Link to="/new" className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide">
          <Plus size={18} /> New
        </Link>
      </div>

      {loading ? (
        <div className="mt-16 flex justify-center"><Loader2 className="text-primary animate-spin" /></div>
      ) : vehicles.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
          <Car size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground text-sm">Your garage is empty.</p>
          <Link to="/new" className="mt-3 inline-flex items-center gap-1 text-primary text-sm">Start your first ticket <ArrowRight size={14} /></Link>
        </div>
      ) : (
        <div className="mt-5 space-y-5 pb-4">
          {vehicles.map((v) => {
            const vTickets = ticketsFor(v.id);
            return (
              <div key={v.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="p-4 bg-zinc-900/40 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Wrench size={18} className="text-primary" />
                    <div>
                      <div className="font-display font-semibold">{[v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')}</div>
                      {v.engine && <div className="text-xs text-mono text-muted-foreground">{v.engine}{v.mileage ? ` · ${v.mileage} mi` : ''}</div>}
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  {vTickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground px-1 py-2">No tickets yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {vTickets.map((t) => (
                        <Link key={t.id} to={`/ticket/${t.id}`} className="block rounded-xl border border-border bg-zinc-950 p-3 hover:border-primary/40 transition">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium line-clamp-1">{t.symptoms}</span>
                            <ArrowRight size={15} className="text-muted-foreground shrink-0" />
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">{new Date(t.created_date).toLocaleDateString()}</div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
