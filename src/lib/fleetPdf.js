// Fleet PDFs — driver contracts, fleet status sheet, and per-vehicle
// service records. Same jsPDF approach as src/lib/pdfExport.js:
// text-based letter PDFs, native share sheet on the app, doc.save()
// on the web. The FileSharer filename patch is NOT applied, so contract
// and fleet PDFs use the same export path as shop tickets (Filesystem
// cache + Share on native, browser download on web).
//
// CONTRACTS ARE DRAFT TEMPLATES, NOT LEGAL ADVICE. The wording below is
// plain English written for this app. It is not a lawyer's work and it
// may not fit a particular situation. Every contract PDF carries that
// warning in its footer and in its own final section, and the owner
// should have a local attorney review a contract before relying on it.
import { jsPDF } from 'jspdf';
import {
  vehicleName, fmtMoney, fmtMiles, serviceDue, latestCheckFor,
  sumCosts, downtimeDays, costPerMile,
} from './fleet';
import {
  contractTypeLabel, payerLabel, payPeriodLabel, leaseFrequencyLabel,
  contractFileName, slug, dateStamp,
} from './fleetContracts';

const OWNER_LINE = 'Jeramy Adams, doing business as AtotheI';
const DISCLAIMER =
  'DRAFT TEMPLATE - NOT LEGAL ADVICE. This is a plain-English template to help the owner and the driver agree on terms. ' +
  'It is not a lawyer\'s work and it may not fit your situation. Have a local attorney review any contract before you rely on it.';

function verdictWord(v) {
  return v === 'pass' ? 'GO' : v === 'warn' ? 'CAUTION' : v === 'fail' ? 'DO NOT DRIVE' : 'No check yet';
}

// Same export path as shop tickets (see src/lib/pdfExport.js).
async function savePdf(doc, name) {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = doc.output('datauristring').split(',')[1];
      const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      await Share.share({ title: name, url: f.uri, dialogTitle: 'Save or share PDF' });
    } catch (e) {
      if (!String(e?.message || e).toLowerCase().includes('cancel')) alert('PDF export failed: ' + (e?.message || e));
    }
    return;
  }
  doc.save(name);
}

function makeDoc(title) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 48;
  const line = (text, size = 11, style = 'normal', color = [20, 18, 16]) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const wrapped = doc.splitTextToSize(String(text), W - 72);
    wrapped.forEach((w) => {
      if (y > H - 48) { doc.addPage(); y = 48; }
      doc.text(w, 36, y);
      y += size + 4;
    });
  };
  const gap = (n = 8) => { y += n; };
  const heading = (text) => { gap(6); line(text, 12, 'bold', [249, 115, 22]); };
  doc.setFillColor(20, 18, 16);
  doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(249, 115, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 36, 22);
  y = 56;
  return { doc, line, gap, heading, getY: () => y };
}

function addFooter(doc, text) {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(text, 36, H - 20);
    doc.text(`Page ${i} of ${pages}`, W - 36, H - 20, { align: 'right' });
  }
}

