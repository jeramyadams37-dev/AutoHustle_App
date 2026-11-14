// Fleet push (FCM) client — AutoHustle owner side.
//
// What it does: registers this phone's FCM token with the fleet
// backend so the owner gets a push notification when a driver
// replies to a dispatch while AutoHustle is closed, and opens Fleet
// Live when the notification is tapped.
//
// What it does NOT do: it never sends a push itself — the backend
// sends the push after a dispatch/reply is stored (fleetRegisterToken
// / fleetUnregisterToken actions). Polling stays the backup: if push
// is off, denied, or fails, Fleet Live still polls every 10-15s
// while it is open, exactly as before.
//
// IDENTITY: the token is keyed server-side to the server-issued
// memberId behind the memberToken — the backend never trusts a
// client-sent driver ID. This file never logs or exposes the token.
//
// PLATFORM: @capacitor-firebase/messaging, same Firebase project
// (ai-mechanic) and same google-services.json as
// @capacitor-firebase/authentication — no new Firebase console work.
// On web (no native plugin) every function no-ops silently: nothing
// throws, nothing logs.
//
// TOKEN REFRESH: FCM can rotate the token. The 'tokenReceived'
// listener re-registers the new token automatically, so a rotated
// token never silently stops push.
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import {
  getFleetMembership,
  registerFleetPushToken,
  unregisterFleetPushToken,
} from './fleetRealtime';

let started = false;
let tokenRegistered = false;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Start listening once (called from App.jsx, inside the Router, so
// the tap handler can navigate). Safe to call on web — no-ops.
export async function initFleetPush({ onOpenFleet } = {}) {
  if (started) return false;
  started = true;
  if (!isNative()) return false;

  try {
    await FirebaseMessaging.requestPermissions();
  } catch {
    // Permission denied — polling stays the backup. Nothing to do.
  }

  // FCM rotated the token: re-register the new one automatically.
  try {
    await FirebaseMessaging.addListener('tokenReceived', async (event) => {
      const token = event?.token;
      if (!token) return;
      try {
        tokenRegistered = await registerFleetPushToken(token, 'android');
      } catch {
        tokenRegistered = false;
      }
    });
  } catch {
    // Listener not available on this build — getToken() below is the fallback.
  }

  // Tapping a fleet notification opens Fleet Live, whatever page the
  // app was on (or even when the app was closed — the tap launches it).
  try {
    await FirebaseMessaging.addListener('notificationActionPerformed', () => {
      try {
        if (typeof onOpenFleet === 'function') onOpenFleet();
      } catch {
        // Navigation failed — the user can still open Fleet Live by hand.
      }
    });
  } catch {
    // Listener not available — nothing else to do here.
  }

  return true;
}

// Register this phone's FCM token for the current fleet membership.
// No-op (returns false) with no membership or on web. Never throws.
export async function registerPushTokenForFleet() {
  if (!getFleetMembership()) return false;
  if (!isNative()) return false;
  try {
    const { token } = await FirebaseMessaging.getToken();
    if (!token) return false;
    tokenRegistered = await registerFleetPushToken(token, 'android');
    return tokenRegistered;
  } catch (e) {
    console.warn('[fleetPush] could not register push token', e?.message || e);
    tokenRegistered = false;
    return false;
  }
}

// Remove this phone's token server-side (e.g. fleet left / sign-out).
// No-op (returns false) with no membership. Never throws.
export async function unregisterPushTokenForFleet() {
  if (!getFleetMembership()) return false;
  try {
    tokenRegistered = false;
    return await unregisterFleetPushToken();
  } catch {
    return false;
  }
}

// Best-effort state for the Fleet Live page ("Push on" / "Push off
// — check notification permission"). Never throws.
export async function getFleetPushState() {
  const supported = isNative();
  if (!supported) return { supported: false, tokenRegistered: false };
  try {
    const perms = await FirebaseMessaging.checkPermissions();
    if (perms?.receive === 'denied') {
      return { supported: true, tokenRegistered: false };
    }
  } catch {
    // checkPermissions unavailable — fall through to the stored flag.
  }
  return { supported, tokenRegistered };
}
