// AutoHustle Google sign-in — native Firebase Auth (Android) via
// @capacitor-firebase/authentication. Firebase only proves the Google
// email; the app's own account still lives on-device in accounts.js
// (see linkGoogleAccount), so the per-account Gemini key and the Stripe
// tier check by email keep working unchanged.
// Web preview: the native plugin cannot run there — the button shows a
// clear message instead of a fake sign-in.
import { Capacitor } from '@capacitor/core';
import { linkGoogleAccount } from './accounts.js';

function friendlyGoogleError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '');
  const text = code + ' ' + msg;
  if (/cancel/i.test(text)) return 'Google sign-in was cancelled.';
  if (/DEVELOPER_ERROR|ApiException: 10|status 10/i.test(text)) {
    return "Google sign-in isn't set up for this app yet — the app's SHA-1 fingerprint or google-services.json is missing. See the setup steps.";
  }
  if (/not initialized|Default FirebaseApp/i.test(text)) {
    return "Google sign-in isn't set up in this build yet — google-services.json is missing.";
  }
  if (/network|offline|unavailable/i.test(text)) return 'No connection — check your network and try again.';
  if (/not configured|not available|missing/i.test(text)) {
    return "Google sign-in isn't set up in this build yet.";
  }
  return 'Google sign-in failed. Try again.';
}

export async function signInWithGoogle() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Google sign-in works in the Android app. On this web preview, log in with email and password.');
  }
  let FirebaseAuthentication;
  try {
    ({ FirebaseAuthentication } = await import('@capacitor-firebase/authentication'));
  } catch {
    throw new Error("Google sign-in isn't installed in this build yet. Update the app to the latest version.");
  }
  let result;
  try {
    result = await FirebaseAuthentication.signInWithGoogle();
  } catch (err) {
    throw new Error(friendlyGoogleError(err));
  }
  const user = result?.user;
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email) throw new Error("Google didn't return an email address. Try again.");
  return linkGoogleAccount({
    email,
    displayName: user.displayName || '',
    googleUid: user.uid || '',
  });
}

// Best-effort Firebase sign-out (so the next Google tap shows the
// account picker instead of silently re-using the last Google account).
// Never throws — the on-device sign-out in accounts.js already happened.
export async function signOutFromGoogle() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    await FirebaseAuthentication.signOut();
  } catch {
    // Ignore: the on-device session is already cleared.
  }
}