function dateLine(d) {
  return new Date(d || Date.now()).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// DRIVER CONTRACTS
// ---------------------------------------------------------------------------

function contractSections(c, vehicle) {
  const driver = c.driver_name || 'Driver';
  const veh = vehicleName(vehicle);
  const vehLine = `Vehicle: ${veh}${vehicle?.engine ? ` - ${vehicle.engine}` : ''}${vehicle?.mileage ? ` - ${fmtMiles(vehicle.mileage)} on the odometer` : ''}.`;
  const start = c.start_date || '';
  const end = c.end_date || '';
  const termLine = start
    ? (end
      ? `This agreement starts on ${start} and ends on ${end}.`
      : `This agreement starts on ${start} and runs until either side ends it as set out below.`)
    : 'Start and end dates are set out on the Fleet page for this contract.';
  const insurance = c.insurance_by === 'driver'
    ? 'The Driver will carry their own insurance that covers the Vehicle while the Driver is using it for work. The Driver will give the Owner proof of that insurance before the start date, and again whenever the policy renews or changes.'
    : 'The Owner will carry insurance on the Vehicle. The Driver may drive the Vehicle for work while covered under the Owner\'s policy. The Driver must tell the Owner at once about any accident, damage, or ticket.';
  const s = [];
  s.push({ h: '1. Parties', body: [
    `This agreement is between ${OWNER_LINE} (the "Owner") and ${driver} (the "Driver").`,
    c.driver_phone ? `Driver phone: ${c.driver_phone}` : '',
  ] });
  s.push({ h: '2. Vehicle', body: [vehLine, 'The Owner is letting the Driver use this Vehicle as set out below.'] });

  if (c.type === 'lease') {
    s.push({ h: '3. Lease Term', body: [termLine] });
    s.push({ h: '4. Lease Payments and Security Deposit', body: [
      `The Driver will pay the Owner ${fmtMoney(c.lease_amount)} ${leaseFrequencyLabel(c.lease_frequency).toLowerCase()}. The first payment is due on the start date.`,
      Number(c.deposit) > 0
        ? `The Driver will pay a security deposit of ${fmtMoney(c.deposit)} before the start date.`
        : 'No security deposit is due under this agreement.',
    ] });
  } else {
    s.push({ h: '3. Term of Employment', body: [termLine] });
    s.push({ h: '4. Pay', body: [
      `The Owner will pay the Driver ${fmtMoney(c.pay_rate)} ${payPeriodLabel(c.pay_period)}.`,
      c.pay_schedule ? `Pay is made ${c.pay_schedule}.` : 'Pay is made on the Owner\'s normal pay schedule.',
    ] });
  }

  s.push({ h: '5. Insurance', body: [insurance] });
  s.push({ h: '6. Maintenance, Repairs and Damage', body: [
    `Maintenance: the ${payerLabel(c.maintenance_by).toLowerCase()} pays for routine maintenance - oil, tires, brakes, and scheduled service.`,
    `Repairs and damage: the ${payerLabel(c.repairs_by).toLowerCase()} pays for repairs and damage to the Vehicle while it is in the Driver's care.`,
    'The Driver must tell the Owner about any new damage or problem as soon as they notice it.',
  ] });
  s.push({ h: '7. Fuel', body: [`Fuel: the ${payerLabel(c.fuel_by).toLowerCase()} pays for fuel used in the Vehicle.`] });
  s.push({ h: '8. Tickets, Tolls and Fines', body: [`Tickets, tolls and fines: the ${payerLabel(c.tickets_by).toLowerCase()} pays for any tickets, tolls, or fines the Driver gets while driving the Vehicle.`] });
  s.push({ h: '9. Use of the Vehicle', body: c.type === 'lease'
    ? ['The Driver leases the Vehicle for their own use, including delivery and driving work. The Driver will not lend the Vehicle to anyone else.']
    : ['The Driver will use the Vehicle for the Owner\'s delivery and driving work, and for the driving the Owner asks them to do. The Driver will not lend the Vehicle to anyone else or use it for work for another business without the Owner\'s say-so.'] });
  s.push({ h: c.type === 'lease' ? '10. Ending the Lease' : '10. Ending This Agreement', body: c.type === 'lease'
    ? [
      'Either side can end this lease with 14 days\' written notice.',
      'The Driver must return the Vehicle in the same condition it was received in, apart from normal wear.',
      Number(c.deposit) > 0
        ? 'Any security deposit is returned within 30 days after the Vehicle is returned, less anything the Driver still owes under this agreement.'
        : '',
    ]
    : [
      'Either side can end this agreement with 7 days\' written notice.',
      'On the last day, the Driver must return the Vehicle, the keys, and anything else belonging to the Owner.',
    ] });
  s.push({ h: '11. Signatures', body: [
    `Owner - Jeramy Adams: ________________________________   Date: ____________`,
    `Driver - ${driver}: ________________________________   Date: ____________`,
  ] });
  return s;
}

export async function exportContractPDF(contract, vehicle) {
  const isLease = contract.type === 'lease';
  const title = isLease ? 'VEHICLE LEASE AGREEMENT' : 'DRIVER EMPLOYMENT AGREEMENT';
  const { doc, line, gap, heading } = makeDoc(`AUTO-HUSTLE  ·  ${title}`);
  line(`Fleet contract - ${vehicleName(vehicle)}`, 13, 'bold');
  line(`Contract date: ${dateLine(contract.created_date)}${contract.status === 'ended' ? '  ·  ENDED' : ''}`, 10, 'normal', [120, 113, 108]);
  gap(4);
  contractSections(contract, vehicle).forEach((sec) => {
    heading(sec.h);
    sec.body.filter(Boolean).forEach((b) => line(b, 10));
  });
  gap(10);
  line('IMPORTANT - READ THIS', 12, 'bold', [220, 38, 38]);
  line(DISCLAIMER, 10, 'bold', [220, 38, 38]);
  addFooter(doc, 'AUTO-HUSTLE FLEET CONTRACT - DRAFT TEMPLATE, NOT LEGAL ADVICE');
  await savePdf(doc, contractFileName(contract, vehicleName(vehicle)));
}

// ---------------------------------------------------------------------------
// FLEET STATUS — fleet-wide sheet, plus a single-vehicle version
// ---------------------------------------------------------------------------

function statusLinesFor(v, checks, costs, downtime) {
  const check = latestCheckFor(checks, v.id);
  const vCosts = (costs || []).filter((c) => c.vehicle_id === v.id);
  const vDown = (downtime || []).filter((d) => d.vehicle_id === v.id);
  const total = sumCosts(vCosts);
  const days = downtimeDays(vDown);
  const cpm = costPerMile(total, v.mileage);
  const due = serviceDue(v);
  return {
    check,
    lines: [
      check
        ? `Latest check: ${verdictWord(check.verdict)} on ${dateLine(check.created_date)}${check.odometer ? ` - ${fmtMiles(check.odometer)}` : ''}${check.at_risk ? ` - $${check.at_risk} was at risk` : ''}`
        : 'Latest check: no pre-shift check saved yet',
      v.fleet_driver_name
        ? `Driver: ${v.fleet_driver_name}${v.fleet_driver_phone ? ` - ${v.fleet_driver_phone}` : ''}`
        : 'Driver: no driver assigned',
      `Next service: ${due.label}`,
      `Spent: ${fmtMoney(total)}   Cost/mile: ${cpm === null ? '-' : `${fmtMoney(cpm)}/mi`}   Downtime: ${days} day${days === 1 ? '' : 's'}`,
    ],
  };
}

export async function exportFleetStatusPDF(vehicles, checks, costs, downtime) {
  const list = vehicles || [];
  const { doc, line, gap, heading } = makeDoc('AUTO-HUSTLE  ·  FLEET STATUS');
  line(`Fleet status sheet - ${dateLine(Date.now())}`, 13, 'bold');
  const spend = sumCosts(costs);
  const downDays = downtimeDays(downtime);
  const counts = { pass: 0, warn: 0, fail: 0, none: 0 };
  list.forEach((v) => {
    const c = latestCheckFor(checks, v.id);
    if (!c) counts.none += 1;
    else counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  });
  line(
    `${list.length} vehicle${list.length === 1 ? '' : 's'}  ·  Fleet spend ${fmtMoney(spend)}  ·  ${downDays} down days  ·  GO ${counts.pass}  ·  CAUTION ${counts.warn}  ·  DO NOT DRIVE ${counts.fail}  ·  No check yet ${counts.none}`,
    10, 'normal', [120, 113, 108],
  );
  gap(6);
  list.forEach((v) => {
    const { lines } = statusLinesFor(v, checks, costs, downtime);
    heading(vehicleName(v));
    lines.forEach((t) => line(`  ${t}`, 10));
  });
  if (!list.length) line('No vehicles in the garage yet.', 10);
  gap(8);
  line('Generated on this phone by AutoHustle Fleet. Records are kept on-device only.', 9, 'normal', [120, 113, 108]);
  addFooter(doc, 'AUTO-HUSTLE FLEET STATUS');
  await savePdf(doc, `Fleet-Status_${dateStamp(Date.now())}.pdf`);
}

export async function exportVehicleStatusPDF(vehicle, checks, costs, downtime) {
  const { doc, line, gap, heading } = makeDoc('AUTO-HUSTLE  ·  VEHICLE STATUS');
  line(vehicleName(vehicle), 13, 'bold');
  line(`Status sheet - ${dateLine(Date.now())}`, 10, 'normal', [120, 113, 108]);
  gap(4);
  const { check, lines } = statusLinesFor(vehicle, checks, costs, downtime);
  lines.forEach((t) => line(t, 10));
  if (check && check.checks && check.checks.length) {
    heading('Latest pre-shift check - detail');
    check.checks.forEach((c) => line(`  ${c.name}: ${String(c.status || '').toUpperCase()} - ${c.detail || ''}`, 10));
  }
  gap(8);
  line('Generated on this phone by AutoHustle Fleet. Records are kept on-device only.', 9, 'normal', [120, 113, 108]);
  addFooter(doc, 'AUTO-HUSTLE VEHICLE STATUS');
  await savePdf(doc, `${slug(vehicleName(vehicle))}_Status_${dateStamp(Date.now())}.pdf`);
}

// ---------------------------------------------------------------------------
// SERVICE RECORDS — per-vehicle chronological history
// ---------------------------------------------------------------------------

function imageDims(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 800, h: img.naturalHeight || 600 });
      img.onerror = () => resolve({ w: 800, h: 600 });
      img.src = dataUrl;
    } catch (e) {
      resolve({ w: 800, h: 600 });
    }
  });
}

