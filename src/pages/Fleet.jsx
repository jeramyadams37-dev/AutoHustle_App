// Fleet — Pro-only fleet management (on-device only, no server).
// Dashboard: every garage vehicle with its latest pre-shift verdict,
// assigned driver, next service due, costs and downtime. Driver
// contracts (employed / lease) with PDFs, vehicle + driver photos,
// driver profiles, documents, and fleet PDF exports (status sheet and
// per-vehicle service records).
// Records (all localStorage via base44 entities):
//   Vehicle       — fleet_driver_name, fleet_driver_phone,
//                   fleet_contract_type, service_miles_every,
//                   service_miles_next, service_date_next, fleet_photo
//   PreShiftCheck — saved by PreShift.jsx after every check run
//                   (includes the odometer reading at check time)
//   FleetCost     — { vehicle_id, category, amount, date, note }
//   FleetDowntime — { vehicle_id, start_date, end_date, reason }
//   FleetContract — { vehicle_id, driver_id, driver_name, driver_phone,
//                     type: employed|lease, start_date, end_date,
//                     pay_rate, pay_period, pay_schedule,
//                     lease_amount, lease_frequency, lease_term, deposit,
//                     insurance_by, maintenance_by, repairs_by, fuel_by,
//                     tickets_by, status: active|ended }
//   FleetDriver   — { vehicle_id, name, phone, license_expiry, notes, photo }
//   FleetDocument — { owner_type: vehicle|driver, owner_id, doc_type,
//                     name, data, mime, size }
//   FleetDispatch — { driver_id, vehicle_id, sender: owner|driver,
//                     body, pickup, dropoff, time, pay }
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Truck, CheckCircle2, AlertTriangle, XCircle, Users, DollarSign, CalendarClock, Plus, Trash2, Loader2, Car, FileText, Camera, Download, Eye, User, Paperclip, ShieldCheck, FileSignature, X, Radio, LayoutDashboard } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import TierGate from '@/components/TierGate';
import {
  vehicleName, fmtMoney, fmtMiles, serviceDue, latestCheckFor,
  sumCosts, downtimeDays, costPerMile,
} from '@/lib/fleet';
import {
  CONTRACT_TYPES, PAY_PERIODS, LEASE_FREQUENCIES, PAYER_OPTIONS,
  DOC_TYPES_VEHICLE, DOC_TYPES_DRIVER, contractTypeLabel, payerLabel,
  docTypeLabel, contractSummary,
} from '@/lib/fleetContracts';
import {
  exportContractPDF, exportFleetStatusPDF, exportVehicleStatusPDF,
  exportServiceRecordsPDF,
} from '@/lib/fleetPdf';
import { fileToPhotoDataUrl, fileToDocument, fmtFileSize, viewDocument } from '@/lib/fleetPhotos';

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

function verdictWord(v) {
  return v === 'pass' ? 'GO' : v === 'warn' ? 'CAUTION' : v === 'fail' ? 'DO NOT DRIVE' : 'No check yet';
}

