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
// TIER (AH-H8, decided 2026-11-14): first scheduled service FREE
// per account, then Plus.
//   - The scheduler PAGE stays open to every tier: it wraps itself
//     in <TierGate required={SERVICE_SCHEDULER_TIER}> with 'free'
//     below, so TierGate passes everyone through. A Free user must
//     still reach the page to see, edit, mark done, and cancel the
//     services they already have — never hold an existing service
//     hostage.
//   - CREATING is gated per account by canCreateScheduledService():
//     the first scheduled service (count 0) is free for any tier;
//     the 2nd and beyond need Plus or Pro. The count is the total
//     across ALL vehicles (see countScheduledServicesAcrossAccount)
//     — a fleet owner with 10 vehicles does not get 10 free ones.
//     FREE_SCHEDULED_SERVICES_PER_ACCOUNT is the one-line flip:
//     raise it to give more free ones, or change the helper to
//     count per vehicle if the rule ever becomes per-vehicle.
//   - The fleet-wide "Upcoming scheduled services" view is Plus:
//     UPCOMING_SERVICES_TIER below. It is carved out of the Pro
//     Fleet Status gate on FleetDashboard.jsx, so Plus members see
//     the list there while the rest of the dashboard stays Pro.
import { SERVICE_TYPES, parseServiceLast } from './fleetDashboard.js';

export const SERVICE_SCHEDULER_TIER = 'free';

// Fleet-wide upcoming-services view tier (AH-H8): Plus members
// see the list on Fleet Status; Free sees the Plus locked card.
export const UPCOMING_SERVICES_TIER = 'plus';

// Free scheduled services per account (AH-H8). One free taste so
// the user sees how useful scheduling is; after that, creating
// more needs Plus (or Pro). Per ACCOUNT, not per vehicle.
export const FREE_SCHEDULED_SERVICES_PER_ACCOUNT = 1;

// Total scheduled services on this account: the sum of every
// vehicle's fleet_scheduled_services array length. Done and
// cancelled items still count — the freebie is one scheduled
// service ever, not one live at a time. (Removing a service with
// the trash button does drop it from the count.)
export function countScheduledServicesAcrossAccount(vehicles) {
  let n = 0;
  for (const v of vehicles || []) n += parseScheduledServices(v).length;
  return n;
}

// Rank mirror of TIER_RANK in subscription.js (kept local so this
// file stays importable in plain node tests — keep in step).
const TIER_RANK = { free: 0, plus: 1, pro: 2 };

// May this account create another scheduled service? Yes when the
// account still has a free one left (count < the free allowance),
// or when its tier is Plus or Pro. Editing, marking done, and
// cancelling existing services are NOT gated — only creating is.
export function canCreateScheduledService(vehicles, tier) {
  if (countScheduledServicesAcrossAccount(vehicles) < FREE_SCHEDULED_SERVICES_PER_ACCOUNT) return true;
  return (TIER_RANK[tier] || 0) >= TIER_RANK.plus;
}

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
