// Native local notifications for due scheduled services — FREE for
// all tiers, no tier gate anywhere on this path (2026-11-14).
// The in-app DueServiceReminder card on Home already reminds while
// the app is open; this module reaches the user with the app
// CLOSED, via @capacitor/local-notifications.
//
// DECIDED BY JERAMY 2026-11-14: the notification fires DAY BEFORE
// the due date AND ON the due day, at 8:00 AM local time.
// It fires for the free first service too.
//
// RULES:
// - One notification per service per fire time: day-before 8:00 AM
//   local and due-day 8:00 AM local. Only FUTURE times are ever
//   scheduled: due tomorrow gets only the due-day one (its
//   day-before 8:00 AM is already past); due today gets only the
//   due-day one if 8:00 AM has not passed yet; past-due gets none
//   (the in-app card covers it). A service with no date gets none
//   — a mileage-only due has no clock anchor; the in-app card
//   covers it.
// - Stable IDs: derived from vehicle + service + kind, so
//   re-scheduling after an edit cancels the same IDs first and
//   never duplicates.
// - Permission is requested when the user schedules their FIRST
//   service, never at app launch. It is asked ONCE ever (a flag in
//   localStorage); if denied, scheduling still works and the
//   in-app card still reminds — a notification must never block
//   scheduling.
// - Tapping a notification opens the Service scheduler on that
//   vehicle (initDueNotificationTapHandler, mounted in App.jsx
//   next to the fleet-push tap handler).
// - Same store as everything else: fleet_scheduled_services on
//   the Vehicle record. No new store, no backend call.
// - On web (no native plugin) every function no-ops silently and
//   never throws, so the scheduler page works unchanged in a
//   browser. Exact-minute delivery on Android is best-effort — the
//   OS may shift an 8:00 AM alarm while dozing; the in-app card
//   is the fallback, not a second notification.
import { parseScheduledServices, scheduledServiceTypeLabel } from './fleetScheduling.js';
import { vehicleName } from './fleet.js';

// 8:00 AM local — decided by Jeramy, 2026-11-14. One-line flip.
export const DUE_NOTIFICATION_HOUR = 8;

export const DUE_NOTIFICATION_KINDS = ['before', 'due'];

// Flag: permission has been asked once (at first schedule).
export const DUE_NOTIFICATION_ASKED_KEY = 'ah_due_notif_permission_asked_v1';

// djb2 hash → a stable positive 31-bit int (Android notification
// IDs must fit in a 32-bit int; 0 is avoided).
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  const id = (h >>> 0) % 2147483647;
  return id === 0 ? 1 : id;
}

// Stable notification ID for one service + one fire time. The date
// is deliberately NOT part of the key: after an edit the same IDs
// are cancelled first, then re-scheduled at the new times — so an
// edited service can never leave a stale notification behind.
export function dueNotificationId(vehicleId, itemId, kind) {
  return hashId(`ah-due:${vehicleId}:${itemId}:${kind}`);
}

// The fire times for one scheduled item, as [{ kind, at: Date }],
// filtered to times strictly in the future of nowMs. nowMs is
// injectable so tests can freeze time. A 'YYYY-MM-DD' date is read
// as a LOCAL date (not UTC) so 8:00 AM means 8:00 AM where the
// user is, and daylight-saving shifts do not move it.
export function dueNotificationTimes(item, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  if (!item || item.status !== 'scheduled' || !item.date) return [];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(item.date).trim());
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dueAt = new Date(y, mo, d, DUE_NOTIFICATION_HOUR, 0, 0, 0);
  const beforeAt = new Date(y, mo, d - 1, DUE_NOTIFICATION_HOUR, 0, 0, 0);
  if (Number.isNaN(dueAt.getTime()) || Number.isNaN(beforeAt.getTime())) return [];
  const out = [];
  if (beforeAt.getTime() > now) out.push({ kind: 'before', at: beforeAt });
  if (dueAt.getTime() > now) out.push({ kind: 'due', at: dueAt });
  return out;
}

