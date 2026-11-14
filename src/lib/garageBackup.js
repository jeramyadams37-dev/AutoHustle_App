// AutoHustle garage backup — manual export / import (Free tier).
// The whole garage lives in on-device localStorage (see
// src/api/base44Client.js): one key per entity, `ah_<Entity>`.
// A backup is one JSON file covering every entity EXCEPT credentials.
// It never leaves the user's hands except where they choose to save it
// (Share sheet / Downloads), and a Drive backup (src/lib/driveBackup.js)
// uses the same file format, so either path restores the other.
//
// NEVER in a backup file (credentials — they stay on this phone only):
//   ah_accounts_v1, ah_session_v1, ah_gemini_key_<accountId> (+ legacy
//   ah_gemini_key), ah_fleet_rt_<accountId> (fleet member token).
// Also excluded (rebuildable, not garage data): ah_parts_<ticket.id>
// (cached PartsFinder results) and `backend_url`.
//
// Restore is replace-all with a confirm step in the UI, plus a
// pre-restore auto-save of the current garage (one slot,
// ah_garage_backup_pre_restore) so a bad restore is undoable.
// No Capacitor imports at the top of this file — the Share/Filesystem
// calls are dynamic imports inside exportBackupFile(), so this module
// stays importable (and unit-testable) outside the app.

export const BACKUP_APP = 'autohustle';
export const BACKUP_KIND = 'garage-backup';
export const BACKUP_VERSION = 1;

// Entities in the file. FleetDispatch IS written on-device
// (src/pages/Fleet.jsx sendDispatch — the on-device dispatch record),
// so it is backed up too. The backend's live dispatch is server-side
// and is not in here.
export const BACKUP_ENTITIES = [
  'Vehicle',
  'Ticket',
  'PreShiftCheck',
  'FleetCost',
  'FleetDowntime',
  'FleetContract',
  'FleetDriver',
  'FleetDocument',
  'FleetDispatch',
];

const META_KEY = 'ah_garage_backup_meta';
const PRE_RESTORE_KEY = 'ah_garage_backup_pre_restore';
// localStorage is about 5 MB per origin in the Android WebView —
// warn before a backup (or a restore) gets close to that ceiling.
export const BACKUP_WARN_BYTES = 4 * 1024 * 1024;

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'bk-' + Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function readRows(name) {
  try {
    const raw = localStorage.getItem('ah_' + name);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRows(name, rows) {
  localStorage.setItem('ah_' + name, JSON.stringify(rows));
}

export function backupFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `autohustle-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}.json`
  );
}

// Counts of what is on this device right now, for the UI.
export function garageCounts() {
  const counts = {};
  for (const name of BACKUP_ENTITIES) counts[name] = readRows(name).length;
  return counts;
}

export function garageTotalCount() {
  return Object.values(garageCounts()).reduce((a, b) => a + b, 0);
}

// Build the backup file object. Corrupt keys export as [] and are
// listed in warnings — a damaged key must not block the rest.
export function buildBackupFile() {
  const data = {};
  const counts = {};
  const warnings = [];
  for (const name of BACKUP_ENTITIES) {
    let rows = [];
    try {
      const raw = localStorage.getItem('ah_' + name);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) rows = parsed;
        else warnings.push(`${name}: not a list — exported as empty`);
      }
    } catch {
      warnings.push(`${name}: unreadable — exported as empty`);
    }
    data[name] = rows;
    counts[name] = rows.length;
  }
  const file = {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    counts,
    data,
  };
  if (warnings.length) file.warnings = warnings;
  return file;
}

export function backupFileBytes(file) {
  try {
    return new Blob([JSON.stringify(file)]).size;
  } catch {
    return JSON.stringify(file).length;
  }
}

// Strict validation. Returns { ok: true, file } with ids normalised,
// or { ok: false, error } with a plain-English reason.
export function validateBackupFile(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "That file isn't an AutoHustle backup." };
  }
  if (raw.app !== BACKUP_APP || raw.kind !== BACKUP_KIND) {
    return { ok: false, error: "That file isn't an AutoHustle backup." };
  }
  if (raw.version !== BACKUP_VERSION) {
    return { ok: false, error: `That backup is version ${raw.version || 'unknown'} — this app reads version ${BACKUP_VERSION}.` };
  }
  const data = raw.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: "That backup has no garage data in it." };
  }
  // Normalise: every present entity must be an array of row objects.
  // Rows without a usable id get one; duplicate ids inside one entity
  // keep the first row only (a restore must never re-issue an id).
  const clean = {};
  let dropped = 0;
  for (const name of BACKUP_ENTITIES) {
    if (data[name] === undefined) continue; // absent = keep current rows
    if (!Array.isArray(data[name])) {
      return { ok: false, error: `That backup's ${name} list is damaged.` };
    }
    const seen = new Set();
    const rows = [];
    for (const row of data[name]) {
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        dropped += 1;
        continue;
      }
      const copy = { ...row };
      if (typeof copy.id !== 'string' || !copy.id) copy.id = uid();
      if (seen.has(copy.id)) {
        dropped += 1;
        continue;
      }
      seen.add(copy.id);
      rows.push(copy);
    }
    clean[name] = rows;
  }
  const counts = {};
  for (const name of BACKUP_ENTITIES) counts[name] = clean[name] ? clean[name].length : null;
  return {
    ok: true,
    file: {
      app: raw.app,
      kind: raw.kind,
      version: raw.version,
      exported_at: typeof raw.exported_at === 'string' ? raw.exported_at : '',
      counts,
      data: clean,
    },
    dropped,
  };
}

