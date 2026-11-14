// AutoHustle garage backup — automatic backup to the user's OWN
// Google Drive (Free tier, opt-in).
//
// The file is the SAME format as the manual export
// (src/lib/garageBackup.js), so a Drive backup restores through the
// same import flow, and a manual export restores from Drive.
//
// Privacy / billing, by design:
//   - The backup goes to the CUSTOMER's own Drive and their quota.
//     Nothing goes to Jeramy's backend or his bill, and no customer
//     data ever sits on his servers.
//   - Scope is drive.file ONLY: the app can see just the files it
//     creates (its own "AutoHustle Backups" folder). It cannot read
//     the rest of the user's Drive.
//   - drive.file is a NON-SENSITIVE scope: adding it needs no Google
//     scope verification. BUT the OAuth consent screen for ai-mechanic
//     is in Testing mode today, and Testing mode means (a) only the
//     100 registered test users can consent, and (b) refresh tokens
//     expire after 7 days. For Drive backup to work for paying
//     customers, Jeramy must publish the consent screen to
//     "In production" (Console > OAuth consent screen > Publish app)
//     and enable the Google Drive API in the ai-mechanic project.
//     Until then Drive backup works for him (test user) and for any
//     registered test user, with a re-consent about weekly. The code
//     is still shipped ready — the UI says plainly when Drive access
//     is not granted, and nothing else in the app depends on it.
//
// How the token works: @capacitor-firebase/authentication's
// signInWithGoogle({ scopes }) returns credential.accessToken carrying
// the requested scopes (the Android handler fetches it with
// GoogleAuthUtil.getToken for "oauth2:email <scopes>"). Access tokens
// live ~1 hour, so every backup run asks Google for a fresh one —
// when the Google account is already signed in on the phone that is
// quick and usually shows no prompt. If it throws (cancelled,
// offline, consent revoked) the run is skipped quietly and retried
// next launch; a backup failure NEVER blocks the app.
//
// No Capacitor imports at the top of this file — the plugin is a
// dynamic import inside getDriveAccessToken(), so this module stays
// importable (and unit-testable) outside the app. Drive calls use
// fetch, injectable for tests.

import { getCurrentAccount } from './accounts.js';
import { buildBackupFile, backupFileName, getBackupMeta, setBackupMeta } from './garageBackup.js';

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FOLDER_NAME = 'AutoHustle Backups';
export const DRIVE_KEEP = 7; // keep the newest 7 Drive backups, prune older
export const DRIVE_STALE_MS = 24 * 60 * 60 * 1000; // auto-backup when older than a day

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export function isDriveEnabled() {
  return getBackupMeta().driveEnabled === true;
}

export function setDriveEnabled(on) {
  const meta = getBackupMeta();
  meta.driveEnabled = on === true;
  setBackupMeta(meta);
  return meta.driveEnabled;
}

function isGoogleLinkedAccount() {
  const account = getCurrentAccount();
  if (!account) return false;
  return String(account.authProvider || '').includes('google');
}

// Fresh OAuth access token carrying the drive.file scope.
// Throws a plain-English error; never returns a stale token.
export async function getDriveAccessToken() {
  if (typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) {
    throw new Error('Drive backup works in the Android app. On this web preview, use the manual export instead.');
  }
  let FirebaseAuthentication;
  try {
    ({ FirebaseAuthentication } = await import('@capacitor-firebase/authentication'));
  } catch {
    throw new Error("Google sign-in isn't installed in this build yet. Update the app to the latest version.");
  }
  let result;
  try {
    result = await FirebaseAuthentication.signInWithGoogle({ scopes: [DRIVE_FILE_SCOPE] });
  } catch (err) {
    const text = String(err?.code || '') + ' ' + String(err?.message || err || '');
    if (/cancel/i.test(text)) throw new Error('cancelled');
    if (/network|offline|unavailable/i.test(text)) throw new Error('No connection — check your network and try again.');
    throw new Error('Could not get Drive access — try again, or use the manual export.');
  }
  const token = result?.credential?.accessToken;
  if (!token) {
    throw new Error('Google did not return Drive access — sign out and sign back in with Google, then try again.');
  }
  return token;
}

async function driveFetch(fetchImpl, token, url, opts = {}) {
  const res = await fetchImpl(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || '';
    } catch {
      // Ignore — fall back to the status text.
    }
    throw new Error(`Drive request failed (${res.status})${detail ? ': ' + detail : ''}`);
  }
  return res;
}

