import { jsPDF } from 'jspdf';

// Builds a clean text-based PDF of the full shop ticket.
export async function exportTicketPDF(ticket) {
  const d = ticket.ticket_data || {};
  const h = d.header || {};
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  let y = 48;
  const lh = 14;

  const line = (text, size = 11, style = 'normal', color = [20, 18, 16]) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    text = String(text)
      .replace(/⚠\uFE0F?\s*SAFETY:/g, 'SAFETY:')
      .replace(/⚠\uFE0F?\s*/g, 'WARNING: ')
      .replace(/\s*\[Torque:\s*(N\/?A|none|-|—)?\s*\]/gi, '');
    const wrapped = doc.splitTextToSize(text, W - 72);
    wrapped.forEach((w) => {
      if (y > 760) { doc.addPage(); y = 48; }
      doc.text(w, 36, y); y += size + 4;
    });
  };
  const gap = (n = 8) => (y += n);

  doc.setFillColor(20, 18, 16); doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(249, 115, 22); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text('AUTO-HUSTLE  ·  DIAGNOSTIC SHOP TICKET', 36, 22);
  y = 56;

  line(`Date: ${new Date(ticket.created_date || Date.now()).toLocaleDateString()}`, 10, 'normal', [120, 113, 108]);
  line(`Vehicle: ${h.vehicle_summary || ticket.vehicle_summary}`, 13, 'bold');
  line(`Symptoms: ${h.symptoms || ticket.symptoms}`, 10);
  if (h.dtcs || ticket.dtcs) line(`DTCs: ${h.dtcs || ticket.dtcs}`, 10, 'normal', [180, 83, 9]);
  if (h.system_focus) line(`System: ${h.system_focus}`, 10, 'normal', [120, 113, 108]);
  gap(10);

  const m1 = d.module1 || {};
  if (m1.specs?.length) {
    line('MODULE 1 — TECHNICAL SPECIFICATIONS & DIAGNOSTIC PROTOCOLS', 12, 'bold', [249, 115, 22]);
    line('Quick-Reference Specs', 11, 'bold');
    m1.specs.forEach((s) => line(`  ${s.component}: ${s.value}`, 10));
    gap(4);
    if (m1.root_causes?.length) {
      line('Possible Root Causes (ranked):', 11, 'bold');
      m1.root_causes.forEach((c, i) => line(`${i + 1}. ${c.cause} [${c.likelihood}] — ${c.explanation || ''}`, 10));
      gap(4);
    }
    if (m1.diagnostic_tests?.length) {
      line('Diagnostic Tests (in order):', 11, 'bold');
      m1.diagnostic_tests.forEach((t) => line(`${t.id}. ${t.name} — expected: ${t.expected_reading}. ${t.description || ''}`, 10));
      gap(4);
    }
    if (m1.circuit_tests?.length) {
      line('Circuit Test Path:', 11, 'bold');
      m1.circuit_tests.forEach((c) => line(`${c.id}. ${c.label} — ${c.wire_color}, ${c.location} — expected: ${c.expected_value}`, 10));
      gap(8);
    }
  }

  const m2 = d.module2 || {};
  if (m2.phases?.length) {
    line('MODULE 2 — GRANULAR REPAIR PROCEDURE', 12, 'bold', [249, 115, 22]);
    m2.phases.forEach((ph) => {
      line(`Phase: ${ph.name}`, 11, 'bold');
      ph.steps.forEach((s) => {
        let txt = `${s.id}. ${s.instruction}`;
        if (s.torque_spec) txt += `  [Torque: ${s.torque_spec}]`;
        if (s.tool_size) txt += `  [Tool: ${s.tool_size}]`;
        line(txt, 10);
        if (s.safety_warning) line(`  ⚠ SAFETY: ${s.safety_warning}`, 9, 'bold', [220, 38, 38]);
      });
      gap(4);
    });
  }

  const m3 = d.module3 || {};
  if (m3.components?.length) {
    line('MODULE 3 — COMPONENT LOCATION REFERENCE', 12, 'bold', [249, 115, 22]);
    m3.components.forEach((c) => line(`${c.id}. ${c.name} — ${c.location} — tool: ${c.tool_needed || '—'}`, 10));
    gap(8);
  }

  const m4 = d.module4 || {};
  if (m4.recommendations?.length) {
    line('MODULE 4 — PREVENTIVE & OVERLAPPING SERVICE', 12, 'bold', [249, 115, 22]);
    m4.recommendations.forEach((r) => line(`• ${r.job} — ${r.reason}${r.overlap ? ` (${r.overlap})` : ''}`, 10));
    gap(8);
  }

  if (d.safety_warnings?.length) {
    line('SAFETY WARNINGS', 12, 'bold', [220, 38, 38]);
    d.safety_warnings.forEach((w) => line(`⚠ ${w.title}: ${w.text}`, 10, 'bold', [220, 38, 38]));
  }

  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(`ah_parts_${ticket.id}`) : null;
    const pr = raw ? JSON.parse(raw) : null;
    if (pr && pr.data) {
      const m = (n) => (n == null || Number.isNaN(Number(n)) ? '-' : `$${Number(n).toFixed(2)}`);
      const clean = (x) => String(x).replace(/[\u2000-\u200B\u202F\u00A0]/g, ' ').replace(/[\u2013\u2014]/g, '-');
      const t = pr.totals || {};
      gap(10);
      line('PARTS, STORES & LABOR ESTIMATE', 12, 'bold', [249, 115, 22]);
      line(`Searched ${new Date(pr.savedAt).toLocaleDateString()} for ZIP ${pr.zip}. Estimates from web search, not quotes. Call the store to confirm.`, 9, 'normal', [120, 113, 108]);
      (pr.data.items || []).forEach((i) => line(`  ${clean(i.name)}: ${m(i.low)} - ${m(i.high)}${i.source ? ` (${clean(i.source)})` : ''}`, 10));
      line(`Parts total (tools excluded): ${m(t.pLow)} - ${m(t.pHigh)}`, 10, 'bold');
      if (t.h1 != null && t.r1 != null) line(`Labor: ${t.h1}${t.h2 !== t.h1 ? `-${t.h2}` : ''} hr at $${t.r1}${t.r2 !== t.r1 ? `-${t.r2}` : ''}/hr = ${m(t.lLow)} - ${m(t.lHigh)}${t.mine ? ' (your rate/hours)' : ''}`, 10, 'bold');
      line(`Estimated total: ${m((t.pLow || 0) + (t.lLow || 0))} - ${m((t.pHigh || 0) + (t.lHigh || 0))}`, 11, 'bold');
      if ((pr.data.stores || []).length) {
        gap(4);
        line('Nearby parts stores:', 11, 'bold');
        pr.data.stores.forEach((s) => {
          line(`  ${clean(s.name)} - ${clean(s.address)}`, 10, 'bold');
          line(`    Phone: ${s.phone || 'n/a'}`, 10);
          if (s.hours && s.hours.length) line(`    Hours: ${clean(s.hours.join(' | '))}`, 9, 'normal', [120, 113, 108]);
        });
      }
    }
  } catch (e) { /* skip pricing section if unreadable */ }
  const dt = new Date(ticket.created_date || Date.now());
  const ymd = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const veh = String(h.vehicle_summary || ticket.vehicle_summary || 'ticket').split(',')[0]
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ticket';
  const name = `${veh}_${ymd}.pdf`;
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = doc.output('datauristring').split(',')[1];
      const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      await Share.share({ title: name, url: f.uri, dialogTitle: 'Save or print ticket' });
    } catch (e) {
      if (!String(e?.message || e).toLowerCase().includes('cancel')) alert('PDF export failed: ' + (e?.message || e));
    }
    return;
  }
  doc.save(name);
}
