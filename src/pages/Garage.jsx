import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Plus, Wrench, ArrowRight, Loader2, CalendarClock, Trash2 } from 'lucide-react';
import { vehicleDeleteConfirmText, ticketIdsForVehicle } from '@/lib/vehicleDelete';
import { base44 } from '@/api/base44Client';
import GarageBackup from '@/components/GarageBackup';

export default function Garage() {
  const [vehicles, setVehicles] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [vp, tp] = await Promise.all([
        base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 50 }),
        base44.entities.Ticket.filter({}, { sort: '-created_date', limit: 50, fields: ['id', 'vehicle_id', 'vehicle_summary', 'symptoms', 'created_date'] }),
      ]);
      setVehicles(vp.items || []);
      setTickets(tp.items || []);
    } catch (e) {
      // AH-H5: a failed load used to look like an empty garage ("0 vehicles").
      setError('Could not load your garage — check your connection and try again.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // AH-B2: deleting a vehicle deletes its tickets too (see
  // src/lib/vehicleDelete.js — an orphan ticket would point at a
  // vehicle that no longer exists). The confirm names the ticket
  // count, so nothing is deleted silently.
  const deleteVehicle = async (v) => {
    const vTickets = ticketsFor(v.id);
    const name = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'this vehicle';
    if (!window.confirm(vehicleDeleteConfirmText(name, vTickets.length))) return;
    setDeleting(v.id);
    setError('');
    try {
      for (const tid of ticketIdsForVehicle(tickets, v.id)) {
        await base44.entities.Ticket.delete(tid);
      }
      await base44.entities.Vehicle.delete(v.id);
      setTickets((ts) => ts.filter((t) => t.vehicle_id !== v.id));
      setVehicles((vs) => vs.filter((x) => x.id !== v.id));
    } catch (e) {
      setError('Could not delete that vehicle — check your connection and try again.');
    } finally { setDeleting(''); }
  };

  const ticketsFor = (vid) => tickets.filter((t) => t.vehicle_id === vid);

  return (
    <div className="min-h-screen px-5 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-3xl">My Garage</h1>
        <Link to="/new" className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide">
          <Plus size={18} /> New
        </Link>
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}{' '}
          <button onClick={load} className="font-semibold text-primary">Retry</button>
        </div>
      )}
      <Link to="/service-scheduler" className="tap-target mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-zinc-950 py-3 font-display font-bold uppercase tracking-wide text-sm">
        <CalendarClock size={16} /> Scheduled services
      </Link>
      <GarageBackup />

      {loading ? (
        <div className="mt-16 flex justify-center"><Loader2 className="text-primary animate-spin" /></div>
      ) : !error && vehicles.length === 0 ? (
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
                    <button onClick={() => deleteVehicle(v)} disabled={deleting === v.id} aria-label={`Delete ${[v.year, v.make, v.model].filter(Boolean).join(' ') || 'vehicle'}`} className="tap-target p-2 text-muted-foreground hover:text-red-400 disabled:opacity-50 shrink-0" title="Delete vehicle">
                      <Trash2 size={16} />
                    </button>
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
