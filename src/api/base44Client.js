// Standalone replacement for the Base44 SDK: data lives on-device, AI calls go
// to the AutoHustle backend (see src/lib/gemini.js) — never directly to Gemini.
import { invokeFunction } from '@/lib/gemini';
import { getSessionUser, getCurrentAccount, createAccount, signIn, signOut } from '@/lib/accounts';

const read = (name) => { try { return JSON.parse(localStorage.getItem('ah_' + name)) || []; } catch { return []; } };
const write = (name, rows) => localStorage.setItem('ah_' + name, JSON.stringify(rows));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

const entity = (name) => ({
  async filter(query = {}, opts = {}) {
    let rows = read(name).filter((r) => Object.entries(query || {}).every(([k, v]) => r[k] === v));
    if (opts.sort) {
      const desc = opts.sort.startsWith('-');
      const key = opts.sort.replace(/^-/, '');
      rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (desc ? -1 : 1));
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return { items: rows, total: rows.length };
  },
  async count(query = {}) { return (await this.filter(query)).items.length; },
  async get(id) {
    const row = read(name).find((r) => r.id === id);
    if (!row) throw new Error(`${name} not found`);
    return row;
  },
  async create(data) {
    const now = new Date().toISOString();
    const row = { ...data, id: uid(), created_date: now, updated_date: now };
    write(name, [...read(name), row]);
    return row;
  },
  async update(id, data) {
    let out;
    write(name, read(name).map((r) => (r.id === id ? (out = { ...r, ...data, updated_date: new Date().toISOString() }) : r)));
    if (!out) throw new Error(`${name} not found`);
    return out;
  },
  async delete(id) { write(name, read(name).filter((r) => r.id !== id)); return { id }; },
});

// (localUser removed by BYOK: auth now comes from src/lib/accounts.js)
const noAuth = async () => { throw new Error('Not available in this version.'); };

export const base44 = {
  entities: { Ticket: entity('Ticket'), Vehicle: entity('Vehicle') },
  functions: { invoke: invokeFunction },
  app: { getPublicSettings: async () => ({ id: 'local', public_settings: {} }) },
  auth: {
    me: async () => getSessionUser(),
    isAuthenticated: async () => !!getCurrentAccount(),
    logout: () => { signOut(); },
    redirectToLogin: () => {},
    setToken: () => {},
    loginWithProvider: async () => { throw new Error('Google sign-in is not available. Create an account with email and password.'); },
    loginViaEmailPassword: async (email, password) => { await signIn(email, password); },
    register: async ({ email, password }) => { const u = await createAccount({ email, password }); return { user: u }; },
    verifyOtp: noAuth,
    resendOtp: noAuth, resetPasswordRequest: noAuth, resetPassword: noAuth,
  },
};
