// Fleet dashboard — Pro-only, on-device only, no server.
// One screen: every garage vehicle with its status, next service due,
// and cost / downtime, plus a fleet-wide summary at the top.
// Next service: the owner's manual interval on the Vehicle wins
// (service_miles_next / service_date_next); otherwise it is computed
// from the per-type last-service records the owner enters here
// (fleet_service_last); otherwise it shows as Not set.
// Status: DO NOT DRIVE (last check failed, or logged down now),
// CAUTION (last check was CAUTION, service overdue / due very soon,
// or the driver's license is expired / expiring), else GO.
// Records (all localStorage via base44 entities — same as Fleet.jsx):
//   Vehicle, PreShiftCheck, FleetCost, FleetDowntime, FleetDriver.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Truck, CheckCircle2, AlertTriangle, XCircle, Users, DollarSign, CalendarClock, Car, Loader2, Wrench, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TierGate from '@/components/TierGate';
import {
  vehicleName, fmtMoney, fmtMiles, latestCheckFor,
  sumCosts, downtimeDays, costPerMile,
} from '@/lib/fleet';
import {
  SERVICE_TYPES, serviceTypeLabel, parseServiceLast,
  nextServiceFor, vehicleStatus, fleetSummary,
} from '@/lib/fleetDashboard';
import {
  scheduledServiceTypeLabel, upcomingServices,
} from '@/lib/fleetScheduling';

const todayISO = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }) {
  if (status === 'fail') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-xs font-semibold"><XCircle size={13} /> DO NOT DRIVE</span>;
  }
  if (status === 'warn') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-xs font-semibold"><AlertTriangle size={13} /> CAUTION</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-400 px-2 py-0.5 text-xs font-semibold"><CheckCircle2 size={13} /> GO</span>;
}

function verdictWord(v) {
  return v === 'pass' ? 'GO' : v === 'warn' ? 'CAUTION' : v === 'fail' ? 'DO NOT DRIVE' : 'No check yet';
}

const STATUS_RANK = { fail: 0, warn: 1, pass: 2 };

