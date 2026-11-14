// Service scheduler — garage / vehicle level, NOT fleet-gated and
// NOT lease-gated. Pure helpers over the on-device Vehicle records
// (same pattern as fleetDashboard.js: everything stays on this
// phone, in localStorage via the base44 entities).
//
// WHY NOT FLEET-GATED: not every AutoHustle user is in a fleet and
// not every fleet vehicle is leased. A solo owner with a garage and
// no fleet at all must be able to schedule an oil change. So this
// lives at the vehicle level: the ServiceScheduler page
// (/service-scheduler, reached from the Garage) works with no fleet,
// no join code, no backend. The fleet dashboard only SURFACES the
// same scheduled services fleet-wide (upcomingServices()).
//
// WHY NOT LEASE-GATED: ownership is owned / leased / financed, and
// it is INFORMATIONAL only — a label the owner can set per vehicle
// (stored on the Vehicle as fleet_ownership, default 'owned').
// Scheduling never asks for it and never requires it. (Note: the
// 'lease' that already exists in the repo is a DRIVER contract type
// — a driver leasing the vehicle from the owner — which is a
// different thing from who owns the vehicle. This file does not
// touch contracts.)
//
// STORAGE: scheduled services live ON the Vehicle record as
// fleet_scheduled_services (a JSON array), exactly like the
// per-type last-service records (fleet_service_last). No new
// entity, no schema change, no backend. One item:
//   { id, type, customLabel, date, miles, shop, notes,
//     costEstimate, status: 'scheduled'|'done'|'cancelled',
//     createdAt, doneAt, doneMiles, doneDate }
//   - type: one of SERVICE_TYPES (from fleetDashboard.js) or
//     'other' (free-text label in customLabel).
//   - date: 'YYYY-MM-DD' or '' ; miles: odometer target or ''.
//     At least one of date / miles should be set; an item with
//     neither is shown as "no date or mileage set" and never
//     counts as overdue.
//   - costEstimate: number or '' (an estimate only — marking done
//     does NOT create a FleetCost row; the owner adds the real
//     cost on the Fleet page if they want it in the spend totals).
//
// MARK DONE: applyServiceDone() returns the two patches the page
// saves on the Vehicle — the updated scheduled list AND the merged
// fleet_service_last record — so the dashboard's computed
// next-service updates from the done job (manual interval, if set,
// still wins, same as before).
//
// TIER — change this ONE constant to change the gating:
//   'free'  — the scheduler is a garage feature, and the garage
//             is Free tier, so every user gets it (current choice).
//   'plus'  — gate it behind Plus.   'pro' — gate it behind Pro.
// The ServiceScheduler page wraps itself in
// <TierGate required={SERVICE_SCHEDULER_TIER}>, and TierGate
// passes everyone through when the required tier is 'free'
// (tierMeets(anything, 'free') is true), so flipping this one
// constant is the whole change. The fleet-wide upcoming-services
// view stays inside the Pro Fleet dashboard regardless — that is
// a fleet view, not the scheduler itself.
import { SERVICE_TYPES, parseServiceLast } from './fleetDashboard.js';

export const SERVICE_SCHEDULER_TIER = 'free';

// Due-soon thresholds — same as the dashboard's attention rule so
// a service never reads "due soon" in one place and "fine" in
// another: 7 days / 500 miles.
export const DUE_SOON_DAYS = 7;
export const DUE_SOON_MILES = 500;

export const OWNERSHIP_OPTIONS = [
  { value: 'owned', label: 'Owned' },
  { value: 'leased', label: 'Leased' },
  { value: 'financed', label: 'Financed' },
];

export function ownershipLabel(value) {
  const o = OWNERSHIP_OPTIONS.find((x) => x.value === value);
  return o ? o.label : 'Owned';
}

export const SCHEDULED_SERVICE_TYPES = [
  ...SERVICE_TYPES,
  { value: 'other', label: 'Other service', miles: 0, days: 0 },
];

export function scheduledServiceTypeLabel(type, customLabel) {
  if (type === 'other') return (customLabel || '').trim() || 'Other service';
  const t = SERVICE_TYPES.find((x) => x.value === type);
  return t ? t.label : 'Service';
}

// The scheduled services on a vehicle, as an array. Stored on the
// Vehicle as fleet_scheduled_services (JSON string).
export function parseScheduledServices(vehicle) {
  const raw = vehicle ? vehicle.fleet_scheduled_services : null;
  if (!raw) return [];
  let arr = null;
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => x && typeof x === 'object' && typeof x.id === 'string');
}

