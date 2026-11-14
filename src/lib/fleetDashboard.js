// Fleet dashboard helpers — pure functions over the on-device records.
// No server, no network: everything here reads the same localStorage
// rows the Fleet page already holds (Vehicle, PreShiftCheck,
// FleetCost, FleetDowntime, FleetDriver).
//
// Next service, in priority order:
//   1. MANUAL (always wins): the Vehicle's own service_miles_next /
//      service_date_next fields, set from the Fleet page or from this
//      dashboard. Reuses fleet.js serviceDue().
//   2. COMPUTED: per-type last-service records the owner enters on
//      this dashboard (stored on the Vehicle as fleet_service_last,
//      a JSON object { oil: {miles, date}, tires: {...}, ... }).
//      Due = last + the standard interval for that type. Nothing is
//      invented: a type with no last-service record simply has no
//      computed due date.
//   3. NONE: no manual interval and no last-service record — the
//      dashboard shows "Not set" and the owner can set it by hand.
//
// Standard intervals (miles / days), kept simple on purpose:
//   oil 5,000 mi / 180 days, tires 7,500 mi / 365 days,
//   brakes 12,000 mi / 365 days, filters 15,000 mi / 365 days,
//   fluids 30,000 mi / 730 days.
import { serviceDue, fmtMiles, latestCheckFor, sumCosts, downtimeDays } from './fleet.js';

export const SERVICE_TYPES = [
  { value: 'oil', label: 'Oil change', miles: 5000, days: 180 },
  { value: 'tires', label: 'Tire rotation', miles: 7500, days: 365 },
  { value: 'brakes', label: 'Brake check', miles: 12000, days: 365 },
  { value: 'filters', label: 'Air filter', miles: 15000, days: 365 },
  { value: 'fluids', label: 'Fluids / coolant', miles: 30000, days: 730 },
];

export function serviceTypeLabel(value) {
  const t = SERVICE_TYPES.find((x) => x.value === value);
  return t ? t.label : 'Service';
}

