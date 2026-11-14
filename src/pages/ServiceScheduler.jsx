// Service scheduler — garage / vehicle level. FREE tier (see
// SERVICE_SCHEDULER_TIER in fleetScheduling.js — flip that one
// constant to gate it behind Plus/Pro).
//
// NOT fleet-gated and NOT lease-gated, on purpose: a solo owner
// with a garage and no fleet at all uses this page exactly as a
// fleet owner does, and a vehicle that is owned, leased, or
// financed schedules the same way. Ownership is an informational
// label per vehicle (fleet_ownership), never a requirement —
// scheduling never asks for it. (The 'lease' already in the repo
// is a DRIVER contract type, a different thing; this page does not
// touch contracts.)
//
// Everything stays on this phone: scheduled services live on the
// Vehicle record as fleet_scheduled_services (JSON), same pattern
// as fleet_service_last. Marking a service done writes the
// last-service record for its type, so the fleet dashboard's
// computed next-service updates (a manual interval, if set, still
// wins). The fleet dashboard also shows these scheduled services
// fleet-wide; this page is where they are managed.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Car, CheckCircle2, AlertTriangle, Clock, Plus, Trash2, Loader2, Wrench, ChevronDown, XCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TierGate from '@/components/TierGate';
import { vehicleName, fmtMiles, fmtMoney } from '@/lib/fleet';
import {
  SERVICE_SCHEDULER_TIER, OWNERSHIP_OPTIONS, ownershipLabel,
  SCHEDULED_SERVICE_TYPES, scheduledServiceTypeLabel,
  parseScheduledServices, buildScheduledService,
  serviceScheduleStatus, applyServiceDone, applyServiceCancel,
  applyServiceRemove,
} from '@/lib/fleetScheduling';

const todayISO = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ state }) {
  if (state === 'overdue') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 text-red-400 px-2 py-0.5 text-xs font-semibold"><XCircle size={13} /> OVERDUE</span>;
  }
  if (state === 'due-soon') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5 text-xs font-semibold"><AlertTriangle size={13} /> DUE SOON</span>;
  }
  if (state === 'done') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 text-green-400 px-2 py-0.5 text-xs font-semibold"><CheckCircle2 size={13} /> DONE</span>;
  }
  if (state === 'cancelled') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 text-zinc-400 px-2 py-0.5 text-xs font-semibold">CANCELLED</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-400 px-2 py-0.5 text-xs font-semibold"><Clock size={13} /> SCHEDULED</span>;
}

const blankForm = () => ({
  type: 'oil', customLabel: '', date: '', miles: '', shop: '', notes: '', costEstimate: '',
});

