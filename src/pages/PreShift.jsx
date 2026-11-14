// v10: Driver Uptime — Pre-Shift Check.
// For delivery / rideshare drivers: the car IS the income. A breakdown
// mid-shift costs the whole day's earnings, so this screen answers one
// question before a shift: is this car safe to drive for work today?
// Checks (cheap first, like the rest of the app):
//  1. Trouble codes — misfire codes P0300–P0304 are a fail.
//  2. Overheating risk — coolant temp (PID 0105) over 105°C is a fail,
//     95–105°C is a warning.
//  3. Battery — under 12.4V resting / under 13.5V running is a warning.
//  4. Recent tickets — a ticket in the last 7 days is a warning.
// Live readings come from the ELM327 adapter when it is connected
// (see src/lib/obd2.js); without it the driver answers the three
// manual questions and the check still works, marked as manual.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Loader2, Wrench, ClipboardCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { readObd2Codes, readObd2LiveData, connectObd2, isObd2Available } from '@/lib/obd2';

const MISFIRE_CODES = ['P0300', 'P0301', 'P0302', 'P0303', 'P0304', 'P0305', 'P0306', 'P0307', 'P0308'];

export default function PreShift() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [earnings, setEarnings] = useState('180');
  const [running, setRunning] = useState(false);
  const [checks, setChecks] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [liveUsed, setLiveUsed] = useState(false);
  const [manual, setManual] = useState({ warningLight: false, tempGaugeHigh: false, slowCrank: false });
  const [odometer, setOdometer] = useState('');

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
  // Pre-fill the odometer from the vehicle's last known mileage.
  // The driver can still edit it; a blank field stays blank.
  useEffect(() => {
    const v = vehicles.find((x) => x.id === vehicleId) || null;
    setOdometer((prev) => (prev === '' && v && v.mileage ? String(v.mileage) : prev));
  }, [vehicleId, vehicles]);

  const vehicle = vehicles.find((v) => v.id === vehicleId) || null;
  const vehicleSummary = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
    : 'No vehicle selected';

  const runCheck = async () => {
    setRunning(true);
    setChecks(null);
    setVerdict(null);
    let codes = [];
    let live = null;
    let usedLive = false;
    if (isObd2Available()) {
      try {
        await connectObd2();
        const c = await readObd2Codes();
        codes = c.codes || [];
        live = await readObd2LiveData();
        usedLive = true;
      } catch (e) {
        // Fall through to manual answers if the adapter is not reachable.
      }
    }
    setLiveUsed(usedLive);

    const misfire = codes.filter((c) => MISFIRE_CODES.includes(String(c).toUpperCase()));
    const coolant = live?.coolantTempC ?? null;
    const voltage = live?.batteryVoltage ?? null;

    const list = [];
    // 1. Trouble codes / misfire
    if (misfire.length) {
      list.push({ name: 'Misfire codes', status: 'fail', detail: `${misfire.join(', ')} — misfire can strand you mid-shift.` });
    } else if (codes.length) {
      list.push({ name: 'Trouble codes', status: 'warn', detail: `${codes.join(', ')} — not a misfire, but get it diagnosed.` });
    } else if (manual.warningLight) {
      list.push({ name: 'Warning lights', status: 'warn', detail: 'A warning light is on — run a Live Scan before your shift.' });
    } else {
      list.push({ name: 'Trouble codes', status: 'pass', detail: usedLive ? 'No codes from the adapter.' : 'No warning lights reported.' });
    }
    // 2. Overheating
    if (coolant !== null) {
      if (coolant > 105) list.push({ name: 'Coolant temp', status: 'fail', detail: `${coolant}°C — overheating risk. Do not drive for work.` });
      else if (coolant >= 95) list.push({ name: 'Coolant temp', status: 'warn', detail: `${coolant}°C — running hot. Watch the gauge.` });
      else list.push({ name: 'Coolant temp', status: 'pass', detail: `${coolant}°C — normal.` });
    } else if (manual.tempGaugeHigh) {
      list.push({ name: 'Coolant temp', status: 'warn', detail: 'Temp gauge reading high — check coolant before driving.' });
    } else {
      list.push({ name: 'Coolant temp', status: 'pass', detail: 'Gauge normal (manual check).' });
    }
    // 3. Battery
    if (voltage !== null) {
      if (voltage < 12.4) list.push({ name: 'Battery', status: 'warn', detail: `${voltage}V — weak. A no-start costs a shift.` });
      else list.push({ name: 'Battery', status: 'pass', detail: `${voltage}V — healthy.` });
    } else if (manual.slowCrank) {
      list.push({ name: 'Battery', status: 'warn', detail: 'Slow crank reported — battery may be weak.' });
    } else {
      list.push({ name: 'Battery', status: 'pass', detail: 'Cranks normally (manual check).' });
    }
    // 4. Recent tickets
    try {
      const tickets = await base44.entities.Ticket.filter({ vehicle_id: vehicleId }, { sort: '-created_date', limit: 5 });
      const recent = (tickets.items || []).filter((t) => Date.now() - new Date(t.created_date).getTime() < 7 * 24 * 60 * 60 * 1000);
      if (recent.length) {
        list.push({ name: 'Recent tickets', status: 'warn', detail: `${recent.length} ticket(s) in the last 7 days — ${recent[0].symptoms || 'unresolved work'}.` });
      } else {
        list.push({ name: 'Recent tickets', status: 'pass', detail: 'No tickets in the last 7 days.' });
      }
    } catch (e) {
      list.push({ name: 'Recent tickets', status: 'pass', detail: 'No ticket history found.' });
    }

    setChecks(list);
    const fails = list.filter((c) => c.status === 'fail').length;
    const warns = list.filter((c) => c.status === 'warn').length;
    const v = fails > 0 ? 'fail' : warns > 0 ? 'warn' : 'pass';
    setVerdict(v);
    // Fleet: remember this run so the Fleet dashboard can show the latest
    // verdict per vehicle. On-device only — nothing leaves the phone.
    try {
      const odoParsed = parseInt(odometer, 10);
      const odoVal = Number.isFinite(odoParsed) && odoParsed > 0 ? odoParsed : null;
      const risk = v === 'fail' ? daily : v === 'warn' ? Math.round(daily / 2) : 0;
      base44.entities.PreShiftCheck.create({
        vehicle_id: vehicleId, verdict: v, checks: list,
        earnings: daily, at_risk: risk, live_used: usedLive, odometer: odoVal,
      });
      // Fleet: a higher odometer moves the vehicle's mileage forward so
      // cost/mile stays right. Never lower it.
      if (odoVal !== null && vehicle && Number(vehicle.mileage || 0) < odoVal) {
        try { await base44.entities.Vehicle.update(vehicleId, { mileage: odoVal }); } catch (e2) { /* ignore */ }
      }
    } catch (e) { /* fleet history is best-effort; the check itself already ran */ }
    setRunning(false);
  };

  const daily = parseFloat(earnings) || 0;
  const atRisk = verdict === 'fail' ? daily : verdict === 'warn' ? Math.round(daily / 2) : 0;

  const iconFor = (status) =>
    status === 'pass' ? <CheckCircle2 size={18} className="text-green-500 shrink-0" />
    : status === 'warn' ? <AlertTriangle size={18} className="text-amber-500 shrink-0" />
    : <XCircle size={18} className="text-red-500 shrink-0" />;

  return (
    <div className="min-h-screen px-5 pt-5 pb-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="mt-3 font-display font-bold text-3xl flex items-center gap-2">
        <ClipboardCheck size={26} className="text-primary" /> Pre-Shift Check
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Two minutes before your shift: is {vehicleSummary} safe to earn with today?
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
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Expected earnings today ($)</label>
          <input
            type="number"
            inputMode="decimal"
            value={earnings}
            onChange={(e) => setEarnings(e.target.value)}
            className="tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Odometer reading (mi)</label>
          <input
            type="number"
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            placeholder={vehicle && vehicle.mileage ? `Last known: ${Number(vehicle.mileage).toLocaleString('en-US')} mi` : 'Odometer now'}
            className="tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={manual.warningLight} onChange={(e) => setManual({ ...manual, warningLight: e.target.checked })} /> A warning light is on</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={manual.tempGaugeHigh} onChange={(e) => setManual({ ...manual, tempGaugeHigh: e.target.checked })} /> Temp gauge reads high</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={manual.slowCrank} onChange={(e) => setManual({ ...manual, slowCrank: e.target.checked })} /> Slow or weak crank on start</label>
        </div>
        <button
          onClick={runCheck}
          disabled={running || !vehicleId}
          className="tap-target w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-lg py-3 disabled:opacity-60"
        >
          {running ? <Loader2 size={20} className="animate-spin" /> : <ClipboardCheck size={20} />}
          {running ? 'Checking...' : 'Run Pre-Shift Check'}
        </button>
        {isObd2Available() && <p className="text-xs text-muted-foreground">Adapter connected — live codes, coolant temp and battery voltage will be read.</p>}
      </div>

      {checks && (
        <div className="mt-4 space-y-3">
          <div className={`rounded-2xl border p-4 text-center ${verdict === 'pass' ? 'border-green-500/40 bg-green-500/10' : verdict === 'warn' ? 'border-amber-500/40 bg-amber-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
            <div className="font-display font-bold text-2xl uppercase">
              {verdict === 'pass' ? 'Go — drive' : verdict === 'warn' ? 'Caution' : 'Do not drive for work'}
            </div>
            <p className="text-sm mt-1">
              {verdict === 'pass'
                ? 'Nothing found. Your shift is safe to run.'
                : `About $${atRisk} of today's $${daily} is at risk${verdict === 'fail' ? ' — a breakdown mid-shift costs the whole day.' : ' if this gets worse mid-shift.'}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{liveUsed ? 'Checked with live adapter data.' : 'Checked manually — connect the adapter for live readings.'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            {checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {iconFor(c.status)}
                <div>
                  <div className="font-display font-semibold text-sm">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
              </div>
            ))}
          </div>
          {verdict !== 'pass' && (
            <Link
              to="/new"
              state={{ vehicleId }}
              className="tap-target w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide py-3"
            >
              <Wrench size={18} /> Start a ticket for {vehicleSummary}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