export async function exportServiceRecordsPDF(vehicle, checks, costs, downtime) {
  const { doc, line, gap, heading } = makeDoc('AUTO-HUSTLE  ·  SERVICE RECORDS');
  line(vehicleName(vehicle), 13, 'bold');
  line(`Service records - ${dateLine(Date.now())}`, 10, 'normal', [120, 113, 108]);
  gap(4);
  if (vehicle.fleet_photo) {
    try {
      const dims = await imageDims(vehicle.fleet_photo);
      const maxW = 220;
      const maxH = 140;
      const scale = Math.min(maxW / dims.w, maxH / dims.h, 1);
      const w = Math.round(dims.w * scale);
      const h = Math.round(dims.h * scale);
      doc.addImage(vehicle.fleet_photo, 'JPEG', 36, 92, w, h);
      // Move the text cursor below the photo (header ends near y=92).
      gap(h + 8);
    } catch (e) { /* photo is optional — records print without it */ }
  }
  const due = serviceDue(vehicle);
  line(`Service interval: ${vehicle.service_miles_every ? `every ${fmtMiles(vehicle.service_miles_every)}` : 'not set'}`, 10);
  line(`Next service: ${due.label}`, 10);
  if (vehicle.fleet_driver_name) line(`Driver: ${vehicle.fleet_driver_name}${vehicle.fleet_driver_phone ? ` - ${vehicle.fleet_driver_phone}` : ''}`, 10);
  gap(4);

  // Chronological service history: cost entries + downtime entries,
  // oldest first.
  const vCosts = (costs || []).filter((c) => c.vehicle_id === vehicle.id);
  const vDown = (downtime || []).filter((d) => d.vehicle_id === vehicle.id);
  const events = [
    ...vCosts.map((c) => ({ date: c.date || c.created_date, text: `${String(c.category || 'Cost').charAt(0).toUpperCase() + String(c.category || '').slice(1)} - ${fmtMoney(c.amount)}${c.note ? ` - ${c.note}` : ''}` })),
    ...vDown.map((d) => ({ date: d.start_date || d.created_date, text: `Down ${d.start_date || ''} to ${d.end_date || d.start_date || ''} - ${downtimeDays([d])} day${downtimeDays([d]) === 1 ? '' : 's'}${d.reason ? ` - ${d.reason}` : ''}` })),
  ].sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
  heading('Service history');
  if (!events.length) line('No service entries logged yet.', 10);
  events.forEach((e) => line(`  ${dateLine(e.date)} - ${e.text}`, 10));
  line(`Total spend on this vehicle: ${fmtMoney(sumCosts(vCosts))}`, 10, 'bold');
  gap(4);

  // Pre-shift check history: every saved run, oldest first, with
  // verdict, date, odometer and dollars at risk.
  const vChecks = (checks || [])
    .filter((c) => c.vehicle_id === vehicle.id)
    .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  heading('Pre-shift check history');
  if (!vChecks.length) line('No pre-shift checks saved yet. Run a pre-shift check and it will be logged here.', 10);
  vChecks.forEach((c) => {
    line(
      `  ${dateLine(c.created_date)} - ${verdictWord(c.verdict)}${c.odometer ? ` - ${fmtMiles(c.odometer)}` : ''}${c.at_risk ? ` - $${c.at_risk} was at risk` : ''}${c.live_used ? ' (live data)' : ' (manual)'}`,
      10,
    );
  });
  gap(8);
  line('Generated on this phone by AutoHustle Fleet. Records are kept on-device only.', 9, 'normal', [120, 113, 108]);
  addFooter(doc, 'AUTO-HUSTLE SERVICE RECORDS');
  await savePdf(doc, `${slug(vehicleName(vehicle))}_Service-Records_${dateStamp(Date.now())}.pdf`);
}