export default function ServiceScheduler() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(() => params.get('vehicle') || null);
  const [forms, setForms] = useState({});
  const [doneForms, setDoneForms] = useState({});
  const [doneOpenId, setDoneOpenId] = useState(null);
  const [saving, setSaving] = useState('');

  const load = async () => {
    try {
      const r = await base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 100 });
      setVehicles(r.items || []);
    } catch { setVehicles([]); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const formFor = (v) => forms[v.id] || blankForm();
  const setForm = (v, patch) => setForms((m) => ({ ...m, [v.id]: { ...formFor(v), ...patch } }));
  const doneFor = (v, item) => doneForms[item.id] || {
    miles: v.mileage ? String(v.mileage) : '', date: todayISO(),
  };
  const setDoneForm = (item, patch) => setDoneForms((m) => ({
    ...m, [item.id]: { ...(m[item.id] || { miles: '', date: todayISO() }), ...patch },
  }));

  const updateVehicle = async (v, patch) => {
    setSaving(v.id);
    try {
      const updated = await base44.entities.Vehicle.update(v.id, patch);
      setVehicles((vs) => vs.map((x) => (x.id === v.id ? updated : x)));
    } catch (e) { /* ignore */ } finally { setSaving(''); }
  };

  const saveOwnership = (v, value) => {
    updateVehicle(v, { fleet_ownership: value || 'owned' });
  };

  const addService = (v) => {
    const item = buildScheduledService(formFor(v));
    if (!item) return;
    const items = [...parseScheduledServices(v), item];
    updateVehicle(v, { fleet_scheduled_services: JSON.stringify(items) });
    setForms((m) => ({ ...m, [v.id]: blankForm() }));
  };

  const markDone = (v, item) => {
    const res = applyServiceDone(v, item.id, doneFor(v, item));
    if (!res) return;
    updateVehicle(v, {
      fleet_scheduled_services: res.scheduledServices,
      fleet_service_last: res.serviceLast,
    });
    setDoneOpenId(null);
  };

  const cancelService = (v, item) => {
    const json = applyServiceCancel(v, item.id);
    if (json) updateVehicle(v, { fleet_scheduled_services: json });
  };

  const removeService = (v, item) => {
    if (!window.confirm(`Remove this scheduled ${scheduledServiceTypeLabel(item.type, item.customLabel).toLowerCase()}?`)) return;
    const json = applyServiceRemove(v, item.id);
    if (json) updateVehicle(v, { fleet_scheduled_services: json });
  };

  const inputCls = 'tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
  const saveBtnCls = 'tap-target w-full rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm py-2.5 disabled:opacity-60';

  const renderVehicle = (v) => {
    const items = parseScheduledServices(v);
    const open = openId === v.id;
    const f = formFor(v);
    const live = items.filter((x) => x.status === 'scheduled');
    const past = items.filter((x) => x.status !== 'scheduled');
    return (
      <div key={v.id} className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 rounded-xl border border-border bg-zinc-950 flex items-center justify-center shrink-0"><Car size={22} className="text-muted-foreground" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold">{vehicleName(v)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {v.engine ? `${v.engine} · ` : ''}{v.mileage ? fmtMiles(v.mileage) : 'Mileage not set'}
                {` · ${ownershipLabel(v.fleet_ownership)}`}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {live.length === 0 ? 'No services scheduled' : `${live.length} scheduled`}
                {past.length > 0 ? ` · ${past.length} done / cancelled` : ''}
              </div>
            </div>
            <button
              onClick={() => setOpenId(open ? null : v.id)}
              className="tap-target shrink-0 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm font-display font-semibold uppercase tracking-wide inline-flex items-center gap-1"
            >
              <Wrench size={14} /> {open ? 'Close' : 'Schedule'} <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-border p-4 space-y-5 bg-zinc-950/40">
            {/* Ownership — informational only, never required */}
            <div>
              <label className={labelCls}>Ownership (label only — scheduling works the same for all three)</label>
              <select
                value={v.fleet_ownership || 'owned'}
                onChange={(e) => saveOwnership(v, e.target.value)}
                className={inputCls}
              >
                {OWNERSHIP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Scheduled services on this vehicle */}
            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => {
                  const st = serviceScheduleStatus(item, v);
                  const doneOpen = doneOpenId === item.id;
                  const df = doneFor(v, item);
                  return (
                    <div key={item.id} className="rounded-xl border border-border bg-zinc-950 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{scheduledServiceTypeLabel(item.type, item.customLabel)}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{st.label}</div>
                          {(item.shop || item.costEstimate) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {item.shop || ''}{item.shop && item.costEstimate ? ' · ' : ''}{item.costEstimate ? `est. ${fmtMoney(item.costEstimate)}` : ''}
                            </div>
                          )}
                          {item.notes && <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>}
                        </div>
                        <StatusBadge state={st.state} />
                      </div>
                      {item.status === 'scheduled' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => setDoneOpenId(doneOpen ? null : item.id)}
                            className="tap-target flex-1 rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-xs py-2 inline-flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 size={14} /> Mark done
                          </button>
                          <button
                            onClick={() => cancelService(v, item)}
                            className="tap-target rounded-xl border border-border px-3 py-2 text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => removeService(v, item)}
                            className="tap-target rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-red-400 inline-flex items-center gap-1"
                            aria-label="Remove scheduled service"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                      {doneOpen && item.status === 'scheduled' && (
                        <div className="mt-2 space-y-2 rounded-xl border border-border bg-zinc-900/60 p-3">
                          <p className="text-[11px] text-muted-foreground">
                            Marking done records this as the last {scheduledServiceTypeLabel(item.type, item.customLabel).toLowerCase()} — the fleet dashboard works the next one out from it.
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className={labelCls}>Odometer when done (mi)</label>
                              <input
                                type="number" inputMode="numeric"
                                value={df.miles}
                                onChange={(e) => setDoneForm(item, { miles: e.target.value })}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Date done</label>
                              <input
                                type="date"
                                value={df.date}
                                onChange={(e) => setDoneForm(item, { date: e.target.value })}
                                className={inputCls}
                              />
                            </div>
                          </div>
                          <button onClick={() => markDone(v, item)} disabled={saving === v.id} className={saveBtnCls}>
                            {saving === v.id ? 'Saving…' : 'Save — mark done'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add a scheduled service */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><CalendarClock size={16} className="text-primary" /> Schedule a service</h3>
              <div className="mt-2 space-y-2">
                <div>
                  <label className={labelCls}>Service</label>
                  <select
                    value={f.type}
                    onChange={(e) => setForm(v, { type: e.target.value })}
                    className={inputCls}
                  >
                    {SCHEDULED_SERVICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {f.type === 'other' && (
                  <div>
                    <label className={labelCls}>What service?</label>
                    <input
                      value={f.customLabel}
                      onChange={(e) => setForm(v, { customLabel: e.target.value })}
                      placeholder="e.g. CV axle — driver side"
                      className={inputCls}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Date</label>
                    <input
                      type="date"
                      value={f.date}
                      onChange={(e) => setForm(v, { date: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>At odometer (mi)</label>
                    <input
                      type="number" inputMode="numeric"
                      value={f.miles}
                      onChange={(e) => setForm(v, { miles: e.target.value })}
                      placeholder="e.g. 160000"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Shop (optional)</label>
                    <input
                      value={f.shop}
                      onChange={(e) => setForm(v, { shop: e.target.value })}
                      placeholder="e.g. O'Reilly / my driveway"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Cost estimate $ (optional)</label>
                    <input
                      type="number" inputMode="numeric"
                      value={f.costEstimate}
                      onChange={(e) => setForm(v, { costEstimate: e.target.value })}
                      placeholder="e.g. 48"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Notes (optional)</label>
                  <input
                    value={f.notes}
                    onChange={(e) => setForm(v, { notes: e.target.value })}
                    placeholder="e.g. part on order, needs a ride to the yard"
                    className={inputCls}
                  />
                </div>
                <button
                  onClick={() => addService(v)}
                  disabled={saving === v.id || (!f.date.trim() && !f.miles.trim())}
                  className={saveBtnCls}
                >
                  {saving === v.id ? 'Saving…' : 'Schedule service'}
                </button>
                <p className="text-[11px] text-muted-foreground">Set a date, a mileage, or both — one of them is required. Overdue shows red, due within 7 days / 500 mi shows amber.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen px-5 pt-5 pb-6">
      <button onClick={() => navigate('/garage')} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft size={15} /> Back to Garage
      </button>
      <h1 className="mt-3 font-display font-bold text-3xl flex items-center gap-2">
        <CalendarClock size={26} className="text-primary" /> Service scheduler
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Schedule a service per vehicle — date, mileage, shop, notes, cost estimate. No fleet needed, no lease needed: it works for every vehicle in your garage, owned, leased, or financed. Marking one done updates the next-service date on the fleet dashboard.
      </p>

      <TierGate required={SERVICE_SCHEDULER_TIER} feature="Service scheduler">
        {loading ? (
          <div className="mt-16 flex justify-center"><Loader2 className="text-primary animate-spin" /></div>
        ) : vehicles.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
            <Car size={32} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Your garage is empty.</p>
            <Link to="/new" className="mt-3 inline-flex items-center gap-1 text-primary text-sm">Add a vehicle from a new ticket</Link>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {vehicles.map(renderVehicle)}
            <Link to="/fleet-dashboard" className="tap-target mt-1 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-zinc-950 py-3 font-display font-bold uppercase tracking-wide text-sm">
              <CalendarClock size={16} /> See all upcoming services on the fleet dashboard
            </Link>
          </div>
        )}
      </TierGate>
    </div>
  );
}