export default function Fleet() {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState([]);
  const [checks, setChecks] = useState([]);
  const [costs, setCosts] = useState([]);
  const [downtime, setDowntime] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [dispatch, setDispatch] = useState([]);
  const [dispatchForm, setDispatchForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [openDriverId, setOpenDriverId] = useState(null);
  const [driverForm, setDriverForm] = useState({});
  const [serviceForm, setServiceForm] = useState({});
  const [costForm, setCostForm] = useState({});
  const [downForm, setDownForm] = useState({});
  const [contractForm, setContractForm] = useState({});
  const [driverEdit, setDriverEdit] = useState(null);
  const [docForm, setDocForm] = useState({});
  const [saving, setSaving] = useState('');
  const [pdfBusy, setPdfBusy] = useState('');

  const load = async () => {
    // Each entity loads on its own so one missing table never blanks
    // the whole page (e.g. PreShiftCheck before the first saved run).
    const safe = async (fn) => {
      try { const r = await fn(); return r.items || []; } catch { return []; }
    };
    const [vp, cp, fp, dp, ct, dr, dc, ds] = await Promise.all([
      safe(() => base44.entities.Vehicle.filter({}, { sort: '-created_date', limit: 100 })),
      safe(() => base44.entities.PreShiftCheck.filter({}, { sort: '-created_date', limit: 200 })),
      safe(() => base44.entities.FleetCost.filter({}, { sort: '-date', limit: 500 })),
      safe(() => base44.entities.FleetDowntime.filter({}, { sort: '-start_date', limit: 200 })),
      safe(() => base44.entities.FleetContract.filter({}, { sort: '-created_date', limit: 200 })),
      safe(() => base44.entities.FleetDriver.filter({}, { sort: '-created_date', limit: 100 })),
      safe(() => base44.entities.FleetDocument.filter({}, { sort: '-created_date', limit: 500 })),
      safe(() => base44.entities.FleetDispatch.filter({}, { sort: '-created_date', limit: 500 })),
    ]);
    setVehicles(vp);
    setChecks(cp);
    setCosts(fp);
    setDowntime(dp);
    setContracts(ct);
    setDrivers(dr);
    setDocs(dc);
    setDispatch(ds);
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
  const contractsFor = (vid) => contracts.filter((c) => c.vehicle_id === vid);
  const driverForVehicle = (vid) => drivers.find((d) => d.vehicle_id === vid) || null;
  const docsFor = (ownerType, ownerId) => docs.filter((d) => d.owner_type === ownerType && d.owner_id === ownerId);
  const checksFor = (vid) => checks.filter((c) => c.vehicle_id === vid);
  const dForm = (v) => driverForm[v.id] || { name: v.fleet_driver_name || '', phone: v.fleet_driver_phone || '', type: v.fleet_contract_type || 'employed' };
  const sForm = (v) => serviceForm[v.id] || { every: v.service_miles_every || '', nextMiles: v.service_miles_next || '', nextDate: v.service_date_next || '' };
  const cForm = (v) => costForm[v.id] || { category: 'parts', amount: '', date: todayISO(), note: '' };
  const wForm = (v) => downForm[v.id] || { start: todayISO(), end: todayISO(), reason: '' };
  const ctForm = (v) => contractForm[v.id] || {
    type: v.fleet_contract_type || 'employed', start_date: todayISO(), end_date: '',
    pay_rate: '', pay_period: 'hour', pay_schedule: '',
    lease_amount: '', lease_frequency: 'monthly', lease_term: '', deposit: '',
    insurance_by: 'owner', maintenance_by: 'owner', repairs_by: 'owner',
    fuel_by: 'driver', tickets_by: 'driver',
  };
  const dcForm = (ownerKey) => docForm[ownerKey] || { doc_type: '', fileName: '' };

  const updateVehicle = async (v, patch) => {
    setSaving(v.id);
    try {
      const updated = await base44.entities.Vehicle.update(v.id, patch);
      setVehicles((vs) => vs.map((x) => (x.id === v.id ? updated : x)));
    } catch (e) { /* ignore */ } finally { setSaving(''); }
  };

  const saveDriver = (v) => {
    const f = dForm(v);
    updateVehicle(v, {
      fleet_driver_name: f.name.trim(), fleet_driver_phone: f.phone.trim(),
      fleet_contract_type: f.type || 'employed',
    });
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

  // --- Vehicle photo ---
  const handleVehiclePhoto = async (v, file) => {
    if (!file) return;
    setSaving('photo-' + v.id);
    try {
      const data = await fileToPhotoDataUrl(file);
      await updateVehicle(v, { fleet_photo: data });
    } catch (e) {
      alert(e?.message || 'Could not save that photo.');
    } finally { setSaving(''); }
  };

  // --- Contracts ---
  const saveContract = async (v) => {
    const f = ctForm(v);
    const driverName = (v.fleet_driver_name || '').trim();
    if (!driverName) { alert('Assign a driver to this vehicle first, then save a contract.'); return; }
    if (!f.start_date) { alert('Set a start date for the contract.'); return; }
    if (f.type === 'employed' && !(parseFloat(f.pay_rate) > 0)) { alert('Set the pay rate for an employed driver.'); return; }
    if (f.type === 'lease' && !(parseFloat(f.lease_amount) > 0)) { alert('Set the lease amount for a lease contract.'); return; }
    const driver = driverForVehicle(v.id);
    setSaving('contract-' + v.id);
    try {
      await base44.entities.FleetContract.create({
        vehicle_id: v.id, driver_id: driver ? driver.id : '',
        driver_name: driverName, driver_phone: (v.fleet_driver_phone || '').trim(),
        type: f.type, start_date: f.start_date, end_date: (f.end_date || '').trim(),
        pay_rate: parseFloat(f.pay_rate) || 0, pay_period: f.pay_period, pay_schedule: (f.pay_schedule || '').trim(),
        lease_amount: parseFloat(f.lease_amount) || 0, lease_frequency: f.lease_frequency,
        lease_term: (f.lease_term || '').trim(), deposit: parseFloat(f.deposit) || 0,
        insurance_by: f.insurance_by, maintenance_by: f.maintenance_by,
        repairs_by: f.repairs_by, fuel_by: f.fuel_by, tickets_by: f.tickets_by,
        status: 'active',
      });
      setContractForm((m) => ({ ...m, [v.id]: undefined }));
      await load();
    } catch (e) { alert('Could not save that contract.'); } finally { setSaving(''); }
  };

  const endContract = async (c) => {
    try {
      await base44.entities.FleetContract.update(c.id, { status: 'ended', end_date: c.end_date || todayISO() });
      await load();
    } catch (e) { /* ignore */ }
  };

  const downloadContract = async (c, v) => {
    setPdfBusy('contract-' + c.id);
    try { await exportContractPDF(c, v); } catch (e) { alert('PDF export failed: ' + (e?.message || e)); }
    finally { setPdfBusy(''); }
  };

  // --- Fleet PDFs ---
  const downloadFleetStatus = async () => {
    setPdfBusy('fleet-status');
    try { await exportFleetStatusPDF(vehicles, checks, costs, downtime); } catch (e) { alert('PDF export failed: ' + (e?.message || e)); }
    finally { setPdfBusy(''); }
  };
  const downloadVehicleStatus = async (v) => {
    setPdfBusy('status-' + v.id);
    try { await exportVehicleStatusPDF(v, checks, costs, downtime); } catch (e) { alert('PDF export failed: ' + (e?.message || e)); }
    finally { setPdfBusy(''); }
  };
  const downloadServiceRecords = async (v) => {
    setPdfBusy('records-' + v.id);
    try { await exportServiceRecordsPDF(v, checks, costs, downtime); } catch (e) { alert('PDF export failed: ' + (e?.message || e)); }
    finally { setPdfBusy(''); }
  };

  // --- Driver profiles ---
  const openNewDriver = () => {
    setDriverEdit({ id: '', vehicle_id: vehicles[0] ? vehicles[0].id : '', name: '', phone: '', license_expiry: '', notes: '', photo: '' });
    setOpenDriverId('new');
  };
  const openDriverProfile = (d) => {
    setDriverEdit({ id: d.id, vehicle_id: d.vehicle_id || '', name: d.name || '', phone: d.phone || '', license_expiry: d.license_expiry || '', notes: d.notes || '', photo: d.photo || '' });
    setOpenDriverId(d.id);
  };
  const saveDriverProfile = async () => {
    const f = driverEdit;
    if (!f || !(f.name || '').trim()) { alert('Give the driver a name first.'); return; }
    setSaving('driver-profile');
    try {
      if (f.id) {
        await base44.entities.FleetDriver.update(f.id, {
          vehicle_id: f.vehicle_id || '', name: f.name.trim(), phone: (f.phone || '').trim(),
          license_expiry: (f.license_expiry || '').trim(), notes: (f.notes || '').trim(), photo: f.photo || '',
        });
      } else {
        await base44.entities.FleetDriver.create({
          vehicle_id: f.vehicle_id || '', name: f.name.trim(), phone: (f.phone || '').trim(),
          license_expiry: (f.license_expiry || '').trim(), notes: (f.notes || '').trim(), photo: f.photo || '',
        });
      }
      // Keep the assigned vehicle's quick driver fields in step.
      if (f.vehicle_id && (f.name || '').trim()) {
        const v = vehicles.find((x) => x.id === f.vehicle_id);
        if (v) {
          const updated = await base44.entities.Vehicle.update(v.id, { fleet_driver_name: f.name.trim(), fleet_driver_phone: (f.phone || '').trim() });
          setVehicles((vs) => vs.map((x) => (x.id === v.id ? updated : x)));
        }
      }
      setOpenDriverId(null);
      setDriverEdit(null);
      await load();
    } catch (e) { alert('Could not save that driver profile.'); } finally { setSaving(''); }
  };
  const handleDriverPhoto = async (file) => {
    if (!file || !driverEdit) return;
    setSaving('photo-driver');
    try {
      const data = await fileToPhotoDataUrl(file);
      setDriverEdit((m) => ({ ...m, photo: data }));
    } catch (e) { alert(e?.message || 'Could not save that photo.'); }
    finally { setSaving(''); }
  };

  // --- Documents ---
  const uploadDoc = async (ownerType, ownerId, ownerKey, file, docType) => {
    if (!file) return;
    if (!docType) { alert('Pick a document type first (registration, insurance, and so on).'); return; }
    setSaving('doc-' + ownerKey);
    try {
      const processed = await fileToDocument(file);
      await base44.entities.FleetDocument.create({
        owner_type: ownerType, owner_id: ownerId, doc_type: docType,
        name: file.name || 'document', data: processed.data, mime: processed.mime, size: processed.size,
      });
      setDocForm((m) => ({ ...m, [ownerKey]: { doc_type: '', fileName: '' } }));
      await load();
    } catch (e) { alert(e?.message || 'Could not save that document.'); }
    finally { setSaving(''); }
  };

  const inputCls = 'tap-target w-full rounded-xl border border-input bg-background px-3 py-2 text-sm';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';
  const saveBtnCls = 'tap-target w-full rounded-xl bg-primary text-primary-foreground font-display font-bold uppercase tracking-wide text-sm py-2.5 disabled:opacity-60';
  const pdfBtnCls = 'tap-target inline-flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-2.5 px-3 font-display font-bold uppercase tracking-wide text-xs disabled:opacity-60';

  const renderVehicle = (v) => {
    const check = latestCheckFor(checks, v.id);
    const vCosts = costsFor(v.id);
    const vDown = downFor(v.id);
    const vContracts = contractsFor(v.id);
    const vDocs = docsFor('vehicle', v.id);
    const total = sumCosts(vCosts);
    const days = downtimeDays(vDown);
    const cpm = costPerMile(total, v.mileage);
    const due = serviceDue(v);
    const open = openId === v.id;
    const df = dForm(v);
    const sf = sForm(v);
    const cf = cForm(v);
    const wf = wForm(v);
    const ctf = ctForm(v);
    const dcf = dcForm('vehicle-' + v.id);
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
              </div>
            </div>
            <VerdictBadge verdict={check?.verdict} />
          </div>
          {check && (
            <p className="text-xs text-muted-foreground mt-2">
              Last check {new Date(check.created_date).toLocaleDateString()}
              {check.odometer ? ` · ${fmtMiles(check.odometer)}` : ''}
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
            {open ? 'Close' : 'Manage — driver, contract, service, costs, docs'}
          </button>
        </div>

        {open && (
          <div className="border-t border-border p-4 space-y-6 bg-zinc-950/40">
            {/* Vehicle photo */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><Camera size={16} className="text-primary" /> Vehicle photo</h3>
              <div className="mt-2 flex items-center gap-3">
                {v.fleet_photo ? (
                  <img src={v.fleet_photo} alt="" className="h-20 w-28 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="h-20 w-28 rounded-xl border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground text-center px-2">No photo yet</div>
                )}
                <div className="flex-1 space-y-2">
                  <label className="tap-target inline-flex items-center gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm font-display font-semibold uppercase tracking-wide cursor-pointer">
                    <Camera size={15} /> {v.fleet_photo ? 'Replace photo' : 'Take or choose photo'}
                    <input
                      type="file" accept="image/*" className="hidden"
                      onChange={(e) => { handleVehiclePhoto(v, e.target.files && e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
                  {v.fleet_photo && (
                    <button onClick={() => updateVehicle(v, { fleet_photo: '' })} className="tap-target block text-xs text-muted-foreground hover:text-red-400">Remove photo</button>
                  )}
                  <p className="text-[11px] text-muted-foreground">Photos are shrunk on the phone before saving, so they stay small. The photo prints in the service records PDF.</p>
                </div>
              </div>
            </div>

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
                <div>
                  <label className={labelCls}>Contract type</label>
                  <select
                    value={df.type}
                    onChange={(e) => setDriverForm((m) => ({ ...m, [v.id]: { ...df, type: e.target.value } }))}
                    className={inputCls}
                  >
                    {CONTRACT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => saveDriver(v)} disabled={saving === v.id} className={saveBtnCls}>
                  {saving === v.id ? 'Saving…' : 'Save driver'}
                </button>
              </div>
            </div>

            {/* Driver contract */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><FileSignature size={16} className="text-primary" /> Driver contract</h3>
              {vContracts.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {vContracts.map((c) => (
                    <div key={c.id} className="rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.type === 'lease' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{contractTypeLabel(c.type)}</span>
                          {c.status === 'ended' && <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-zinc-500/15 text-zinc-400">Ended</span>}
                          <div className="font-medium mt-1">{c.driver_name}</div>
                          <div className="text-xs text-muted-foreground">{contractSummary(c)}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => downloadContract(c, v)} disabled={pdfBusy === 'contract-' + c.id} className="tap-target p-2 text-muted-foreground hover:text-primary" aria-label="Download contract PDF">
                            {pdfBusy === 'contract-' + c.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                          </button>
                          {c.status === 'active' && (
                            <button onClick={() => endContract(c)} className="tap-target px-2 py-1 text-xs text-muted-foreground hover:text-amber-400">End</button>
                          )}
                          <button onClick={() => deleteRow('FleetContract', c.id)} className="tap-target p-2 text-muted-foreground hover:text-red-400" aria-label="Delete contract">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Contract type</label>
                    <select
                      value={ctf.type}
                      onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, type: e.target.value } }))}
                      className={inputCls}
                    >
                      {CONTRACT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Start date</label>
                    <input
                      type="date"
                      value={ctf.start_date}
                      onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, start_date: e.target.value } }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>End date (leave blank for open-ended)</label>
                  <input
                    type="date"
                    value={ctf.end_date}
                    onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, end_date: e.target.value } }))}
                    className={inputCls}
                  />
                </div>
                {ctf.type === 'employed' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Pay rate ($)</label>
                        <input
                          type="number" inputMode="decimal" min="0" step="0.01"
                          value={ctf.pay_rate}
                          onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, pay_rate: e.target.value } }))}
                          placeholder="0.00"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Pay period</label>
                        <select
                          value={ctf.pay_period}
                          onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, pay_period: e.target.value } }))}
                          className={inputCls}
                        >
                          {PAY_PERIODS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Pay schedule (e.g. Every Friday)</label>
                      <input
                        value={ctf.pay_schedule}
                        onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, pay_schedule: e.target.value } }))}
                        placeholder="When do they get paid?"
                        className={inputCls}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Lease amount ($)</label>
                        <input
                          type="number" inputMode="decimal" min="0" step="0.01"
                          value={ctf.lease_amount}
                          onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, lease_amount: e.target.value } }))}
                          placeholder="0.00"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Paid</label>
                        <select
                          value={ctf.lease_frequency}
                          onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, lease_frequency: e.target.value } }))}
                          className={inputCls}
                        >
                          {LEASE_FREQUENCIES.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Lease term (e.g. 6 months)</label>
                        <input
                          value={ctf.lease_term}
                          onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, lease_term: e.target.value } }))}
                          placeholder="How long?"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Security deposit ($) - optional</label>
                        <input
                          type="number" inputMode="decimal" min="0" step="0.01"
                          value={ctf.deposit}
                          onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, deposit: e.target.value } }))}
                          placeholder="0.00"
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className={labelCls}><ShieldCheck size={13} className="inline mr-1" />Who carries insurance?</label>
                  <select
                    value={ctf.insurance_by}
                    onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, insurance_by: e.target.value } }))}
                    className={inputCls}
                  >
                    {PAYER_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Who pays maintenance?</label>
                    <select
                      value={ctf.maintenance_by}
                      onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, maintenance_by: e.target.value } }))}
                      className={inputCls}
                    >
                      {PAYER_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Who pays repairs / damage?</label>
                    <select
                      value={ctf.repairs_by}
                      onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, repairs_by: e.target.value } }))}
                      className={inputCls}
                    >
                      {PAYER_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Who pays fuel?</label>
                    <select
                      value={ctf.fuel_by}
                      onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, fuel_by: e.target.value } }))}
                      className={inputCls}
                    >
                      {PAYER_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Who pays tickets / tolls?</label>
                    <select
                      value={ctf.tickets_by}
                      onChange={(e) => setContractForm((m) => ({ ...m, [v.id]: { ...ctf, tickets_by: e.target.value } }))}
                      className={inputCls}
                    >
                      {PAYER_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button onClick={() => saveContract(v)} disabled={saving === 'contract-' + v.id} className={saveBtnCls}>
                  {saving === 'contract-' + v.id ? 'Saving…' : 'Save contract'}
                </button>
                <p className="text-[11px] text-muted-foreground">The contract PDF is a plain-English template, not legal advice. Have a local attorney review it before you rely on it.</p>
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

            {/* Vehicle documents */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><Paperclip size={16} className="text-primary" /> Documents</h3>
              {vDocs.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {vDocs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{docTypeLabel(DOC_TYPES_VEHICLE, d.doc_type)}</span>
                        <span className="text-muted-foreground"> — {d.name}</span>
                        <div className="text-[11px] text-muted-foreground">{new Date(d.created_date).toLocaleDateString()} · {fmtFileSize(d.size)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => viewDocument(d)} className="tap-target p-2 text-muted-foreground hover:text-primary" aria-label="View document">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => deleteRow('FleetDocument', d.id)} className="tap-target p-2 text-muted-foreground hover:text-red-400" aria-label="Delete document">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                <div>
                  <label className={labelCls}>Document type</label>
                  <select
                    value={dcf.doc_type}
                    onChange={(e) => setDocForm((m) => ({ ...m, ['vehicle-' + v.id]: { ...dcf, doc_type: e.target.value } }))}
                    className={inputCls}
                  >
                    <option value="">Pick a type…</option>
                    {DOC_TYPES_VEHICLE.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <label className="tap-target inline-flex items-center gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm font-display font-semibold uppercase tracking-wide cursor-pointer">
                  <Camera size={15} /> Take photo or choose file
                  <input
                    type="file" accept="image/*,.pdf" className="hidden"
                    onChange={(e) => { uploadDoc('vehicle', v.id, 'vehicle-' + v.id, e.target.files && e.target.files[0], dcf.doc_type); e.target.value = ''; }}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground">Photos are shrunk before saving. Other files are capped at 1.5 MB each — if a file is too big you will get a warning instead of a silent failure.</p>
              </div>
            </div>

            {/* Fleet PDFs for this vehicle */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><FileText size={16} className="text-primary" /> PDFs for this vehicle</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => downloadServiceRecords(v)} disabled={pdfBusy === 'records-' + v.id} className={pdfBtnCls}>
                  {pdfBusy === 'records-' + v.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Service records PDF
                </button>
                <button onClick={() => downloadVehicleStatus(v)} disabled={pdfBusy === 'status-' + v.id} className={pdfBtnCls}>
                  {pdfBusy === 'status-' + v.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Status PDF
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Service records include the photo, service history, and the pre-shift check history. Status is a one-page sheet for this vehicle.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Dispatch (owner <-> driver, on-device for now) ---
  const dispatchFor = (did) => dispatch
    .filter((m) => m.driver_id === did)
    .sort((a, b) => new Date(a.created_date || 0).getTime() - new Date(b.created_date || 0).getTime());
  const lastDispatchFor = (did) => {
    const list = dispatch.filter((m) => m.driver_id === did);
    return list.sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())[0] || null;
  };
  const dpForm = (did) => dispatchForm[did] || { sender: 'owner', body: '', pickup: '', dropoff: '', time: '', pay: '' };
  const sendDispatch = async (d) => {
    const f = dpForm(d.id);
    if (!(f.body || '').trim() && !(f.pickup || '').trim()) { alert('Write a message or a pickup first.'); return; }
    setSaving('dispatch-' + d.id);
    try {
      await base44.entities.FleetDispatch.create({
        driver_id: d.id, vehicle_id: d.vehicle_id || '',
        sender: f.sender || 'owner', body: (f.body || '').trim(),
        pickup: (f.pickup || '').trim(), dropoff: (f.dropoff || '').trim(),
        time: (f.time || '').trim(), pay: parseFloat(f.pay) || 0,
      });
      setDispatchForm((m) => ({ ...m, [d.id]: { sender: f.sender || 'owner', body: '', pickup: '', dropoff: '', time: '', pay: '' } }));
      await load();
    } catch (e) { alert('Could not send that dispatch message.'); } finally { setSaving(''); }
  };

  const licenseDays = (d) => {
    if (!d.license_expiry) return null;
    const t = new Date(String(d.license_expiry) + 'T00:00:00').getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86400000);
  };

  const renderDriver = (d) => {
    const open = openDriverId === d.id;
    const veh = vehicles.find((x) => x.id === d.vehicle_id) || null;
    const activeContract = contracts.find((c) => c.driver_id === d.id && c.status === 'active')
      || contracts.find((c) => c.vehicle_id === d.vehicle_id && c.driver_name === d.name && c.status === 'active')
      || null;
    const dChecks = checksFor(d.vehicle_id).slice(0, 10);
    const dDocs = docsFor('driver', d.id);
    const thread = dispatchFor(d.id);
    const days = licenseDays(d);
    const de = openDriverId === d.id && driverEdit ? driverEdit : null;
    const dcf = dcForm('driver-' + d.id);
    const dpf = dpForm(d.id);
    return (
      <div key={d.id} className="rounded-2xl border border-border bg-card overflow-hidden">
        <button onClick={() => { if (open) { setOpenDriverId(null); setDriverEdit(null); } else { openDriverProfile(d); } }} className="w-full p-4 flex items-center gap-3 text-left">
          {d.photo ? (
            <img src={d.photo} alt="" className="h-12 w-12 rounded-full object-cover border border-border shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-full border border-border bg-zinc-950 flex items-center justify-center shrink-0"><User size={20} className="text-muted-foreground" /></div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-display font-semibold">{d.name}</div>
            <div className="text-xs text-muted-foreground">
              {d.phone || 'No phone'}{veh ? ` · Drives ${vehicleName(veh)}` : ' · No vehicle assigned'}
            </div>
            {d.license_expiry && (
              <div className={`text-xs mt-0.5 ${days !== null && days < 0 ? 'text-red-400 font-semibold' : days !== null && days <= 30 ? 'text-amber-400 font-semibold' : 'text-muted-foreground'}`}>
                License expires {d.license_expiry}{days !== null && days < 0 ? ` — expired ${-days} day${-days === 1 ? '' : 's'} ago` : days !== null && days <= 30 ? ` — ${days} day${days === 1 ? '' : 's'} left` : ''}
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{open ? 'Close' : 'Profile'}</span>
        </button>

        {open && de && (
          <div className="border-t border-border p-4 space-y-6 bg-zinc-950/40">
            {/* Profile */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><User size={16} className="text-primary" /> Driver profile</h3>
              <div className="mt-2 flex items-center gap-3">
                {de.photo ? (
                  <img src={de.photo} alt="" className="h-20 w-20 rounded-full object-cover border border-border" />
                ) : (
                  <div className="h-20 w-20 rounded-full border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground text-center">No photo</div>
                )}
                <div className="flex-1 space-y-2">
                  <label className="tap-target inline-flex items-center gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm font-display font-semibold uppercase tracking-wide cursor-pointer">
                    <Camera size={15} /> {de.photo ? 'Replace photo' : 'Add photo'}
                    <input
                      type="file" accept="image/*" className="hidden"
                      onChange={(e) => { handleDriverPhoto(e.target.files && e.target.files[0]); e.target.value = ''; }}
                    />
                  </label>
                  {de.photo && (
                    <button onClick={() => setDriverEdit((m) => ({ ...m, photo: '' }))} className="tap-target block text-xs text-muted-foreground hover:text-red-400">Remove photo</button>
                  )}
                  <p className="text-[11px] text-muted-foreground">Photos are shrunk on the phone before saving. A photo is optional.</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <div>
                  <label className={labelCls}>Driver name</label>
                  <input value={de.name} onChange={(e) => setDriverEdit((m) => ({ ...m, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="tel" value={de.phone} onChange={(e) => setDriverEdit((m) => ({ ...m, phone: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Assigned vehicle</label>
                  <select value={de.vehicle_id} onChange={(e) => setDriverEdit((m) => ({ ...m, vehicle_id: e.target.value }))} className={inputCls}>
                    <option value="">No vehicle assigned</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{vehicleName(v)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>License expiry date</label>
                  <input type="date" value={de.license_expiry} onChange={(e) => setDriverEdit((m) => ({ ...m, license_expiry: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input value={de.notes} onChange={(e) => setDriverEdit((m) => ({ ...m, notes: e.target.value }))} placeholder="Anything to remember about this driver" className={inputCls} />
                </div>
                <button onClick={saveDriverProfile} disabled={saving === 'driver-profile'} className={saveBtnCls}>
                  {saving === 'driver-profile' ? 'Saving…' : 'Save driver profile'}
                </button>
                <button onClick={() => { deleteRow('FleetDriver', d.id); setOpenDriverId(null); setDriverEdit(null); }} className="tap-target w-full text-xs text-muted-foreground hover:text-red-400 py-1">Delete this driver profile</button>
              </div>
            </div>

            {/* Contract status */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><FileSignature size={16} className="text-primary" /> Contract</h3>
              {activeContract ? (
                <div className="mt-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                  <div className="font-medium">{contractTypeLabel(activeContract.type)} — active</div>
                  <div className="text-xs text-muted-foreground">{contractSummary(activeContract)}</div>
                  <button onClick={() => downloadContract(activeContract, veh || { year: '', make: '', model: '' })} disabled={pdfBusy === 'contract-' + activeContract.id} className="tap-target mt-2 inline-flex items-center gap-1 text-xs text-primary">
                    {pdfBusy === 'contract-' + activeContract.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download contract PDF
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No active contract. Set one up in the vehicle's Manage section, under Driver contract.</p>
              )}
            </div>

            {/* Dispatch thread */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><FileText size={16} className="text-primary" /> Dispatch</h3>
              {thread.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {thread.map((m) => (
                    <div key={m.id} className={`rounded-xl border px-3 py-2 text-sm max-w-[92%] ${m.sender === 'owner' ? 'border-primary/30 bg-primary/10 ml-auto' : 'border-border bg-zinc-950'}`}>
                      <div className="text-[11px] text-muted-foreground">
                        {m.sender === 'owner' ? 'Owner (dispatch)' : `${d.name} (driver)`} · {new Date(m.created_date).toLocaleString()}
                      </div>
                      {m.body && <div className="mt-0.5">{m.body}</div>}
                      {(m.pickup || m.dropoff || m.time || m.pay) && (
                        <div className="mt-1 rounded-lg border border-border bg-zinc-950/60 px-2 py-1.5 text-xs space-y-0.5">
                          {m.pickup && <div>Pickup: {m.pickup}</div>}
                          {m.dropoff && <div>Drop-off: {m.dropoff}</div>}
                          {m.time && <div>Time: {m.time}</div>}
                          {Number(m.pay) > 0 && <div>Pay: {fmtMoney(m.pay)}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No dispatch messages yet. Send the first job below.</p>
              )}
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Send as</label>
                    <select
                      value={dpf.sender}
                      onChange={(e) => setDispatchForm((m) => ({ ...m, [d.id]: { ...dpf, sender: e.target.value } }))}
                      className={inputCls}
                    >
                      <option value="owner">Owner (dispatch)</option>
                      <option value="driver">Driver (reply)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Time</label>
                    <input
                      value={dpf.time}
                      onChange={(e) => setDispatchForm((m) => ({ ...m, [d.id]: { ...dpf, time: e.target.value } }))}
                      placeholder="e.g. Today 2pm"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Message</label>
                  <input
                    value={dpf.body}
                    onChange={(e) => setDispatchForm((m) => ({ ...m, [d.id]: { ...dpf, body: e.target.value } }))}
                    placeholder="Job, schedule change, or a note"
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>Pickup</label>
                    <input
                      value={dpf.pickup}
                      onChange={(e) => setDispatchForm((m) => ({ ...m, [d.id]: { ...dpf, pickup: e.target.value } }))}
                      placeholder="Pickup address"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Drop-off</label>
                    <input
                      value={dpf.dropoff}
                      onChange={(e) => setDispatchForm((m) => ({ ...m, [d.id]: { ...dpf, dropoff: e.target.value } }))}
                      placeholder="Drop-off address"
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Pay for this job ($) - optional</label>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={dpf.pay}
                    onChange={(e) => setDispatchForm((m) => ({ ...m, [d.id]: { ...dpf, pay: e.target.value } }))}
                    placeholder="0.00"
                    className={inputCls}
                  />
                </div>
                <button onClick={() => sendDispatch(d)} disabled={saving === 'dispatch-' + d.id} className={saveBtnCls}>
                  {saving === 'dispatch-' + d.id ? 'Sending…' : 'Send dispatch message'}
                </button>
                <p className="text-[11px] text-muted-foreground">On-device thread — messages live on this phone. For live dispatch to a driver's phone, use Live dispatch + map above.</p>
              </div>
            </div>

            {/* Driver documents */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><Paperclip size={16} className="text-primary" /> Driver documents</h3>
              {dDocs.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {dDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{docTypeLabel(DOC_TYPES_DRIVER, doc.doc_type)}</span>
                        <span className="text-muted-foreground"> — {doc.name}</span>
                        <div className="text-[11px] text-muted-foreground">{new Date(doc.created_date).toLocaleDateString()} · {fmtFileSize(doc.size)}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => viewDocument(doc)} className="tap-target p-2 text-muted-foreground hover:text-primary" aria-label="View document">
                          <Eye size={16} />
                        </button>
                        <button onClick={() => deleteRow('FleetDocument', doc.id)} className="tap-target p-2 text-muted-foreground hover:text-red-400" aria-label="Delete document">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                <div>
                  <label className={labelCls}>Document type</label>
                  <select
                    value={dcf.doc_type}
                    onChange={(e) => setDocForm((m) => ({ ...m, ['driver-' + d.id]: { ...dcf, doc_type: e.target.value } }))}
                    className={inputCls}
                  >
                    <option value="">Pick a type…</option>
                    {DOC_TYPES_DRIVER.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <label className="tap-target inline-flex items-center gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm font-display font-semibold uppercase tracking-wide cursor-pointer">
                  <Camera size={15} /> Take photo or choose file
                  <input
                    type="file" accept="image/*,.pdf" className="hidden"
                    onChange={(e) => { uploadDoc('driver', d.id, 'driver-' + d.id, e.target.files && e.target.files[0], dcf.doc_type); e.target.value = ''; }}
                  />
                </label>
              </div>
            </div>

            {/* Check history for the vehicle they drive */}
            <div>
              <h3 className="font-display font-bold uppercase tracking-wide text-sm flex items-center gap-2"><CalendarClock size={16} className="text-primary" /> Pre-shift checks — {veh ? vehicleName(veh) : 'no vehicle'}</h3>
              {dChecks.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {dChecks.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-zinc-950 px-3 py-2 text-sm">
                      <span className="font-medium">{verdictWord(c.verdict)}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(c.created_date).toLocaleDateString()}{c.odometer ? ` · ${fmtMiles(c.odometer)}` : ''}{c.at_risk ? ` · $${c.at_risk} at risk` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No pre-shift checks saved for this vehicle yet.</p>
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
        Pro — every vehicle, its status, driver, service and costs, on one screen. Costs, contracts, and documents stay on this phone — live dispatch and driver locations go through the shared fleet backend (see Live dispatch + map below).
      </p>

      <TierGate required="pro" feature="Fleet">
      <Link to="/fleet-live" className="tap-target mt-4 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-3 font-display font-bold uppercase tracking-wide text-sm">
        <Radio size={16} /> Live dispatch + driver map
      </Link>
      <Link to="/fleet-dashboard" className="tap-target mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-zinc-950 py-3 font-display font-bold uppercase tracking-wide text-sm">
        <LayoutDashboard size={16} /> Fleet dashboard — status & next service
      </Link>
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
            <div className="mt-4">
              <button onClick={downloadFleetStatus} disabled={pdfBusy === 'fleet-status'} className="tap-target w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 py-3 font-display font-bold uppercase tracking-wide text-sm disabled:opacity-60">
                {pdfBusy === 'fleet-status' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Fleet status PDF
              </button>
            </div>

            {/* Drivers */}
            <h2 className="mt-6 font-display font-bold text-xl flex items-center gap-2">
              <Users size={20} className="text-primary" /> Drivers
            </h2>
            {drivers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No driver profiles yet. Add one to keep their photo, license date, documents, and dispatch thread in one place.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {drivers.map(renderDriver)}
              </div>
            )}
            {openDriverId === 'new' && driverEdit ? (
              <div className="mt-3 rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold uppercase tracking-wide text-sm">New driver</h3>
                  <button onClick={() => { setOpenDriverId(null); setDriverEdit(null); }} className="tap-target text-muted-foreground"><X size={16} /></button>
                </div>
                <div>
                  <label className={labelCls}>Driver name</label>
                  <input value={driverEdit.name} onChange={(e) => setDriverEdit((m) => ({ ...m, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input type="tel" value={driverEdit.phone} onChange={(e) => setDriverEdit((m) => ({ ...m, phone: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Assigned vehicle</label>
                  <select value={driverEdit.vehicle_id} onChange={(e) => setDriverEdit((m) => ({ ...m, vehicle_id: e.target.value }))} className={inputCls}>
                    <option value="">No vehicle assigned</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{vehicleName(v)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>License expiry date</label>
                  <input type="date" value={driverEdit.license_expiry} onChange={(e) => setDriverEdit((m) => ({ ...m, license_expiry: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input value={driverEdit.notes} onChange={(e) => setDriverEdit((m) => ({ ...m, notes: e.target.value }))} placeholder="Anything to remember about this driver" className={inputCls} />
                </div>
                <button onClick={saveDriverProfile} disabled={saving === 'driver-profile'} className={saveBtnCls}>
                  {saving === 'driver-profile' ? 'Saving…' : 'Save driver profile'}
                </button>
                <p className="text-[11px] text-muted-foreground">Add a photo from the profile once it is saved.</p>
              </div>
            ) : (
              <button onClick={openNewDriver} className="tap-target mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-zinc-950 py-2.5 font-display font-bold uppercase tracking-wide text-sm">
                <Plus size={16} /> Add driver
              </button>
            )}

            {/* Dispatch — all threads at a glance */}
            <h2 className="mt-6 font-display font-bold text-xl flex items-center gap-2">
              <FileText size={20} className="text-primary" /> Dispatch
            </h2>
            {drivers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Add a driver profile first, then dispatch jobs to them from their profile.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {drivers.map((d) => {
                  const last = lastDispatchFor(d.id);
                  const veh = vehicles.find((x) => x.id === d.vehicle_id) || null;
                  return (
                    <button key={d.id} onClick={() => openDriverProfile(d)} className="tap-target w-full text-left rounded-2xl border border-border bg-card px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-display font-semibold text-sm">{d.name}{veh ? ` — ${vehicleName(veh)}` : ''}</div>
                          {last ? (
                            <div className="text-xs text-muted-foreground truncate">
                              {last.sender === 'owner' ? 'Owner: ' : 'Driver: '}{last.body || `${last.pickup ? `Pickup ${last.pickup}` : 'Job details'}`} · {new Date(last.created_date).toLocaleDateString()}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">No dispatch messages yet — tap to send the first job.</div>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{dispatchFor(d.id).length} msg{dispatchFor(d.id).length === 1 ? '' : 's'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-6 space-y-4">
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