// Parse pasted / picked file text into a restore preview for the
// confirm step. Nothing is written until confirmRestore() runs.
export function previewBackupFromText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't readable — pick the JSON file AutoHustle exported." };
  }
  const v = validateBackupFile(parsed);
  if (!v.ok) return v;
  const counts = {};
  for (const name of BACKUP_ENTITIES) counts[name] = v.file.data[name] ? v.file.data[name].length : null;
  return { ok: true, file: v.file, dropped: v.dropped, exportedAt: v.file.exported_at, counts };
}

// Apply a validated backup file: replace-all for every entity the
// file carries. Entities the file does NOT carry are left untouched
// (an old backup predates them — wiping them would be data loss).
// The current garage is auto-saved first (one slot) so the restore
// can be undone. Returns counts for the UI.
export function applyBackupFile(file) {
  const current = buildBackupFile();
  try {
    localStorage.setItem(PRE_RESTORE_KEY, JSON.stringify(current));
  } catch {
    // Quota full: the pre-restore snapshot could not be saved. The
    // restore still goes ahead — the UI says the undo is unavailable.
  }
  const restored = {};
  const kept = [];
  for (const name of BACKUP_ENTITIES) {
    if (file.data[name] === undefined) {
      kept.push(name);
      continue;
    }
    writeRows(name, file.data[name]);
    restored[name] = file.data[name].length;
  }
  const meta = getBackupMeta();
  meta.lastRestoreAt = new Date().toISOString();
  setBackupMeta(meta);
  return { restored, kept, hasUndo: hasPreRestoreSnapshot() };
}

export function hasPreRestoreSnapshot() {
  try {
    return !!localStorage.getItem(PRE_RESTORE_KEY);
  } catch {
    return false;
  }
}

// One-shot undo: puts the pre-restore snapshot back, then clears
// the slot. Returns counts, or { ok: false } when there is nothing
// to undo.
export function undoRestore() {
  let snapshot = null;
  try {
    snapshot = JSON.parse(localStorage.getItem(PRE_RESTORE_KEY) || 'null');
  } catch {
    snapshot = null;
  }
  if (!snapshot) return { ok: false, error: 'Nothing to undo — no pre-restore snapshot.' };
  const v = validateBackupFile(snapshot);
  if (!v.ok) return { ok: false, error: 'The saved snapshot is damaged — it cannot be put back.' };
  const restored = {};
  for (const name of BACKUP_ENTITIES) {
    if (v.file.data[name] === undefined) continue;
    writeRows(name, v.file.data[name]);
    restored[name] = v.file.data[name].length;
  }
  try {
    localStorage.removeItem(PRE_RESTORE_KEY);
  } catch {
    // Ignore — the slot stays, the data is back.
  }
  return { ok: true, restored };
}

// --- Backup metadata (NOT garage data, never in a backup file) -----
export function getBackupMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function setBackupMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta || {}));
  } catch {
    // Meta loss is not fatal — the garage itself is untouched.
  }
}

// --- Manual export: Share sheet on native (same pattern as the PDF
// ticket export), plain download on web. Updates lastExportAt. ------
export async function exportBackupFile() {
  const file = buildBackupFile();
  const json = JSON.stringify(file, null, 2);
  const name = backupFileName();
  const bytes = new Blob([json]).size;
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const data = btoa(unescape(encodeURIComponent(json)));
      const f = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      try {
        await Share.share({ title: name, url: f.uri, dialogTitle: 'Save your garage backup' });
      } catch (e) {
        if (String(e?.message || e).toLowerCase().includes('cancel')) {
          return { ok: false, cancelled: true, filename: name, bytes };
        }
        throw e;
      }
      const meta = getBackupMeta();
      meta.lastExportAt = new Date().toISOString();
      setBackupMeta(meta);
      return { ok: true, how: 'shared', filename: name, bytes };
    } catch (e) {
      if (e && e.cancelled) return { ok: false, cancelled: true, filename: name, bytes };
      throw new Error('Backup export failed: ' + (e?.message || e));
    }
  }
  // Web preview: plain download.
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  const meta = getBackupMeta();
  meta.lastExportAt = new Date().toISOString();
  setBackupMeta(meta);
  return { ok: true, how: 'downloaded', filename: name, bytes };
}
