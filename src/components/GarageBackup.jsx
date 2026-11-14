// Garage backup — manual export / import + automatic backup to the
// user's own Google Drive. Free tier, no server involved: the file
// lives in the user's own storage (Share sheet / Downloads) or their
// own Drive folder. Nothing here sends garage data to Jeramy's
// backend — the server backups cover the shared board/chat/fleet,
// this covers the garage on this phone.
//
// Restore is replace-all with a confirm step, and the current garage
// is auto-saved first so a bad restore can be undone (one-shot undo).
// A backup failure is always shown plainly — it never looks like an
// empty garage and never blocks the rest of the app.
import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, Download, Upload, RefreshCw, HardDrive, Cloud,
  AlertTriangle, Check, Undo2, X,
} from 'lucide-react';
import {
  BACKUP_ENTITIES, BACKUP_WARN_BYTES, garageCounts, garageTotalCount,
  buildBackupFile, backupFileBytes, exportBackupFile,
  previewBackupFromText, applyBackupFile, undoRestore,
  hasPreRestoreSnapshot, getBackupMeta,
} from '@/lib/garageBackup';
import {
  isDriveEnabled, setDriveEnabled, runDriveBackupNow,
  fetchLatestDriveBackup, runDriveBackupIfStale,
} from '@/lib/driveBackup';
import { getCurrentAccount } from '@/lib/accounts';

const NUDGE_MS = 30 * 24 * 60 * 60 * 1000; // remind after 30 days without a backup

const ENTITY_LABELS = {
  Vehicle: 'vehicles',
  Ticket: 'tickets',
  PreShiftCheck: 'pre-shift checks',
  FleetCost: 'cost rows',
  FleetDowntime: 'downtime rows',
  FleetContract: 'contracts',
  FleetDriver: 'drivers',
  FleetDocument: 'documents & photos',
  FleetDispatch: 'dispatch messages',
};

function countsLine(counts) {
  return BACKUP_ENTITIES.filter((n) => (counts[n] || 0) > 0)
    .map((n) => `${counts[n]} ${ENTITY_LABELS[n]}`)
    .join(' · ');
}

