// Fleet realtime client — live dispatch + live driver locations over
// the RoadHouse shared backend (the same Cloud Run service the
// RoadHouse board/chat use). One backend, two apps: AutoHustle Fleet
// is the owner-facing side; RoadHouse is the driver-facing doorway.
//
// POLLING v1: dispatch polls every 10s, locations every 15s, while
// the Live page is open. No push notifications in v1 — a dispatch
// sent while the driver's app is closed is seen the next time they
// open RoadHouse. FCM push is a later step.
//
// IDENTITY: the backend never trusts a client-sent driver ID. The
// server issues a memberId + memberToken when the owner creates the
// fleet / a driver joins with the code. The token is the credential
// and lives in localStorage per AutoHustle account (same pattern as
// apiKeys.js: ah_gemini_key_<accountId>). Never log it, never put it
// in a URL, never send it anywhere except the fleet backend.
//
// OFFLINE: if there is no backend address or the fetch fails, the
// caller gets a thrown error — the Fleet page's on-device dispatch
// (from the fleet-contracts package) still works and is the fallback.
import { getCurrentAccountId, getCurrentAccount } from './accounts.js';

// Default backend address. public/fleet-config.json (written by the
// deploy script) overrides it at runtime; this fallback is the same
// RoadHouse service URL, so the app works even before the config
// file is written.
export const FLEET_BACKEND_URL = 'https://roadhouse-backend-2dda4nvcwq-uc.a.run.app';
const CONFIG_URL = '/fleet-config.json';
const STORE_PREFIX = 'ah_fleet_rt_';

let configUrl = null; // resolved backend URL, cached after first read
let configTried = false;

export async function getFleetApiUrl() {
  if (configUrl) return configUrl;
  if (!configTried) {
    configTried = true;
    try {
      const res = await fetch(CONFIG_URL, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data && typeof data.fleetApiUrl === 'string' && data.fleetApiUrl.startsWith('https://')) {
        configUrl = data.fleetApiUrl;
      }
    } catch {
      // Offline or no config file yet — fall through to the default.
    }
  }
  return configUrl || FLEET_BACKEND_URL;
}

// Same wire protocol as the RoadHouse backend: POST /actions with
// {action, args} -> 200 {data} or non-200 {error}.
async function callFleetAction(action, args) {
  const base = await getFleetApiUrl();
  let res;
  try {
    res = await fetch(`${base}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, args }),
    });
  } catch {
    const err = new Error('Fleet backend unreachable — check your connection and try again.');
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || `Fleet backend error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data?.data ?? {};
}

// --- Membership (per AutoHustle account, localStorage) --------------
function slot() {
  const id = getCurrentAccountId();
  return id ? STORE_PREFIX + id : null;
}
export function getFleetMembership() {
  const s = slot();
  if (!s) return null;
  try {
    return JSON.parse(localStorage.getItem(s) || 'null');
  } catch {
    return null;
  }
}
export function saveFleetMembership(membership) {
  const s = slot();
  if (!s) throw new Error('Sign in first.');
  localStorage.setItem(s, JSON.stringify(membership));
}
export function clearFleetMembership() {
  const s = slot();
  if (s) localStorage.removeItem(s);
}

// --- Owner: create (or recover) my fleet ---------------------------
export async function createFleet(fleetName) {
  const account = getCurrentAccount();
  if (!account) throw new Error('Sign in first.');
  const out = await callFleetAction('fleetCreate', {
    ownerDriverId: account.id,
    ownerName: account.displayName || account.email || 'Owner',
    fleetName: (fleetName || '').trim() || 'My Fleet',
  });
  const membership = {
    fleetId: out.fleetId,
    fleetName: out.fleetName,
    joinCode: out.joinCode,
    memberId: out.memberId,
    memberToken: out.memberToken,
    role: 'owner',
  };
  saveFleetMembership(membership);
  return membership;
}

// Re-check the stored token (app start / after reinstall). Returns
// the membership or null if the token is dead (driver must re-join).
export async function validateMembership() {
  const m = getFleetMembership();
  if (!m || !m.memberToken) return null;
  try {
    const out = await callFleetAction('fleetMyMembership', { memberToken: m.memberToken });
    const updated = { ...m, fleetName: out.fleetName, role: out.role };
    if (out.joinCode) updated.joinCode = out.joinCode;
    saveFleetMembership(updated);
    return updated;
  } catch {
    return null;
  }
}

// --- Dispatch -------------------------------------------------------
export async function sendFleetDispatch({ body, toMemberId, job }) {
  const m = getFleetMembership();
  if (!m) throw new Error('No fleet yet — create your fleet first.');
  return callFleetAction('fleetSendDispatch', {
    memberToken: m.memberToken,
    body,
    toMemberId: toMemberId || null,
    pickup: job?.pickup || null,
    dropoff: job?.dropoff || null,
    time: job?.time || null,
    pay: job?.pay || null,
  });
}

export async function listFleetDispatch(sinceId) {
  const m = getFleetMembership();
  if (!m) return { messages: [] };
  return callFleetAction('fleetListDispatch', {
    memberToken: m.memberToken,
    sinceId: sinceId || 0,
    limit: 100,
  });
}

// --- Members / locations (owner only) -------------------------------
export async function listFleetMembers() {
  const m = getFleetMembership();
  if (!m) throw new Error('No fleet yet — create your fleet first.');
  return callFleetAction('fleetListMembers', { memberToken: m.memberToken });
}

export async function listFleetLocations() {
  const m = getFleetMembership();
  if (!m) return { locations: [] };
  return callFleetAction('fleetListLocations', { memberToken: m.memberToken });
}

export async function setFleetVehicle(memberId, vehicleLabel) {
  const m = getFleetMembership();
  if (!m) throw new Error('No fleet yet — create your fleet first.');
  return callFleetAction('fleetSetVehicle', {
    memberToken: m.memberToken,
    memberId,
    vehicleLabel: vehicleLabel || null,
  });
}

export async function removeFleetMember(memberId) {
  const m = getFleetMembership();
  if (!m) throw new Error('No fleet yet — create your fleet first.');
  return callFleetAction('fleetRemoveMember', {
    memberToken: m.memberToken,
    memberId,
  });
}

export async function regenerateFleetCode() {
  const m = getFleetMembership();
  if (!m) throw new Error('No fleet yet — create your fleet first.');
  const out = await callFleetAction('fleetRegenerateCode', { memberToken: m.memberToken });
  const updated = { ...m, joinCode: out.joinCode };
  saveFleetMembership(updated);
  return out.joinCode;
}

// --- Push tokens (FCM) ------------------------------------------------
// The backend keys the token to the server-issued memberId behind
// the memberToken — it never trusts a client-sent driver ID.
// Registering is best-effort (returns false on failure): polling
// stays the backup, so a failed register never breaks Fleet Live.
export async function registerFleetPushToken(fcmToken, platform) {
  const m = getFleetMembership();
  if (!m || !fcmToken) return false;
  try {
    await callFleetAction('fleetRegisterToken', {
      memberToken: m.memberToken,
      fcmToken,
      platform: platform || 'android',
    });
    return true;
  } catch {
    return false;
  }
}

export async function unregisterFleetPushToken() {
  const m = getFleetMembership();
  if (!m) return false;
  try {
    await callFleetAction('fleetUnregisterToken', { memberToken: m.memberToken });
    return true;
  } catch {
    return false;
  }
}

// OpenStreetMap link for a coordinate — the no-network fallback
// under the map (the list always works even when tiles won't load).
export function fleetLocationMapsUrl(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}
