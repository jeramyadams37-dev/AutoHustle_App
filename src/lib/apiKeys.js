// AutoHustle BYOK — per-account Gemini API key, stored on this phone only.
// The key is NEVER sent to Jeramy and is never stored on the server: it
// travels with each backend request in the X-Gemini-Key header so the
// backend can call Gemini as YOU for that one call, and the backend does
// not save it. The key is tied to the signed-in account
// (ah_gemini_key_<accountId>). A device-level key (ah_gemini_key) saved
// before accounts existed is moved to the first account that signs in.
import { getCurrentAccountId } from './accounts.js';

export const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';
const DEVICE_KEY = 'ah_gemini_key';

function keySlot() {
  const id = getCurrentAccountId();
  return id ? `ah_gemini_key_${id}` : null;
}

function isGeminiKeyFormat(key) {
  return /^AIza[0-9A-Za-z_\-]{20,}$/.test(key || '');
}

export function getGeminiKey() {
  const slot = keySlot();
  if (slot) {
    const k = (localStorage.getItem(slot) || '').trim();
    if (k) return k;
  }
  // One-time migration: a device-level key from before accounts existed.
  const legacy = (localStorage.getItem(DEVICE_KEY) || '').trim();
  if (legacy && slot) {
    localStorage.setItem(slot, legacy);
    localStorage.removeItem(DEVICE_KEY);
    return legacy;
  }
  return legacy;
}

export function hasGeminiKey() {
  return getGeminiKey().length > 0;
}

export function saveGeminiKey(raw) {
  const key = String(raw || '').trim();
  if (!key) throw new Error('Paste your Gemini key first.');
  if (!isGeminiKeyFormat(key)) {
    throw new Error('That does not look like a Gemini key — they start with "AIza" and are about 39 characters. Copy it again from AI Studio.');
  }
  const slot = keySlot();
  if (!slot) throw new Error('Create an account (or log in) first — the key is saved to your account.');
  localStorage.setItem(slot, key);
  localStorage.removeItem(DEVICE_KEY);
  return maskedKey();
}

export function clearGeminiKey() {
  const slot = keySlot();
  if (slot) localStorage.removeItem(slot);
  localStorage.removeItem(DEVICE_KEY);
}

export function maskedKey() {
  const k = getGeminiKey();
  if (!k) return '';
  return '••••' + k.slice(-4);
}

// Header object to spread into backend fetch calls. Empty when no key.
export function geminiKeyHeader() {
  const k = getGeminiKey();
  return k ? { 'X-Gemini-Key': k } : {};
}