function isNative(deps) {
  if (deps && typeof deps.isNative === 'boolean') return deps.isNative;
  try {
    const cap = globalThis.Capacitor || globalThis.window?.Capacitor;
    return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
  } catch {
    return false;
  }
}

function storage(deps) {
  if (deps && deps.storage) return deps.storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

// The plugin, lazily imported (dynamic import keeps this module
// importable in plain node tests and on web, where the plugin does
// not exist). `deps.plugin` injects a fake in tests.
async function getPlugin(deps) {
  if (deps && deps.plugin) return deps.plugin;
  try {
    const mod = await import('@capacitor/local-notifications');
    return mod.LocalNotifications || null;
  } catch {
    return null;
  }
}

function notificationBody(vehicle, item, kind) {
  const label = scheduledServiceTypeLabel(item.type, item.customLabel);
  const name = vehicleName(vehicle);
  if (kind === 'before') return `${label} on your ${name} is due tomorrow${item.date ? ` (${item.date})` : ''}.`;
  return `${label} on your ${name} is due today${item.date ? ` (${item.date})` : ''}.`;
}

// Has permission been asked before (at first schedule)? Asked once
// ever — a denied prompt must not re-appear on every schedule.
export function dueNotificationPermissionAsked(deps) {
  const store = storage(deps);
  if (!store) return false;
  try {
    return store.getItem(DUE_NOTIFICATION_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

function markDueNotificationPermissionAsked(deps) {
  const store = storage(deps);
  if (!store) return;
  try {
    store.setItem(DUE_NOTIFICATION_ASKED_KEY, '1');
  } catch {
    // Storage full/blocked — we just ask again next time.
  }
}

// Request notification permission (first schedule only — callers
// check dueNotificationPermissionAsked first). Returns true when
// permission is granted, false otherwise. Never throws, never
// blocks the caller: a denied permission only means no native
// notification; the in-app card still reminds.
export async function requestDueNotificationPermission(deps) {
  if (!isNative(deps)) return false;
  const plugin = await getPlugin(deps);
  if (!plugin) return false;
  try {
    const cur = await plugin.checkPermissions();
    if (cur && cur.display === 'granted') {
      markDueNotificationPermissionAsked(deps);
      return true;
    }
  } catch {
    // checkPermissions unavailable — fall through to request.
  }
  markDueNotificationPermissionAsked(deps);
  try {
    const res = await plugin.requestPermissions();
    return !!(res && res.display === 'granted');
  } catch {
    return false;
  }
}

// Schedule the day-before + due-day notifications for one live
// scheduled service. Returns { scheduled: [{ kind, at, id }],
// permission } — scheduled is empty when there is nothing future
// to schedule, when permission is not granted, or off native.
// Never throws. Does NOT request permission: the caller asks at
// first schedule (requestDueNotificationPermission); scheduling
// silently skips when permission is missing.
export async function scheduleDueNotifications(vehicle, item, deps) {
  if (!vehicle || !item) return { scheduled: [], permission: 'unknown' };
  if (!isNative(deps)) return { scheduled: [], supported: false, permission: 'unsupported' };
  // deps.nowMs freezes "now" (tests); in the app it is undefined and
  // the real clock is used.
  const times = dueNotificationTimes(item, deps && deps.nowMs);
  if (times.length === 0) return { scheduled: [], permission: 'none-needed' };
  const plugin = await getPlugin(deps);
  if (!plugin) return { scheduled: [], supported: false, permission: 'unsupported' };
  let permission = 'unknown';
  try {
    const perms = await plugin.checkPermissions();
    permission = (perms && perms.display) || 'unknown';
  } catch {
    permission = 'unknown';
  }
  if (permission !== 'granted') return { scheduled: [], permission };
  const notifications = times.map(({ kind, at }) => ({
    id: dueNotificationId(vehicle.id, item.id, kind),
    title: kind === 'before' ? 'Service due tomorrow' : 'Service due today',
    body: notificationBody(vehicle, item, kind),
    schedule: { at, allowWhileIdle: true },
    extra: { vehicleId: vehicle.id, itemId: item.id, route: 'service-scheduler' },
  }));
  try {
    await plugin.schedule({ notifications });
  } catch {
    return { scheduled: [], permission };
  }
  return {
    scheduled: notifications.map((n) => ({
      kind: times.find((t) => dueNotificationId(vehicle.id, item.id, t.kind) === n.id)?.kind,
      at: n.schedule.at,
      id: n.id,
    })),
    permission,
  };
}

// Cancel both notifications for one service. No-op off native or
// without the plugin. Never throws. Safe to call for a service
// that has none scheduled (e.g. mileage-only, or already fired).
export async function cancelDueNotifications(vehicleId, itemId, deps) {
  if (!vehicleId || !itemId) return false;
  if (!isNative(deps)) return false;
  const plugin = await getPlugin(deps);
  if (!plugin) return false;
  try {
    await plugin.cancel({
      notifications: DUE_NOTIFICATION_KINDS.map((kind) => ({
        id: dueNotificationId(vehicleId, itemId, kind),
      })),
    });
    return true;
  } catch {
    return false;
  }
}

// Re-sync one vehicle: cancel every notification its services
// could hold, then re-schedule the live ones. This is the single
// path after ANY mutation (create, edit, done, cancel, remove),
// so an edit can never duplicate and a done/cancel/remove can
// never leave a stale notification behind. Returns the list of
// scheduled rows across the vehicle.
export async function syncDueNotificationsForVehicle(vehicle, deps) {
  if (!vehicle) return [];
  const items = parseScheduledServices(vehicle);
  if (!isNative(deps)) return [];
  const plugin = await getPlugin(deps);
  if (!plugin) return [];
  // Cancel first (same stable IDs), then schedule live items.
  for (const item of items) {
    // eslint-disable-next-line no-await-in-loop
    await cancelDueNotifications(vehicle.id, item.id, { ...deps, plugin });
  }
  const scheduled = [];
  for (const item of items) {
    if (item.status !== 'scheduled') continue;
    // eslint-disable-next-line no-await-in-loop
    const res = await scheduleDueNotifications(vehicle, item, { ...deps, plugin });
    scheduled.push(...res.scheduled);
  }
  return scheduled;
}

// Healing pass: re-sync every vehicle (scheduler mount, app
// start). Restores notifications lost to an app reinstall or a
// missed event, and clears stale ones for services since done.
// No-op off native. Never throws.
export async function syncAllDueNotifications(vehicles, deps) {
  const out = [];
  for (const v of vehicles || []) {
    // eslint-disable-next-line no-await-in-loop
    out.push(...(await syncDueNotificationsForVehicle(v, deps)));
  }
  return out;
}

let tapHandlerStarted = false;

// Register the tap handler once (called from App.jsx, inside the
// Router, so it can navigate). Tapping a due notification opens
// the Service scheduler on that vehicle; with no vehicle in the
// payload it opens the scheduler plain. Safe to call on web —
// no-ops. Returns true when the listener was registered.
export async function initDueNotificationTapHandler({ onOpenScheduler } = {}, deps) {
  if (tapHandlerStarted) return false;
  tapHandlerStarted = true;
  if (!isNative(deps)) return false;
  const plugin = await getPlugin(deps);
  if (!plugin) return false;
  try {
    await plugin.addListener('localNotificationActionPerformed', (event) => {
      try {
        const extra = event?.notification?.extra || {};
        if (typeof onOpenScheduler === 'function') onOpenScheduler(extra.vehicleId || null);
      } catch {
        // Navigation failed — the user can still open the scheduler by hand.
      }
    });
    return true;
  } catch {
    return false;
  }
}
