// Fleet helpers — pure functions over the on-device records.
// No server, no network: everything here reads localStorage rows via
// the base44 entities (Vehicle, PreShiftCheck, FleetCost, FleetDowntime).
// Vehicle fleet fields (set from the Fleet page, stored on the Vehicle
// record itself): fleet_driver_name, fleet_driver_phone,
// service_miles_every, service_miles_next, service_date_next.

export function vehicleName(v) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || 'Unnamed vehicle';
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMiles(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US') + ' mi';
}

// Checks arrive newest-first (sorted -created_date); first match wins.
export function latestCheckFor(checks, vehicleId) {
  return (checks || []).find((c) => c.vehicle_id === vehicleId) || null;
}

// Next service due: nearest of the miles target and the date target.
// Returns { kind: 'miles' | 'date' | 'none', remaining, overdue, label }.
export function serviceDue(vehicle) {
  const cands = [];
  const miles = Number(vehicle.mileage);
  const nextMiles = Number(vehicle.service_miles_next);
  if (Number.isFinite(nextMiles) && nextMiles > 0 && Number.isFinite(miles)) {
    const remaining = nextMiles - miles;
    cands.push({
      kind: 'miles',
      remaining,
      overdue: remaining <= 0,
      label: remaining <= 0
        ? `Service overdue by ${fmtMiles(Math.abs(remaining))}`
        : `Service in ${fmtMiles(remaining)} (at ${fmtMiles(nextMiles)})`,
    });
  }
  if (vehicle.service_date_next) {
    const due = new Date(String(vehicle.service_date_next) + 'T00:00:00');
    if (!Number.isNaN(due.getTime())) {
      const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
      cands.push({
        kind: 'date',
        remaining: days,
        overdue: days < 0,
        label: days < 0
          ? `Service overdue by ${-days} day${-days === 1 ? '' : 's'}`
          : days === 0
            ? 'Service due today'
            : `Service in ${days} day${days === 1 ? '' : 's'} (${vehicle.service_date_next})`,
      });
    }
  }
  cands.sort((a, b) => a.remaining - b.remaining);
  return cands[0] || { kind: 'none', remaining: Infinity, overdue: false, label: 'No service interval set' };
}

export function sumCosts(list) {
  return (list || []).reduce((t, c) => t + (Number(c.amount) || 0), 0);
}

// Downtime days: each record counts end - start + 1 days (inclusive).
export function downtimeDays(list) {
  return (list || []).reduce((t, d) => {
    const s = new Date(String(d.start_date) + 'T00:00:00');
    const e = new Date(String(d.end_date || d.start_date) + 'T00:00:00');
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return t;
    const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
    return t + Math.max(0, days);
  }, 0);
}

// Dollars per mile, or null when the vehicle has no odometer reading.
export function costPerMile(total, mileage) {
  const m = Number(mileage);
  if (!Number.isFinite(m) || m <= 0) return null;
  return total / m;
}