function driveQuery(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// Find the app's backup folder, creating it on first use.
export async function findOrCreateBackupFolder(token, fetchImpl = fetch) {
  const listUrl =
    `${DRIVE_API}/files?` +
    driveQuery({
      q: `mimeType = 'application/vnd.google-apps.folder' and name = '${DRIVE_FOLDER_NAME}' and trashed = false`,
      fields: 'files(id,name)',
      spaces: 'drive',
    });
  const found = await (await driveFetch(fetchImpl, token, listUrl)).json();
  if (found?.files?.length) return found.files[0].id;
  const created = await (
    await driveFetch(fetchImpl, token, `${DRIVE_API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    })
  ).json();
  if (!created?.id) throw new Error('Drive would not create the backup folder.');
  return created.id;
}

// Multipart upload: the JSON file + its metadata in one call.
export async function uploadBackupFile(token, folderId, filename, jsonText, fetchImpl = fetch) {
  const boundary = 'autohustle-backup-' + Date.now().toString(36);
  const meta = JSON.stringify({ name: filename, parents: [folderId], mimeType: 'application/json' });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonText}\r\n` +
    `--${boundary}--`;
  const res = await driveFetch(fetchImpl, token, `${DRIVE_UPLOAD_API}?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const out = await res.json();
  if (!out?.id) throw new Error('Drive did not save the backup file.');
  return { id: out.id, name: out.name || filename };
}

// Newest first. drive.file scope only ever sees files this app made.
export async function listBackupFiles(token, folderId, fetchImpl = fetch) {
  const url =
    `${DRIVE_API}/files?` +
    driveQuery({
      q: `'${folderId}' in parents and trashed = false`,
      orderBy: 'createdTime desc',
      pageSize: '20',
      fields: 'files(id,name,createdTime,size)',
    });
  const out = await (await driveFetch(fetchImpl, token, url)).json();
  return Array.isArray(out?.files) ? out.files : [];
}

export async function downloadBackupFile(token, fileId, fetchImpl = fetch) {
  const res = await driveFetch(fetchImpl, token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return res.text();
}

export async function pruneOldBackups(token, folderId, keep = DRIVE_KEEP, fetchImpl = fetch) {
  const files = await listBackupFiles(token, folderId, fetchImpl);
  let pruned = 0;
  for (const f of files.slice(keep)) {
    try {
      await driveFetch(fetchImpl, token, `${DRIVE_API}/files/${encodeURIComponent(f.id)}`, { method: 'DELETE' });
      pruned += 1;
    } catch {
      // One failed delete must not fail the backup that just landed.
    }
  }
  return pruned;
}

// Full run: token -> build file -> upload -> prune -> record.
// Returns { ok: true, filename, fileId, bytes } or { ok: false, error }.
// `cancelled` is true when the user dismissed the Google prompt.
export async function runDriveBackupNow(fetchImpl = fetch) {
  if (!isGoogleLinkedAccount()) {
    return { ok: false, error: 'Sign in with Google first — Drive backup saves to your own Google Drive.' };
  }
  let token;
  try {
    token = await getDriveAccessToken();
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg === 'cancelled') return { ok: false, cancelled: true };
    return { ok: false, error: msg };
  }
  try {
    const folderId = await findOrCreateBackupFolder(token, fetchImpl);
    const file = buildBackupFile();
    const json = JSON.stringify(file, null, 2);
    const filename = backupFileName();
    const up = await uploadBackupFile(token, folderId, filename, json, fetchImpl);
    await pruneOldBackups(token, folderId, DRIVE_KEEP, fetchImpl);
    const meta = getBackupMeta();
    meta.lastDriveAt = new Date().toISOString();
    meta.lastDriveFileId = up.id;
    meta.lastDriveError = '';
    setBackupMeta(meta);
    return { ok: true, filename, fileId: up.id, bytes: new Blob([json]).size };
  } catch (e) {
    const meta = getBackupMeta();
    meta.lastDriveError = e?.message || String(e);
    setBackupMeta(meta);
    return { ok: false, error: e?.message || String(e) };
  }
}

// The automatic job: run on app launch, at most once a day, only
// when the user opted in. NEVER throws and NEVER blocks the app —
// every failure path returns a reason and the next launch retries.
export async function runDriveBackupIfStale(fetchImpl = fetch) {
  try {
    if (!isDriveEnabled()) return { ok: false, reason: 'disabled' };
    if (typeof window !== 'undefined' && !window.Capacitor?.isNativePlatform?.()) {
      return { ok: false, reason: 'not-native' };
    }
    if (!isGoogleLinkedAccount()) return { ok: false, reason: 'not-google' };
    const meta = getBackupMeta();
    const last = meta.lastDriveAt ? Date.parse(meta.lastDriveAt) : 0;
    if (Number.isFinite(last) && Date.now() - last < DRIVE_STALE_MS) {
      return { ok: false, reason: 'fresh' };
    }
    // One auto attempt per day max — a failure today waits for tomorrow
    // instead of asking Google on every launch.
    const lastAttempt = meta.lastDriveAttemptAt ? Date.parse(meta.lastDriveAttemptAt) : 0;
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < DRIVE_STALE_MS) {
      return { ok: false, reason: 'attempted-today' };
    }
    meta.lastDriveAttemptAt = new Date().toISOString();
    setBackupMeta(meta);
    const res = await runDriveBackupNow(fetchImpl);
    if (!res.ok && res.cancelled) return { ok: false, reason: 'cancelled' };
    return res.ok ? { ok: true, filename: res.filename } : { ok: false, reason: 'error', error: res.error };
  } catch (e) {
    return { ok: false, reason: 'error', error: e?.message || String(e) };
  }
}

// Download the newest Drive backup as text, for the normal import
// preview flow (same validation + confirm as a picked file).
export async function fetchLatestDriveBackup(fetchImpl = fetch) {
  const token = await getDriveAccessToken();
  const folderId = await findOrCreateBackupFolder(token, fetchImpl);
  const files = await listBackupFiles(token, folderId, fetchImpl);
  if (!files.length) return { ok: false, error: 'No backup found in your Drive yet.' };
  const text = await downloadBackupFile(token, files[0].id, fetchImpl);
  return { ok: true, text, name: files[0].name, createdTime: files[0].createdTime };
}