export function newScheduledServiceId() {
  return 'ss_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Build a new scheduled item from a form. Returns null when the
// form has nothing schedulable (no type is impossible — the form
// defaults to oil — but no date AND no mileage is refused).
export function buildScheduledService(form) {
  const date = (form.date || '').trim();
  const miles = parseInt(form.miles, 10);
  if (!date && !Number.isFinite(miles)) return null;
  const cost = parseFloat(form.costEstimate);
  return {
    id: newScheduledServiceId(),
    type: form.type || 'oil',
    customLabel: (form.customLabel || '').trim(),
    date,
    miles: Number.isFinite(miles) && miles > 0 ? miles : '',
    shop: (form.shop || '').trim(),
    notes: (form.notes || '').trim(),
    costEstimate: Number.isFinite(cost) && cost > 0 ? cost : '',
    status: 'scheduled',
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneMiles: '',
    doneDate: '',
  };
}

// Status of ONE scheduled item against the vehicle it belongs to.
// Returns { state, label } where state is one of:
//   done | cancelled | overdue | due-soon | upcoming | nodate
// nowMs / todayISO are injectable so tests can freeze time.
export function serviceScheduleStatus(item, vehicle, nowMs, todayISO) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const today = todayISO || new Date(now).toISOString().slice(0, 10);
  if (item.status === 'done') {
    return { state: 'done', label: `Done${item.doneDate ? ` ${item.doneDate}` : ''}` };
  }
  if (item.status === 'cancelled') return { state: 'cancelled', label: 'Cancelled' };
  const label = scheduledServiceTypeLabel(item.type, item.customLabel);
  let overdueBy = null;
  let dueIn = null;
  if (item.date) {
    const due = new Date(String(item.date) + 'T00:00:00').getTime();
    if (!Number.isNaN(due)) {
      const days = Math.ceil((due - new Date(today + 'T00:00:00').getTime()) / 86400000);
      if (days < 0) overdueBy = `${label} overdue by ${-days} day${-days === 1 ? '' : 's'}`;
      else if (days === 0) dueIn = { days: 0, text: `${label} due today` };
      else if (days <= DUE_SOON_DAYS) dueIn = { days, text: `${label} in ${days} day${days === 1 ? '' : 's'} (${item.date})` };
    }
  }
  const miles = Number(vehicle ? vehicle.mileage : NaN);
  const target = Number(item.miles);
  if (Number.isFinite(target) && target > 0 && Number.isFinite(miles)) {
    const remaining = target - miles;
    if (remaining <= 0) {
      overdueBy = `${label} overdue by ${Math.abs(remaining).toLocaleString('en-US')} mi`;
    } else if (remaining <= DUE_SOON_MILES && !dueIn) {
      dueIn = { days: Infinity, text: `${label} in ${remaining.toLocaleString('en-US')} mi (at ${target.toLocaleString('en-US')} mi)` };
    }
  }
  void now;
  if (overdueBy) return { state: 'overdue', label: overdueBy };
  if (dueIn) return { state: 'due-soon', label: dueIn.text };
  if (item.date || (Number.isFinite(target) && target > 0)) {
    const when = item.date
      ? `${label} ${item.date}`
      : `${label} at ${target.toLocaleString('en-US')} mi`;
    return { state: 'upcoming', label: when };
  }
  return { state: 'nodate', label: `${label} — no date or mileage set` };
}

// Every still-scheduled service across vehicles, most urgent
// first: overdue, then due-soon, then by date / mileage. Each row:
// { vehicle, item, status }.
export function upcomingServices(vehicles, nowMs, todayISO) {
  const rows = [];
  for (const v of vehicles || []) {
    for (const item of parseScheduledServices(v)) {
      if (item.status !== 'scheduled') continue;
      rows.push({ vehicle: v, item, status: serviceScheduleStatus(item, v, nowMs, todayISO) });
    }
  }
  const rank = { overdue: 0, 'due-soon': 1, upcoming: 2, nodate: 3 };
  rows.sort((a, b) => {
    const r = (rank[a.status.state] ?? 3) - (rank[b.status.state] ?? 3);
    if (r !== 0) return r;
    const da = a.item.date || '9999-12-31';
    const db = b.item.date || '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return (Number(a.item.miles) || Infinity) - (Number(b.item.miles) || Infinity);
  });
  return rows;
}

// Mark a scheduled service done. Returns the two patches to save
// on the Vehicle, or null when the item is not found / not
// schedulable anymore:
//   { scheduledServices, serviceLast }
// scheduledServices is the updated JSON string for
// fleet_scheduled_services; serviceLast is the merged JSON string
// for fleet_service_last (the done job becomes the last-service
// record for its type, so the dashboard's computed next-service
// updates — manual interval still wins). Done miles default to
// the vehicle's current odometer; done date defaults to today.
export function applyServiceDone(vehicle, itemId, done) {
  const items = parseScheduledServices(vehicle);
  const item = items.find((x) => x.id === itemId);
  if (!item || item.status !== 'scheduled') return null;
  const today = new Date().toISOString().slice(0, 10);
  const doneMiles = parseInt(done && done.miles, 10);
  const doneDate = ((done && done.date) || '').trim() || today;
  const updated = items.map((x) => (x.id === itemId
    ? {
        ...x,
        status: 'done',
        doneAt: new Date().toISOString(),
        doneMiles: Number.isFinite(doneMiles) && doneMiles > 0
          ? doneMiles
          : (Number.isFinite(Number(vehicle.mileage)) ? Number(vehicle.mileage) : ''),
        doneDate,
      }
    : x));
  const last = parseServiceLast(vehicle);
  const finalItem = updated.find((x) => x.id === itemId);
  last[item.type] = {
    miles: finalItem.doneMiles === '' ? '' : finalItem.doneMiles,
    date: finalItem.doneDate,
  };
  return {
    scheduledServices: JSON.stringify(updated),
    serviceLast: JSON.stringify(last),
  };
}

export function applyServiceCancel(vehicle, itemId) {
  const items = parseScheduledServices(vehicle);
  if (!items.some((x) => x.id === itemId && x.status === 'scheduled')) return null;
  return JSON.stringify(items.map((x) => (x.id === itemId ? { ...x, status: 'cancelled' } : x)));
}

export function applyServiceRemove(vehicle, itemId) {
  const items = parseScheduledServices(vehicle);
  if (!items.some((x) => x.id === itemId)) return null;
  return JSON.stringify(items.filter((x) => x.id !== itemId));
}
