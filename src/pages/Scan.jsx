// v10: Live Scan — ported from the Bluetooth MVP debug build.
// Flow (same as the MVP): connect to the ELM327 adapter -> read trouble
// codes -> if none, stop and say the vehicle looks clean -> read live data
// (RPM, coolant temp, ...) -> POST { codes, liveData, vehicle } to the
// backend /diagnose endpoint -> show urgency, plain-language summary,
// likely causes, estimated cost and the recommended next step.
// If the native Obd2 plugin is not in this build, the screen offers a
// clearly-labelled DEMO scan so the flow can still be tried.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bluetooth, Loader2, ArrowLeft, Wrench } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { diagnoseLive } from '@/lib/gemini';
import { goBackOrHome } from '@/lib/goBack';
import {
  connectObd2,
  readObd2Codes,
  readObd2LiveData,
  isObd2Available,
  demoLiveData,
  demoCodes,
} from '@/lib/obd2';

export default function Scan() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Not connected');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [liveData, setLiveData] = useState(null);
  const [codes, setCodes] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  const [cleanScan, setCleanScan] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 50 });
        const list = page.items || [];
        setVehicles(list);
        if (list.length) setVehicleId(list[0].id);
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const vehicle = vehicles.find((v) => v.id === vehicleId) || null;

  const runScan = async (demo = false) => {
    setScanning(true);
    setResult(null);
    setLiveData(null);
    setCodes([]);
    setCleanScan(false);
    setIsDemo(demo);
    try {
      let codeRes;
      let live;
      if (demo) {
        setStatus('Demo scan — no adapter connected');
        codeRes = demoCodes();
        live = demoLiveData();
      } else {
        setStatus('Connecting...');
        await connectObd2();
        setStatus('Reading codes...');
        codeRes = await readObd2Codes();
        if (!codeRes.codes || codeRes.codes.length === 0) {
          // AH-H4: a clean scan used to stop here — no live data, no
          // ticket link. Still read live data and offer a ticket.
          setStatus('No trouble codes found. Vehicle looks clean.');
          setCodes([]);
          try {
            live = await readObd2LiveData();
            setLiveData(live);
          } catch (err) {
            // Live data unreadable; the clean status above still stands.
          }
          setCleanScan(true);
          setScanning(false);
          return;
        }
        live = await readObd2LiveData();
      }
      setCodes(codeRes.codes || []);
      setLiveData(live);
      setStatus('Getting diagnosis...');
      const diagnosis = await diagnoseLive({
        codes: codeRes.codes || [],
        liveData: live,
        vehicle: vehicle ? { year: vehicle.year, make: vehicle.make, model: vehicle.model, engine: vehicle.engine } : {},
      });
      setResult(diagnosis);
      setStatus('Diagnosis complete');
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
    setScanning(false);
  };

  const vehicleSummary = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
    : 'No vehicle selected';

  return (
    <div className="min-h-screen px-5 pt-5 pb-6">
      <button onClick={() => goBackOrHome(navigate)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="mt-3 font-display font-bold text-3xl flex items-center gap-2">
        <Bluetooth size={26} className="text-primary" /> Live Scan
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect to your ELM327 adapter, read the codes and live data, and get a diagnosis from the backend.
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Vehicle</label>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          >
            {vehicles.length === 0 && <option value="">No saved vehicles — add one from New Ticket</option>}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {[v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm">Status: <span className="font-medium">{status}</span></p>
        <button
          onClick={() => runScan(false)}
          disabled={scanning}
          className="tap-target w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-lg py-3 disabled:opacity-60"
        >
          {scanning ? <Loader2 size={20} className="animate-spin" /> : <Bluetooth size={20} />}
          {scanning ? 'Scanning...' : 'Scan Vehicle'}
        </button>
        {!isObd2Available() && (
          <button
            onClick={() => runScan(true)}
            disabled={scanning}
            className="tap-target w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
          >
            Try a demo scan (no adapter — sample P0300 + live data)
          </button>
        )}
        {codes.length > 0 && (
          <p className="text-sm">Codes found: <span className="text-mono font-bold">{codes.join(', ')}</span></p>
        )}
        {liveData && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-background border border-border p-2">
              <div className="font-display font-bold text-base">{liveData.rpm ?? '—'}</div>
              <div className="text-muted-foreground">RPM</div>
            </div>
            <div className="rounded-xl bg-background border border-border p-2">
              <div className="font-display font-bold text-base">{liveData.coolantTempC ?? '—'}°C</div>
              <div className="text-muted-foreground">Coolant</div>
            </div>
            <div className="rounded-xl bg-background border border-border p-2">
              <div className="font-display font-bold text-base">{liveData.batteryVoltage ?? '—'}V</div>
              <div className="text-muted-foreground">Battery</div>
            </div>
          </div>
        )}
      </div>

      {cleanScan && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 space-y-3">
          <h3 className="font-display font-bold text-xl">No trouble codes</h3>
          <p className="text-sm leading-relaxed">No codes stored — the live readings above are from this vehicle. If something still feels wrong (a noise, a smell, a hesitation), start a ticket and describe it.</p>
          <Link
            to="/new"
            state={{ vehicleId, dtcs: '' }}
            className="tap-target mt-1 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide px-4 py-2.5"
          >
            <Wrench size={16} /> Start a ticket for this vehicle
          </Link>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 space-y-3">
          {isDemo && <p className="text-xs font-bold uppercase tracking-wide text-primary">Demo result — sample data, not your car</p>}
          <h3 className="font-display font-bold text-xl">Urgency: {result.urgency}</h3>
          <p className="text-sm leading-relaxed">{result.plain_language_summary}</p>
          {result.likely_causes?.length > 0 && (
            <div>
              <h4 className="font-display font-semibold uppercase text-sm tracking-wide">Likely causes</h4>
              <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
                {result.likely_causes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
          <p className="text-sm"><strong>Estimated cost:</strong> {result.estimated_cost_range_usd}</p>
          <p className="text-sm"><strong>Next step:</strong> {result.recommended_next_step}</p>
          <Link
            to="/new"
            state={{ vehicleId, dtcs: codes.join(', ') }}
            className="tap-target mt-1 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide px-4 py-2.5"
          >
            <Wrench size={16} /> Start a shop ticket for {vehicleSummary}
          </Link>
        </div>
      )}
    </div>
  );
}
