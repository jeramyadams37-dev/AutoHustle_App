// Fleet driver contracts — field lists, labels, and formatting.
// The contract wording itself lives in src/lib/fleetPdf.js. Nothing
// here touches the network: contracts are on-device records, Pro-gated
// because they live inside the Fleet page.

export const CONTRACT_TYPES = [
  { value: 'employed', label: 'Employed — I pay the driver' },
  { value: 'lease', label: 'Lease — driver leases the vehicle from me' },
];

export const PAY_PERIODS = [
  { value: 'hour', label: 'per hour' },
  { value: 'week', label: 'per week' },
  { value: 'trip', label: 'per trip' },
];

export const LEASE_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export const PAYER_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'driver', label: 'Driver' },
];

export const DOC_TYPES_VEHICLE = [
  { value: 'registration', label: 'Registration' },
  { value: 'insurance', label: 'Insurance card' },
  { value: 'title', label: 'Title' },
  { value: 'inspection', label: 'Inspection report' },
  { value: 'other', label: 'Other' },
];

export const DOC_TYPES_DRIVER = [
  { value: 'license', label: 'License copy' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
];

export function contractTypeLabel(type) {
  return type === 'lease' ? 'Lease' : 'Employed';
}

export function payerLabel(v) {
  return v === 'driver' ? 'Driver' : 'Owner';
}

export function payPeriodLabel(v) {
  return (PAY_PERIODS.find((p) => p.value === v) || PAY_PERIODS[0]).label;
}

export function leaseFrequencyLabel(v) {
  return (LEASE_FREQUENCIES.find((p) => p.value === v) || LEASE_FREQUENCIES[0]).label;
}

export function docTypeLabel(list, v) {
  return (list.find((d) => d.value === v) || { label: v || 'Document' }).label;
}

export function slug(s) {
  return String(s || '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

export function dateStamp(d) {
  const dt = new Date(d || Date.now());
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Contract PDF name: driver + vehicle + date, so it sorts and reads
// like the shop tickets do.
export function contractFileName(contract, vehicleName) {
  const who = slug(contract.driver_name || 'driver');
  const veh = slug(vehicleName || 'vehicle');
  return `Contract-${contractTypeLabel(contract.type)}-${who}-${veh}_${dateStamp(contract.created_date)}.pdf`;
}

// One-line summary for a contract list row.
export function contractSummary(c) {
  const term = c.start_date ? `${c.start_date}${c.end_date ? ` → ${c.end_date}` : ' → open'}` : 'No dates set';
  if (c.type === 'lease') {
    return `${contractTypeLabel(c.type)} · $${Number(c.lease_amount || 0).toFixed(2)} ${leaseFrequencyLabel(c.lease_frequency).toLowerCase()} · ${term}`;
  }
  return `${contractTypeLabel(c.type)} · $${Number(c.pay_rate || 0).toFixed(2)} ${payPeriodLabel(c.pay_period)} · ${term}`;
}
