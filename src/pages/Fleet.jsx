// Fleet — Pro-only fleet management (on-device only, no server).
// Dashboard: every garage vehicle with its latest pre-shift verdict,
// assigned driver, next service due, costs and downtime.
// Records (all localStorage via base44 entities):
//   Vehicle       — fleet_driver_name, fleet_driver_phone,
//                   service_miles_every, service_miles_next, service_date_next
//   PreShiftCheck — saved by PreShift.jsx after every check run
//   FleetCost     — { vehicle_id, category, amount, date, note }
//   FleetDowntime — { vehicle_id, start_date, end_date, reason }
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Truck, CheckCircle2, AlertTriangle, XCircle, Users, DollarSign, CalendarClock, Plus, Trash2, Loader2, Car } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TierGate from '@/components/TierGate';
import {
  vehicleName, fmtMoney, fmtMiles, serviceDue, latestCheckFor,
  sumCosts, downtimeDays, costPerMile,
} from '@/lib/fleet';

const COST_CATEGORIES = [
  { value: 'parts', label: 'Parts' },
  { value: 'labor', label: 'Labor' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'other', label: 'Other' },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

function VerdictBadge({ verdict }) {
  if (verdict === 'pass') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-400 px-2 py-0.5 text-xs font-semibold"><CheckCircle2 size={13} /> GO</span>;
  }
  if (verdict === 'warn') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-xs font-semibold"><AlertTriangle size={13} /> CAUTION</span>;
  }
  if (verdict === 'fail') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-xs font-semibold"><XCircle size={13} /> DO NOT DRIVE</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 text-zinc-400 px-2 py-0.5 text-xs font-semibold">No check yet</span>;
}

