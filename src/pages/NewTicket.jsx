import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Car, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { goBackOrHome } from '@/lib/goBack';
import NoKeyNotice from '@/components/NoKeyNotice';

const empty = { year: '', make: '', model: '', trim: '', engine: '', mileage: '' };

export default function NewTicket() {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(empty);
  const [symptoms, setSymptoms] = useState('');
  const [dtcs, setDtcs] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 50 });
        setVehicles(page.items || []);
      } catch (e) {}
    })();
  }, []);

  const submit = async () => {
    setError('');
    if (!symptoms.trim()) { setError('Describe the symptom first.'); return; }
    let v = vehicle;
    let vId = selectedId;
    if (selectedId) {
      v = vehicles.find((x) => x.id === selectedId) || vehicle;
    } else {
      if (!vehicle.make || !vehicle.model || !vehicle.year) { setError('Enter at least year, make, and model — or pick a saved vehicle.'); return; }
    }
    setLoading(true);
    try {
      if (!selectedId) {
        const created = await base44.entities.Vehicle.create(v);
        vId = created.id;
      }
      const res = await base44.functions.invoke('generateTicket', { vehicle: v, symptoms, dtcs });
      const ticketData = res.data?.ticket_data;
      const illustrations = res.data?.illustrations || {};
      if (!ticketData) throw new Error(res.data?.error || 'Ticket generation failed');
      const summary = [v.year, v.make, v.model, v.trim, v.engine].filter(Boolean).join(' ');
      const ticket = await base44.entities.Ticket.create({
        vehicle_id: vId,
        vehicle_summary: summary,
        year: v.year, make: v.make, model: v.model, trim: v.trim, engine: v.engine, mileage: v.mileage,
        symptoms, dtcs,
        ticket_data: ticketData,
        illustrations,
        checklist_state: { items: {}, parts: {} },
        chat: [],
        status: 'open',
      });
      navigate(`/ticket/${ticket.id}`);
    } catch (e) {
      setError(e.message || 'Something went wrong generating the ticket.');
      setLoading(false);
    }
  };

  const field = (key, placeholder) => (
    <input
      value={vehicle[key]}
      onChange={(e) => { setVehicle({ ...vehicle, [key]: e.target.value }); setSelectedId(''); }}
      placeholder={placeholder}
      className="w-full bg-zinc-950 border border-border rounded-xl px-3.5 py-3 text-base outline-none focus:border-primary"
    />
  );

  return (
    <div className="min-h-screen px-5 pt-4">
      <button onClick={() => goBackOrHome(navigate)} className="tap-target inline-flex items-center gap-1 text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft size={18} /> Back
      </button>
      <h1 className="font-display font-bold text-3xl">New Diagnostic Ticket</h1>
      <p className="text-muted-foreground text-sm mt-1">Tell the AI what you're working on. It builds a full shop ticket.</p>

      {loading ? (
        <div className="mt-16 flex flex-col items-center justify-center text-center">
          <Loader2 size={40} className="text-primary animate-spin mb-4" />
          <p className="font-display font-semibold uppercase tracking-wide text-primary">Building your shop ticket…</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">The master mechanic is drawing up specs, ranked causes, test steps, wiring, and repair procedures.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-5 pb-4">
          {/* Saved vehicles */}
          {vehicles.length > 0 && (
            <div>
              <label className="text-xs uppercase font-display tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2"><Car size={14} /> Saved Vehicle (optional)</label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  onClick={() => setSelectedId('')}
                  className={`shrink-0 tap-target px-3 py-2 rounded-xl border text-sm ${!selectedId ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}
                >
                  <Plus size={14} className="inline mr-1" /> New
                </button>
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedId(v.id)}
                    className={`shrink-0 tap-target px-3 py-2 rounded-xl border text-sm whitespace-nowrap ${selectedId === v.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card'}`}
                  >
                    {[v.year, v.make, v.model].filter(Boolean).join(' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle fields */}
          {!selectedId && (
            <div>
              <label className="text-xs uppercase font-display tracking-wide text-muted-foreground mb-2 block">Vehicle</label>
              <div className="grid grid-cols-3 gap-2">
                {field('year', 'Year')}
                {field('make', 'Make')}
                {field('model', 'Model')}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {field('trim', 'Trim (opt.)')}
                {field('engine', 'Engine (opt.)')}
              </div>
              <div className="mt-2">{field('mileage', 'Mileage (opt.)')}</div>
            </div>
          )}

          {/* Symptoms */}
          <div>
            <label className="text-xs uppercase font-display tracking-wide text-muted-foreground mb-2 block">Symptoms *</label>
            <textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={4}
              placeholder="e.g. Starts on a jump, then stalls and loses power while driving. Ticking noise from the engine bay."
              className="w-full bg-zinc-950 border border-border rounded-xl px-3.5 py-3 text-base outline-none focus:border-primary resize-none"
            />
          </div>

          {/* DTCs */}
          <div>
            <label className="text-xs uppercase font-display tracking-wide text-muted-foreground mb-2 block">DTCs (optional)</label>
            <input
              value={dtcs}
              onChange={(e) => setDtcs(e.target.value)}
              placeholder="e.g. P0562, P0620"
              className="w-full bg-zinc-950 border border-border rounded-xl px-3.5 py-3 text-base text-mono outline-none focus:border-primary"
            />
          </div>

          {error && (String(error).includes('API Keys') || String(error).includes('missing_gemini_key') ? <NoKeyNotice /> : <p className="text-sm text-red-400">{error}</p>)}

          <button
            onClick={submit}
            className="tap-target w-full rounded-2xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-lg py-4 shadow-lg shadow-primary/20 active:scale-[0.99] transition"
          >
            Generate Shop Ticket
          </button>
        </div>
      )}
    </div>
  );
}