export default function FleetDashboard() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [checks, setChecks] = useState([]);
  const [costs, setCosts] = useState([]);
  const [downtime, setDowntime] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openServiceId, setOpenServiceId] = useState(null);
  const [serviceEdit, setServiceEdit] = useState({});
  const [saving, setSaving] = useState('');

  const load = async () => {
    const safe = async (fn) => {
      try { const r = await fn(); return r.items || []; } catch { return []; }
    };
    const [vp, cp, fp, dp, dr] = await Promise.all([
      safe(() => base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 100 })),
      safe(() => base44.entities.PreShiftCheck.filter({}, { sort: '-created_date', limit: 200 })),
      safe(() => base44.entities.FleetCost.filter({}, { sort: '-date', limit: 500 })),
      safe(() => base44.entities.FleetDowntime.filter({}, { sort: '-start_date', limit: 200 })),
      safe(() => base44.entities.FleetDriver.filter({}, { sort: '-created_date', limit: 100 })),
    ]);
    setVehicles(vp);
    setChecks(cp);
    setCosts(fp);
    setDowntime(dp);
    setDrivers(dr);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const summary = fleetSummary(vehicles, checks, costs, downtime, drivers);
  // Scheduled services across all vehicles, most urgent first
  // (overdue, then due soon). Same rows the Service Scheduler
  // page manages — this is the fleet-wide view of them.
  const upcoming = upcomingServices(vehicles);

  // Per-vehicle view model, sorted most urgent first.
  const rows = vehicles.map((v) => {
    const check = latestCheckFor(checks, v.id);
    const vCosts = costs.filter((c) => c.vehicle_id === v.id);
    const vDown = downtime.filter((d) => d.vehicle_id === v.id);
    const driver = drivers.find((d) => d.vehicle_id === v.id) || null;
    const st = vehicleStatus(v, check, vDown, driver);
    return {
      v, check, driver,
      status: st.status, reasons: st.reasons, due: st.due,
      total: sumCosts(vCosts), days: downtimeDays(vDown),
      cpm: costPerMile(sumCosts(vCosts), v.mileage),
    };
  }).sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    return a.due.remaining - b.due.remaining;
  });

  const costsFor = (vid) => costs.filter((c) => c.vehicle_id === vid);

  const editFor = (v) => serviceEdit[v.id] || {
    every: v.service_miles_every || '',
    nextMiles: v.service_miles_next || '',
    nextDate: v.service_date_next || '',
    lastType: 'oil', lastMiles: '', lastDate: '',
  };
  const setEdit = (v, patch) => setServiceEdit((m) => ({ ...m, [v.id]: { ...editFor(v), ...patch } }));

  const updateVehicle = async (v, patch) => {
    setSaving(v.id);
    try {
      const updated = await base44.entities.Vehicle.update(v.id, patch);
      setVehicles((vs) => vs.map((x) => (x.id === v.id ? updated : x)));
    } catch (e) { /* ignore */ } finally { setSaving(''); }
  };

  // Direct next service: the manual interval. Same rule as the Fleet
  // page — if only the interval is set, work the next service out
  // from the odometer (mileage now + every N miles).
  const saveDirectService = (v) => {
    const f = editFor(v);
    const every = parseInt(f.every, 10);
    let nextMiles = parseInt(f.nextMiles, 10);
    if (!Number.isFinite(nextMiles) && Number.isFinite(every) && every > 0 && Number.isFinite(Number(v.mileage))) {
      nextMiles = Number(v.mileage) + every;
    }
    updateVehicle(v, {
      service_miles_every: Number.isFinite(every) && every > 0 ? every : '',
      service_miles_next: Number.isFinite(nextMiles) && nextMiles > 0 ? nextMiles : '',
      service_date_next: (f.nextDate || '').trim(),
    });
  };

  // Per-type last service: records when a job was last done, so the
  // dashboard can work out when it is due next. Never invents a
  // record — only what the owner enters here is stored.
  const saveLastService = (v) => {
    const f = editFor(v);
    const miles = parseInt(f.lastMiles, 10);
    if (!Number.isFinite(miles) && !(f.lastDate || '').trim()) return;
    const last = parseServiceLast(v);
    last[f.lastType] = {
      miles: Number.isFinite(miles) && miles > 0 ? miles : '',
      date: (f.lastDate || '').trim(),
    };
    updateVehicle(v, { fleet_service_last: JSON.stringify(last) });
    setEdit(v, { lastMiles: '', lastDate: '' });
  };

  const clearManualService = (v) => {
    updateVehicle(v, { service_miles_next: '', service_date_next: '' });
  };

  const inputCls = 'tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
  const saveBtnCls = 'tap-target w-full rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm py-2.5 disabled:opacity-60';

  const renderRow = (row) => {
    const { v, check, driver, status, reasons, due, total, days, cpm } = row;
    const open = openServiceId === v.id;
    const f = editFor(v);
    const sourceTag = due.source === 'manual'
      ? 'Set by you'
      : due.source === 'computed'
        ? `From last ${serviceTypeLabel(due.serviceType).toLowerCase()}`
        : 'Not set';
    return (
      <div key={v.id} className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            {v.fleet_photo ? (
              <img src={v.fleet_photo} alt="" className="h-14 w-14 rounded-xl object-cover border border-border shrink-0" />
            ) : (
              <div className="h-14 w-14 rounded-xl border border-border bg-zinc-950 flex items-center justify-center shrink-0"><Car size={22} className="text-muted-foreground" /></div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold">{vehicleName(v)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {v.engine ? `${v.engine} · ` : ''}{v.mileage ? fmtMiles(v.mileage) : 'Mileage not set'}
                {driver ? ` · ${driver.name}` : ' · No driver assigned'}
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
          {reasons.length > 0 && (
            <p className={`text-xs mt-2 font-medium ${status === 'fail' ? 'text-red-400' : 'text-amber-400'}`}>
              {reasons.join(' · ')}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Last check: {verdictWord(check?.verdict)}
            {check ? ` · ${new Date(check.created_date).toLocaleDateString()}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <CalendarClock size={13} /> {due.label}
            <span className="ml-1 inline-flex items-center rounded-full bg-zinc-500/15 text-zinc-400 px-2 py-0.5 text-[11px]">{sourceTag}</span>
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
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setOpenServiceId(open ? null : v.id)}
              className="tap-target flex-1 rounded-xl border border-border bg-zinc-950 py-2 text-sm font-display font-semibold uppercase tracking-wide inline-flex items-center justify-center gap-1"
            >
              <Wrench size={14} /> {open ? 'Close service' : 'Set next service'} <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
            </button>
            <Link to="/fleet" className="tap-target rounded-xl border border-border bg-zinc-950 px-4 py-2 text-sm font-display font-semibold uppercase tracking-wide inline-flex items-center justify-center">
              Manage
            </Link>
          </div>
        </div>

        {open && (
          <div className="border-t border-border p-4 space-y-5 bg-zinc-950/40">
            {/* Direct next service — manual, always wins */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><CalendarClock size={16} className="text-primary" /> Next service (set by you)</h3>
              <div className="mt-2 space-y-2">
                <div>
                  <label className={labelCls}>Service every (miles)</label>
                  <input
                    type="number" inputMode="numeric"
                    value={f.every}
                    onChange={(e) => setEdit(v, { every: e.target.value })}
                    placeholder="e.g. 5000"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Next service at odometer (mi)</label>
                  <input
                    type="number" inputMode="numeric"
                    value={f.nextMiles}
                    onChange={(e) => setEdit(v, { nextMiles: e.target.value })}
                    placeholder="Leave blank to work it out from the interval"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Next service by (date)</label>
                  <input
                    type="date"
                    value={f.nextDate}
                    onChange={(e) => setEdit(v, { nextDate: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <button onClick={() => saveDirectService(v)} disabled={saving === v.id} className={saveBtnCls}>
                  {saving === v.id ? 'Saving…' : 'Save next service'}
                </button>
                {(v.service_miles_next || v.service_date_next) && (
                  <button onClick={() => clearManualService(v)} disabled={saving === v.id} className="tap-target w-full text-xs text-muted-foreground hover:text-amber-400 py-1">
                    Clear my set date — fall back to last-service records
                  </button>
                )}
              </div>
            </div>

            {/* Per-type last service — what the computed due is built from */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><Wrench size={16} className="text-primary" /> Last service done</h3>
              <p className="text-[11px] text-muted-foreground mt-1">Record when a job was last done and the dashboard works out when it is due next (oil 5,000 mi / 6 mo, tires 7,500 mi / 12 mo, brakes 12,000 mi / 12 mo, filters 15,000 mi / 12 mo, fluids 30,000 mi / 24 mo).</p>
              <div className="mt-2 space-y-2">
                <div>
                  <label className={labelCls}>Job</label>
                  <select
                    value={f.lastType}
                    onChange={(e) => setEdit(v, { lastType: e.target.value })}
                    className={inputCls}
                  >
                    {SERVICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Odometer then (mi)</label>
                    <input
                      type="number" inputMode="numeric"
                      value={f.lastMiles}
                      onChange={(e) => setEdit(v, { lastMiles: e.target.value })}
                      placeholder="e.g. 158000"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Date done</label>
                    <input
                      type="date"
                      value={f.lastDate}
                      onChange={(e) => setEdit(v, { lastDate: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <button onClick={() => saveLastService(v)} disabled={saving === v.id} className={saveBtnCls}>
                  {saving === v.id ? 'Saving…' : 'Record last service'}
                </button>
                {Object.keys(parseServiceLast(v)).length > 0 && (
                  <div className="space-y-1">
                    {Object.entries(parseServiceLast(v)).map(([type, rec]) => (
                      <div key={type} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                        <span className="font-medium">{serviceTypeLabel(type)}</span>
                        <span className="text-muted-foreground text-xs">
                          {rec.miles ? fmtMiles(rec.miles) : ''}{rec.miles && rec.date ? ' · ' : ''}{rec.date || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen px-5 pt-5 pb-6">
      <button onClick={() => navigate('/fleet')} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft size={15} /> Back to Fleet
      </button>
      <h1 className="mt-3 font-display font-bold text-3xl flex items-center gap-2">
        <LayoutDashboard size={26} className="text-primary" /> Fleet dashboard
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pro — every vehicle, its status, and its next service, on one screen. Most urgent first. Everything stays on this phone.
      </p>

      <TierGate required="pro" feature="Fleet dashboard">
        {loading ? (
          <div className="mt-16 flex justify-center"><Loader2 className="text-primary animate-spin" /></div>
        ) : vehicles.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
            <Car size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Your garage is empty.</p>
            <Link to="/new" className="mt-3 inline-flex items-center gap-1 text-primary text-sm">Add a vehicle from a new ticket</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mt-5 text-center">
              <div className="rounded-2xl border border-border bg-card p-3">
                <CheckCircle2 size={18} className="mx-auto text-green-400" />
                <div className="font-display font-bold text-xl mt-1">{summary.go}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">GO</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <XCircle size={18} className="mx-auto text-red-400" />
                <div className="font-display font-bold text-xl mt-1">{summary.doNotDrive}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">DO NOT DRIVE</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3">
                <AlertTriangle size={18} className="mx-auto text-amber-400" />
                <div className="font-display font-bold text-xl mt-1">{summary.caution}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">CAUTION</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="rounded-2xl border border-border bg-card p-3 text-center">
                <DollarSign size={18} className="mx-auto text-primary" />
                <div className="font-display font-bold text-xl mt-1">{fmtMoney(summary.month)}</div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Spent this month</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{fmtMoney(summary.spend)} all time · {summary.downDays} down days</div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 text-center">
                <CalendarClock size={18} className="mx-auto text-primary" />
                <div className="font-display font-bold text-sm mt-1 leading-snug">
                  {summary.soonest ? summary.soonest.due.label : 'No service set'}
                </div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">
                  {summary.soonest ? `Next service · ${vehicleName(summary.soonest.vehicle)}` : 'Set one per vehicle below'}
                </div>
              </div>
            </div>

            {/* Upcoming scheduled services — fleet-wide view of the
                Service Scheduler (garage-level, works with no fleet).
                Overdue red, due within 7 days / 500 mi amber. */}
            <h2 className="mt-6 font-display font-bold text-xl flex items-center gap-2">
              <CalendarClock size={20} className="text-primary" /> Upcoming scheduled services
            </h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No services scheduled.{' '}
                <Link to="/service-scheduler" className="text-primary">Schedule one from the Service scheduler</Link> — it works for every vehicle, fleet or not.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {upcoming.map(({ vehicle, item, status }) => (
                  <div key={item.id} className={`rounded-2xl border px-4 py-3 ${status.state === 'overdue' ? 'border-red-500/40 bg-red-500/10' : status.state === 'due-soon' ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-card'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display font-semibold text-sm">
                          {scheduledServiceTypeLabel(item.type, item.customLabel)} — {vehicleName(vehicle)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{status.label}</div>
                        {(item.shop || item.costEstimate) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {item.shop || ''}{item.shop && item.costEstimate ? ' · ' : ''}{item.costEstimate ? `est. ${fmtMoney(item.costEstimate)}` : ''}
                          </div>
                        )}
                      </div>
                      <Link to={`/service-scheduler?vehicle=${vehicle.id}`} className="tap-target shrink-0 inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs">
                        <Wrench size={14} /> Manage
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 space-y-4">
              {rows.map(renderRow)}
            </div>
            <Link to="/fleet" className="tap-target mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-3 font-display font-bold uppercase tracking-wide text-sm">
              <Truck size={16} /> Open Fleet — drivers, contracts &amp; costs
            </Link>
          </>
        )}
      </TierGate>
    </div>
  );
}