// The owner's per-type last-service records, as an object.
// Stored on the Vehicle as fleet_service_last (JSON string).
export function parseServiceLast(vehicle) {
  const raw = vehicle.fleet_service_last;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Computed due for one service type, from its last-service record.
// Returns null when the type has no usable record.
export function computedDueFor(vehicle, typeDef) {
  const last = parseServiceLast(vehicle)[typeDef.value];
  if (!last) return null;
  const cands = [];
  const lastMiles = Number(last.miles);
  const miles = Number(vehicle.mileage);
  if (Number.isFinite(lastMiles) && lastMiles > 0 && Number.isFinite(miles)) {
    const dueMiles = lastMiles + typeDef.miles;
    const remaining = dueMiles - miles;
    cands.push({
      kind: 'miles',
      remaining,
      overdue: remaining <= 0,
      label: remaining <= 0
        ? `${typeDef.label} overdue by ${fmtMiles(Math.abs(remaining))}`
        : `${typeDef.label} in ${fmtMiles(remaining)} (at ${fmtMiles(dueMiles)})`,
    });
  }
  if (last.date) {
    const lastDate = new Date(String(last.date) + 'T00:00:00');
    if (!Number.isNaN(lastDate.getTime())) {
      const due = new Date(lastDate.getTime() + typeDef.days * 86400000);
      const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
      cands.push({
        kind: 'date',
        remaining: days,
        overdue: days < 0,
        label: days < 0
          ? `${typeDef.label} overdue by ${-days} day${-days === 1 ? '' : 's'}`
          : days === 0
            ? `${typeDef.label} due today`
            : `${typeDef.label} in ${days} day${days === 1 ? '' : 's'} (${due.toISOString().slice(0, 10)})`,
      });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.remaining - b.remaining);
  return { ...cands[0], serviceType: typeDef.value, serviceLabel: typeDef.label };
}

// Next service for one vehicle. Manual wins, then computed, then none.
// Returns { kind, remaining, overdue, label, source, serviceType, serviceLabel }.
export function nextServiceFor(vehicle) {
  const manual = serviceDue(vehicle);
  if (manual.kind !== 'none') {
    return { ...manual, source: 'manual', serviceType: '', serviceLabel: 'Service' };
  }
  let best = null;
  for (const typeDef of SERVICE_TYPES) {
    const c = computedDueFor(vehicle, typeDef);
    if (!c) continue;
    const cand = { ...c, source: 'computed' };
    if (!best || cand.remaining < best.remaining) best = cand;
  }
  if (best) return best;
  return {
    kind: 'none', remaining: Infinity, overdue: false,
    label: 'No service interval set', source: 'none', serviceType: '', serviceLabel: 'Service',
  };
}

// Is the vehicle inside a logged downtime window right now? An
// end_date in the future (or missing) means it is still down.
export function isCurrentlyDown(downList, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return (downList || []).some(
    (d) => d.start_date && d.start_date <= today && (!d.end_date || d.end_date >= today),
  );
}

// One vehicle's dashboard status — one vocabulary everywhere
// (AH-H6): the Pre-Shift verdicts GO / CAUTION / DO NOT DRIVE.
//   fail  — last check says DO NOT DRIVE, or logged down now.
//   warn  — last check was CAUTION, service overdue / due very
//           soon, or the assigned driver's license is expired
//           or expiring within 30 days.
//   pass  — everything else.
// Returns { status, reasons, due }.
export function vehicleStatus(vehicle, check, downList, driver) {
  const due = nextServiceFor(vehicle);
  const reasons = [];
  if (check && check.verdict === 'fail') reasons.push('Pre-shift check says DO NOT DRIVE');
  if (isCurrentlyDown(downList)) reasons.push('Logged as down right now');
  if (reasons.length > 0) return { status: 'fail', reasons, due };

  if (check && check.verdict === 'warn') reasons.push('Last check was CAUTION');
  if (due.overdue) {
    reasons.push(`${due.serviceLabel} overdue`);
  } else if (due.kind === 'miles' && due.remaining <= 500) {
    reasons.push(`${due.serviceLabel} due within ${fmtMiles(due.remaining)}`);
  } else if (due.kind === 'date' && due.remaining <= 7) {
    reasons.push(`${due.serviceLabel} due within ${due.remaining} day${due.remaining === 1 ? '' : 's'}`);
  }
  if (driver && driver.license_expiry) {
    const t = new Date(String(driver.license_expiry) + 'T00:00:00').getTime();
    if (!Number.isNaN(t)) {
      const days = Math.ceil((t - Date.now()) / 86400000);
      if (days < 0) reasons.push('Driver license expired');
      else if (days <= 30) reasons.push(`Driver license expires in ${days} day${days === 1 ? '' : 's'}`);
    }
  }
  if (reasons.length > 0) return { status: 'warn', reasons, due };
  return { status: 'pass', reasons: [], due };
}

// FleetCost spend in the current calendar month.
export function monthSpend(costs, now) {
  const prefix = (now || new Date()).toISOString().slice(0, 7);
  return sumCosts((costs || []).filter((c) => String(c.date || '').slice(0, 7) === prefix));
}

// Fleet-wide summary for the dashboard header.
// soonest: { vehicle, due } for the nearest next service, or null.
export function fleetSummary(vehicles, checks, costs, downtime, drivers) {
  let go = 0;
  let doNotDrive = 0;
  let caution = 0;
  let soonest = null;
  for (const v of vehicles) {
    const check = latestCheckFor(checks, v.id);
    const dList = (downtime || []).filter((d) => d.vehicle_id === v.id);
    const driver = (drivers || []).find((d) => d.vehicle_id === v.id) || null;
    const st = vehicleStatus(v, check, dList, driver);
    if (st.status === 'fail') doNotDrive += 1;
    else if (st.status === 'warn') caution += 1;
    else go += 1;
    if (st.due.kind !== 'none' && (!soonest || st.due.remaining < soonest.due.remaining)) {
      soonest = { vehicle: v, due: st.due };
    }
  }
  return {
    go, doNotDrive, caution, total: vehicles.length,
    month: monthSpend(costs), spend: sumCosts(costs), downDays: downtimeDays(downtime),
    soonest,
  };
}
