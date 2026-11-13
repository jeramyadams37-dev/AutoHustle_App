// AutoHustle BYOK — on-device accounts.
// Accounts live ONLY on this phone (localStorage). No server, no email,
// no verification codes. The password is stored as a salted SHA-256 hash
// (WebCrypto when available, with a plain-JS fallback) — good enough to
// keep someone else on this phone from opening your key, not bank-grade
// security. Your garage (vehicles/tickets) is shared on the device;
// your Gemini key is per-account (see apiKeys.js).
// The existing Login/Register pages call this through base44.auth.

const ACCOUNTS_KEY = 'ah_accounts_v1';
const SESSION_KEY = 'ah_session_v1';

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || [];
  } catch {
    return [];
  }
}

function writeAccounts(rows) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(rows));
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'acc-' + Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function randomSalt() {
  const a = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(a);
  } else {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 hex. Uses WebCrypto when available; falls back to a small
// synchronous hash (NOT cryptographic) on very old WebViews.
async function sha256Hex(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(u) {
  return { id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt };
}

// Accepts createAccount({ email, password, displayName }) or
// createAccount(email, password).
export async function createAccount(emailOrObj, maybePassword) {
  const email = normEmail(typeof emailOrObj === 'object' ? emailOrObj.email : emailOrObj);
  const password = typeof emailOrObj === 'object' ? emailOrObj.password : maybePassword;
  const displayName = typeof emailOrObj === 'object' ? emailOrObj.displayName || emailOrObj.full_name || '' : '';
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  const rows = readAccounts();
  if (rows.some((r) => r.email === email)) {
    throw new Error('An account with that email already exists on this phone. Log in instead.');
  }
  const salt = randomSalt();
  const passHash = await sha256Hex(salt + ':' + password);
  const user = {
    id: uid(),
    email,
    displayName: displayName || email.split('@')[0],
    salt,
    passHash,
    createdAt: new Date().toISOString(),
  };
  writeAccounts([...rows, user]);
  localStorage.setItem(SESSION_KEY, user.id);
  return publicUser(user);
}

// Accepts signIn({ email, password }) or signIn(email, password).
export async function signIn(emailOrObj, maybePassword) {
  const email = normEmail(typeof emailOrObj === 'object' ? emailOrObj.email : emailOrObj);
  const password = typeof emailOrObj === 'object' ? emailOrObj.password : maybePassword;
  const rows = readAccounts();
  const user = rows.find((r) => r.email === email);
  if (!user) throw new Error('No account with that email on this phone. Create one first.');
  const hash = await sha256Hex(user.salt + ':' + password);
  if (hash !== user.passHash) throw new Error('Wrong password — try again.');
  localStorage.setItem(SESSION_KEY, user.id);
  return publicUser(user);
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
}

export function getCurrentAccount() {
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const user = readAccounts().find((r) => r.id === id);
  return user ? publicUser(user) : null;
}

export function getCurrentAccountId() {
  const u = getCurrentAccount();
  return u ? u.id : null;
}

// Shape the old Base44 auth layer expects: { id, email, full_name, role }.
export function getSessionUser() {
  const u = getCurrentAccount();
  if (!u) throw new Error('Not signed in.');
  return { id: u.id, email: u.email, full_name: u.displayName, role: 'user' };
}