function fmtDate(iso) {
  if (!iso) return 'never';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return 'never';
  }
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// Mounted once in App.jsx (next to FleetPushTapHandler). Runs the
// automatic Drive backup check for this launch — silent, never blocks.
export function DriveBackupCheck() {
  useEffect(() => {
    runDriveBackupIfStale().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function GarageBackup() {
  const fileRef = useRef(null);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [meta, setMeta] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pending, setPending] = useState(null); // restore preview awaiting confirm
  const [canUndo, setCanUndo] = useState(false);
  const [driveOn, setDriveOn] = useState(false);
  const account = getCurrentAccount();
  const googleLinked = !!account && String(account.authProvider || '').includes('google');

  const refresh = () => {
    setCounts(garageCounts());
    setTotal(garageTotalCount());
    try {
      setBytes(backupFileBytes(buildBackupFile()));
    } catch {
      setBytes(0);
    }
    setMeta(getBackupMeta());
    setCanUndo(hasPreRestoreSnapshot());
    setDriveOn(isDriveEnabled());
  };

  useEffect(() => {
    refresh();
  }, []);

  const lastAny = meta.lastExportAt || meta.lastDriveAt;
  const stale =
    total > 0 &&
    (!lastAny || Date.now() - Math.max(Date.parse(meta.lastExportAt || 0), Date.parse(meta.lastDriveAt || 0)) > NUDGE_MS);
  const tooBig = bytes > BACKUP_WARN_BYTES;

  const doExport = async () => {
    setError('');
    setNotice('');
    setBusy('export');
    try {
      const res = await exportBackupFile();
      if (!res.ok && res.cancelled) {
        setNotice('Export cancelled — nothing was saved.');
      } else if (res.ok) {
        setNotice(`Backup ${res.how === 'shared' ? 'shared' : 'downloaded'}: ${res.filename} (${fmtBytes(res.bytes)}). Keep it somewhere safe — it restores this garage on this phone or a new one.`);
        refresh();
      }
    } catch (e) {
      setError(e?.message || 'Backup export failed — try again.');
    } finally {
      setBusy('');
    }
  };

  const onPickFile = async (file) => {
    setError('');
    setNotice('');
    setPending(null);
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch {
      setError("That file couldn't be read — pick the JSON file AutoHustle exported.");
      return;
    }
    const res = previewBackupFromText(text);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPending(res);
  };

  const confirmRestore = () => {
    if (!pending) return;
    setError('');
    setNotice('');
    setBusy('restore');
    try {
      const res = applyBackupFile(pending.file);
      const parts = Object.entries(res.restored).map(([n, c]) => `${c} ${ENTITY_LABELS[n]}`).join(' · ');
      setNotice(
        `Backup restored — this garage now holds: ${parts || 'nothing'}.` +
          (res.kept.length ? ` Left untouched (not in the backup): ${res.kept.join(', ')}.` : '') +
          (res.hasUndo ? ' Undo is available below if this was a mistake.' : ' No undo snapshot was saved — the phone storage was full when restoring.'),
      );
      setPending(null);
      refresh();
    } catch (e) {
      setError('Restore failed: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  };

  const doUndo = () => {
    setError('');
    setNotice('');
    const res = undoRestore();
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice('Undone — your garage from just before the restore is back.');
    refresh();
  };

  const toggleDrive = () => {
    setError('');
    setNotice('');
    if (!driveOn && !googleLinked) {
      setError('Sign in with Google first — Drive backup saves to your own Google Drive, so it needs your Google account. Use the manual export meanwhile.');
      return;
    }
    const next = setDriveEnabled(!driveOn);
    setDriveOn(next);
    setNotice(
      next
        ? 'Drive backup is on — your garage backs up to your own Google Drive when you open the app, about once a day. Your Drive, your storage, nothing on our servers.'
        : 'Drive backup is off. Your manual exports still work.',
    );
    refresh();
  };

  const doDriveNow = async () => {
    setError('');
    setNotice('');
    setBusy('drive');
    try {
      const res = await runDriveBackupNow();
      if (res.ok) {
        setNotice(`Backed up to your Drive: ${res.filename} (${fmtBytes(res.bytes)}).`);
        refresh();
      } else if (res.cancelled) {
        setNotice('Drive sign-in cancelled — nothing was backed up.');
      } else {
        setError(res.error || 'Drive backup failed — try again, or use the manual export.');
        refresh();
      }
    } catch (e) {
      setError(e?.message || 'Drive backup failed — try again, or use the manual export.');
    } finally {
      setBusy('');
    }
  };

  const doRestoreFromDrive = async () => {
    setError('');
    setNotice('');
    setPending(null);
    setBusy('drive-restore');
    try {
      const res = await fetchLatestDriveBackup();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const preview = previewBackupFromText(res.text);
      if (!preview.ok) {
        setError(preview.error);
        return;
      }
      setPending(preview);
      setNotice(`Found your Drive backup from ${fmtDate(preview.exportedAt)} — check it below, then confirm to restore.`);
    } catch (e) {
      const msg = e?.message || String(e);
      setError(
        msg === 'cancelled'
          ? 'Drive sign-in cancelled — nothing was restored.'
          : msg || 'Could not reach your Drive backup — try again, or restore a manual export.',
      );
    } finally {
      setBusy('');
    }
  };

  return (
    <section aria-label="Back up your garage" className="mt-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 font-display font-semibold uppercase tracking-wide text-sm">
        <ShieldCheck size={16} className="text-primary" /> Back up your garage
      </div>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
        Your garage lives only on this phone — vehicles, tickets, service history, costs and
        documents. If the app is uninstalled or its storage is cleared, it goes with it.
        A backup is one file you can restore here or on a new phone. It never includes
        your sign-in, your Gemini key, or your fleet token.
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        On this phone now: {total > 0 ? countsLine(counts) : 'nothing yet'}{bytes > 0 ? ` · backup file about ${fmtBytes(bytes)}` : ''}.
        <br />
        Last manual backup: {fmtDate(meta.lastExportAt)} · Last Drive backup: {fmtDate(meta.lastDriveAt)}
        {meta.lastDriveError ? ` · Drive had a problem: ${meta.lastDriveError}` : ''}.
      </p>

      {stale && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          It&apos;s been 30 days since your last garage backup. Export one now — it takes a tap, and it&apos;s the only copy if this phone is lost.
        </div>
      )}
      {tooBig && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          This backup is over 4 MB — a heavy garage with lots of photos may not fit back into
          the phone&apos;s storage on restore. Consider deleting old documents first.
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-xl border border-green-500/40 bg-green-500/10 p-3 text-sm flex gap-2">
          <Check size={16} className="text-green-400 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doExport}
          disabled={busy === 'export' || total === 0}
          className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide disabled:opacity-50"
        >
          <Download size={16} /> {busy === 'export' ? 'Exporting…' : 'Export backup'}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy === 'restore'}
          className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border font-display font-semibold uppercase text-sm tracking-wide disabled:opacity-50"
        >
          <Upload size={16} /> Restore a backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          aria-label="Choose an AutoHustle backup file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickFile(f);
            e.target.value = '';
          }}
        />
        {canUndo && (
          <button
            type="button"
            onClick={doUndo}
            className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border font-display font-semibold uppercase text-sm tracking-wide"
          >
            <Undo2 size={16} /> Undo last restore
          </button>
        )}
      </div>

      {pending && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Restore this backup from {fmtDate(pending.exportedAt)}?</p>
              <p className="mt-1 text-muted-foreground">
                It holds: {countsLine(Object.fromEntries(Object.entries(pending.counts).map(([k, v]) => [k, v || 0])) ) || 'nothing'}.
                Restoring <span className="text-foreground font-medium">replaces everything in your garage now</span> with
                the backup&apos;s data. Your current garage is saved first, so you can undo right after.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={confirmRestore}
                  disabled={busy === 'restore'}
                  className="tap-target px-3 py-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide disabled:opacity-50"
                >
                  {busy === 'restore' ? 'Restoring…' : 'Yes, replace my garage'}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="tap-target inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-sm"
                >
                  <X size={15} /> Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Google Drive (automatic, your own Drive) ---- */}
      <div className="mt-4 rounded-2xl border border-border bg-zinc-950 p-4">
        <div className="flex items-center gap-2 font-display font-semibold uppercase tracking-wide text-sm">
          <Cloud size={16} className="text-primary" /> Google Drive backup
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Automatic, about once a day when you open the app. It saves the same backup file to
          a folder called &ldquo;AutoHustle Backups&rdquo; in <span className="text-foreground">your own</span> Google
          Drive — your storage, your account. Nothing goes to our servers and nothing lands
          on our bill.
        </p>
        {!googleLinked && (
          <p className="text-sm text-muted-foreground mt-2">
            You&apos;re not signed in with Google, so Drive backup can&apos;t run yet. Sign in with
            Google (Settings → API Keys shows your sign-in), then turn it on here. The manual
            export above always works.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={toggleDrive}
            className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border font-display font-semibold uppercase text-sm tracking-wide"
          >
            <HardDrive size={16} /> Drive backup: {driveOn ? 'On' : 'Off'}
          </button>
          {driveOn && (
            <>
              <button
                type="button"
                onClick={doDriveNow}
                disabled={busy === 'drive'}
                className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground font-display font-semibold uppercase text-sm tracking-wide disabled:opacity-50"
              >
                <RefreshCw size={16} /> {busy === 'drive' ? 'Backing up…' : 'Back up to Drive now'}
              </button>
              <button
                type="button"
                onClick={doRestoreFromDrive}
                disabled={busy === 'drive-restore'}
                className="tap-target inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border font-display font-semibold uppercase text-sm tracking-wide disabled:opacity-50"
              >
                <Cloud size={16} /> {busy === 'drive-restore' ? 'Checking Drive…' : 'Restore from Drive'}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