export default function Fleet() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [checks, setChecks] = useState([]);
  const [costs, setCosts] = useState([]);
  const [downtime, setDowntime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [driverForm, setDriverForm] = useState({});
  const [serviceForm, setServiceForm] = useState({});
  const [costForm, setCostForm] = useState({});
  const [downForm, setDownForm] = useState({});
  const [saving, setSaving] = useState('');

  const load = async () => {
    // Each entity loads on its own so one missing table never blanks
    // the whole page (e.g. PreShiftCheck before the first saved run).
    const safe = async (fn) => {
      try { const r = await fn(); return r.items || []; } catch { return []; }
    };
    const [vp, cp, fp, dp] = await Promise.all([
      safe(() => base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 100 })),
      safe(() => base44.entities.PreShiftCheck.filter({}, { sort: '-created_date', limit: 200 })),
      safe(() => base44.entities.FleetCost.filter({}, { sort: '-date', limit: 500 })),
      safe(() => base44.entities.FleetDowntime.filter({}, { sort: '-start_date', limit: 200 })),
    ]);
    setVehicles(vp);
    setChecks(cp);
    setCosts(fp);
    setDowntime(dp);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fleetSpend = sumCosts(costs);
  const fleetDownDays = downtimeDays(downtime);
  const counts = { pass: 0, warn: 0, fail: 0, none: 0 };
  vehicles.forEach((v) => {
    const c = latestCheckFor(checks, v.id);
    if (!c) counts.none += 1;
    else counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  });

  const costsFor = (vid) => costs.filter((c) => c.vehicle_id === vid);
  const downFor = (vid) => downtime.filter((d) => d.vehicle_id === vid);
  const dForm = (v) => driverForm[v.id] || { name: v.fleet_driver_name || '', phone: v.fleet_driver_phone || '' };
  const sForm = (v) => serviceForm[v.id] || { every: v.service_miles_every || '', nextMiles: v.service_miles_next || '', nextDate: v.service_date_next || '' };
  const cForm = (v) => costForm[v.id] || { category: 'parts', amount: '', date: todayISO(), note: '' };
  const wForm = (v) => downForm[v.id] || { start: todayISO(), end: todayISO(), reason: '' };

  const updateVehicle = async (v, patch) => {
    setSaving(v.id);
    try {
      const updated = await base44.entities.Vehicle.update(v.id, patch);
      setVehicles((vs) => vs.map((x) => (x.id === v.id ? updated : x)));
    } catch (e) { /* ignore */ } finally { setSaving(''); }
  };

  const saveDriver = (v) => {
    const f = dForm(v);
    updateVehicle(v, { fleet_driver_name: f.name.trim(), fleet_driver_phone: f.phone.trim() });
  };

  const saveService = (v) => {
    const f = sForm(v);
    const every = parseInt(f.every, 10);
    let nextMiles = parseInt(f.nextMiles, 10);
    // If only the interval is set, work out the next service from the
    // odometer: mileage now + every N miles.
    if (!Number.isFinite(nextMiles) && Number.isFinite(every) && every > 0 && Number.isFinite(Number(v.mileage))) {
      nextMiles = Number(v.mileage) + every;
    }
    updateVehicle(v, {
      service_miles_every: Number.isFinite(every) && every > 0 ? every : '',
      service_miles_next: Number.isFinite(nextMiles) && nextMiles > 0 ? nextMiles : '',
      service_date_next: (f.nextDate || '').trim(),
    });
  };

  const addCost = async (v) => {
    const f = cForm(v);
    const amount = parseFloat(f.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving('cost-' + v.id);
    try {
      await base44.entities.FleetCost.create({
        vehicle_id: v.id, category: f.category, amount,
        date: f.date || todayISO(), note: (f.note || '').trim(),
      });
      setCostForm((m) => ({ ...m, [v.id]: { category: 'parts', amount: '', date: todayISO(), note: '' } }));
      await load();
    } catch (e) { /* ignore */ } finally { setSaving(''); }
  };

  const addDowntime = async (v) => {
    const f = wForm(v);
    if (!f.start || !f.end) return;
    if (new Date(f.end + 'T00:00:00') < new Date(f.start + 'T00:00:00')) return;
    setSaving('down-' + v.id);
    try {
      await base44.entities.FleetDowntime.create({
        vehicle_id: v.id, start_date: f.start, end_date: f.end, reason: (f.reason || '').trim(),
      });
      setDownForm((m) => ({ ...m, [v.id]: { start: todayISO(), end: todayISO(), reason: '' } }));
      await load();
    } catch (e) { /* ignore */ } finally { setSaving(''); }
  };

  const deleteRow = async (entity, id) => {
    try { await base44.entities[entity].delete(id); await load(); } catch (e) { /* ignore */ }
  };

  const inputCls = 'tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
  const saveBtnCls = 'tap-target w-full rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm py-2.5 disabled:opacity-60';

  const renderVehicle = (v) => {
    const check = latestCheckFor(checks, v.id);
    const vCosts = costsFor(v.id);
    const vDown = downFor(v.id);
    const total = sumCosts(vCosts);
    const days = downtimeDays(vDown);
    const cpm = costPerMile(total, v.mileage);
    const due = serviceDue(v);
    const open = openId === v.id;
    const df = dForm(v);
    const sf = sForm(v);
    const cf = cForm(v);
    const wf = wForm(v);
    return (
      <div key={v.id} className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display font-semibold">{vehicleName(v)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {v.engine ? `${v.engine} · ` : ''}{v.mileage ? fmtMiles(v.mileage) : 'Mileage not set'}
              </div>
            </div>
            <VerdictBadge verdict={check?.verdict} />
          </div>
          {check && (
            <p className="text-xs text-muted-foreground mt-2">
              Last check {new Date(check.created_date).toLocaleDateString()}
              {check.at_risk ? ` · $${check.at_risk} was at risk` : ''}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Users size={13} />
            {v.fleet_driver_name
              ? `Driven by ${v.fleet_driver_name}${v.fleet_driver_phone ? ` · ${v.fleet_driver_phone}` : ''}`
              : 'No driver assigned'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarClock size={13} /> {due.label}
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-xl border border-border bg-zinc-950 p-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Spent</div>
              <div className="font-display font-semibold text-sm">{fmtMoney(total)}</div>
            </div>
            <div className="rounded-xl border border-border bg-zinc-950 p-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Cost / mile</div>
              <div className="font-display font-semibold text-sm">{cpm === null ? '—' : `${fmtMoney(cpm)}/mi`}</div>
            </div>
            <div className="rounded-xl border border-border bg-zinc-950 p-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Downtime</div>
              <div className="font-display font-semibold text-sm">{days} day{days === 1 ? '' : 's'}</div>
            </div>
          </div>
          <button
            onClick={() => setOpenId(open ? null : v.id)}
            className="tap-target mt-3 w-full rounded-xl border border-border bg-zinc-950 py-2 text-sm font-display font-semibold uppercase tracking-wide"
          >
            {open ? 'Close' : 'Manage — driver, service, costs'}
          </button>
        </div>

        {open && (
          <div className="border-t border-border p-4 space-y-6 bg-zinc-950/40">
            {/* Driver assignment */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><Users size={16} className="text-primary" /> Driver</h3>
              <div className="mt-2 space-y-2">
                <div>
                  <label className={labelCls}>Driver name</label>
                  <input
                    value={df.name}
                    onChange={(e) => setDriverForm((m) => ({ ...m, [v.id]: { ...df, name: e.target.value } }))}
                    placeholder="Who drives this one?"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Driver phone</label>
                  <input
                    type="tel"
                    value={df.phone}
                    onChange={(e) => setDriverForm((m) => ({ ...m, [v.id]: { ...df, phone: e.target.value } }))}
                    placeholder="Phone (optional)"
                    className={inputCls}
                  />
                </div>
                <button onClick={() => saveDriver(v)} disabled={saving === v.id} className={saveBtnCls}>
                  {saving === v.id ? 'Saving…' : 'Save driver'}
                </button>
              </div>
            </div>

            {/* Service interval */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><CalendarClock size={16} className="text-primary" /> Next service</h3>
              <div className="mt-2 space-y-2">
                <div>
                  <label className={labelCls}>Service every (miles)</label>
                  <input
                    type="number" inputMode="numeric"
                    value={sf.every}
                    onChange={(e) => setServiceForm((m) => ({ ...m, [v.id]: { ...sf, every: e.target.value } }))}
                    placeholder="e.g. 5000"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Next service at odometer (mi)</label>
                  <input
                    type="number" inputMode="numeric"
                    value={sf.nextMiles}
                    onChange={(e) => setServiceForm((m) => ({ ...m, [v.id]: { ...sf, nextMiles: e.target.value } }))}
                    placeholder="Leave blank to work it out from the interval"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Next service by (date)</label>
                  <input
                    type="date"
                    value={sf.nextDate}
                    onChange={(e) => setServiceForm((m) => ({ ...m, [v.id]: { ...sf, nextDate: e.target.value } }))}
                    className={inputCls}
                  />
                </div>
                <button onClick={() => saveService(v)} disabled={saving === v.id} className={saveBtnCls}>
                  {saving === v.id ? 'Saving…' : 'Save service interval'}
                </button>
              </div>
            </div>

            {/* Costs */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><DollarSign size={16} className="text-primary" /> Costs — {fmtMoney(total)}</h3>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Category</label>
                    <select
                      value={cf.category}
                      onChange={(e) => setCostForm((m) => ({ ...m, [v.id]: { ...cf, category: e.target.value } }))}
                      className={inputCls}
                    >
                      {COST_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Amount ($)</label>
                    <input
                      type="number" inputMode="decimal" min="0" step="0.01"
                      value={cf.amount}
                      onChange={(e) => setCostForm((m) => ({ ...m, [v.id]: { ...cf, amount: e.target.value } }))}
                      placeholder="0.00"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={cf.date}
                    onChange={(e) => setCostForm((m) => ({ ...m, [v.id]: { ...cf, date: e.target.value } }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Note</label>
                  <input
                    value={cf.note}
                    onChange={(e) => setCostForm((m) => ({ ...m, [v.id]: { ...cf, note: e.target.value } }))}
                    placeholder="What was it for?"
                    className={inputCls}
                  />
                </div>
                <button onClick={() => addCost(v)} disabled={saving === 'cost-' + v.id} className={saveBtnCls}>
                  {saving === 'cost-' + v.id ? 'Adding…' : 'Log cost'}
                </button>
              </div>
              {vCosts.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {vCosts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium capitalize">{c.category}</span>
                        {c.note && <span className="text-muted-foreground"> — {c.note}</span>}
                        <div className="text-[11px] text-muted-foreground">{c.date}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-display font-semibold">{fmtMoney(c.amount)}</span>
                        <button onClick={() => deleteRow('FleetCost', c.id)} className="tap-target text-muted-foreground hover:text-red-400" aria-label="Delete cost">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Downtime */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><Truck size={16} className="text-primary" /> Downtime — {days} day{days === 1 ? '' : 's'}</h3>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Down from</label>
                    <input
                      type="date"
                      value={wf.start}
                      onChange={(e) => setDownForm((m) => ({ ...m, [v.id]: { ...wf, start: e.target.value } }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Back on</label>
                    <input
                      type="date"
                      value={wf.end}
                      onChange={(e) => setDownForm((m) => ({ ...m, [v.id]: { ...wf, end: e.target.value } }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Reason</label>
                  <input
                    value={wf.reason}
                    onChange={(e) => setDownForm((m) => ({ ...m, [v.id]: { ...wf, reason: e.target.value } }))}
                    placeholder="e.g. Waiting on CV axle"
                    className={inputCls}
                  />
                </div>
                <button onClick={() => addDowntime(v)} disabled={saving === 'down-' + v.id} className={saveBtnCls}>
                  {saving === 'down-' + v.id ? 'Adding…' : 'Log downtime'}
                </button>
              </div>
              {vDown.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {vDown.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{d.start_date} → {d.end_date}</span>
                        {d.reason && <span className="text-muted-foreground"> — {d.reason}</span>}
                      </div>
                      <button onClick={() => deleteRow('FleetDowntime', d.id)} className="tap-target text-muted-foreground hover:text-red-400 shrink-0" aria-label="Delete downtime">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen px-5 pt-5 pb-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="mt-3 font-display font-bold text-3xl flex items-center gap-2">
        <Truck size={26} className="text-primary" /> Fleet
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pro — every vehicle, its status, driver, service and costs, on one screen. All of it stays on this phone.
      </p>

      <TierGate required="pro" feature="Fleet">
        {loading ? (
          <div className="mt-16 flex justify-center"><Loader2 className="text-primary animate-spin" /></div>
        ) : vehicles.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
            <Car size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Your garage is empty.</p>
            <Link to="/new" className="mt-3 inline-flex items-center gap-1 text-primary text-sm">Add a vehicle from a new ticket <Plus size={14} /></Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mt-5 text-center">
              <div className="rounded-2xl border border-border bg-card p-3">
                <Truck size={18} className="mx-auto text-primary" />
                <div className="font-display font-bold text-xl mt-1">{vehicles.length}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Vehicles</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <DollarSign size={18} className="mx-auto text-primary" />
                <div className="font-display font-bold text-xl mt-1">{fmtMoney(fleetSpend)}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Fleet spend</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <Truck size={18} className="mx-auto text-primary" />
                <div className="font-display font-bold text-xl mt-1">{fleetDownDays}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Down days</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              GO {counts.pass} · CAUTION {counts.warn} · DO NOT DRIVE {counts.fail} · No check yet {counts.none}
            </p>
            <div className="mt-4 space-y-4">
              {vehicles.map(renderVehicle)}
            </div>
            <Link to="/pre-shift" className="tap-target mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-3 font-display font-bold uppercase tracking-wide text-sm">
              Run a pre-shift check
            </Link>
          </>
        )}
      </TierGate>
    </div>
  );
}
