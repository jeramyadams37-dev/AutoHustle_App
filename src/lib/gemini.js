// v10: AI calls go through the AutoHustle backend — never directly to Gemini.
// The old version prompted the user for a Gemini API key and stored it in
// localStorage, then called generativelanguage.googleapis.com from the app.
// That exposed the key and broke the moment the key was rotated.
// Now every call below POSTs to the backend (Cloud Run by default, or
// http://localhost:3000 when running the bundled server.ts in dev).
// The backend holds the Gemini key server-side (GEMINI_API_KEY env var).
// This file keeps the same `invokeFunction(name, payload)` interface used by
// NewTicket, Codes, TicketDetail and ChatPanel, so no page had to change.
import { MASTER_PROMPT, TICKET_SCHEMA, buildTicketPrompt } from './ticketSchema.js';
import { getGeminiKey } from './apiKeys.js';

const CLOUD_RUN_URL = 'https://auto-hustle-backend-926589006847.us-central1.run.app';

export function getBackendUrl() {
  const saved = localStorage.getItem('backend_url');
  if (saved) return saved.replace(/\/$/, '');
  // Local dev server (server.ts) when the app is served from localhost.
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port !== '' && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
    return 'http://localhost:3000';
  }
  return CLOUD_RUN_URL;
}

async function postJson(path, body) {
  const key = getGeminiKey();
  const res = await fetch(`${getBackendUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Gemini-Key': key } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data?.error === 'missing_gemini_key') {
      const e = new Error('Add your free Gemini key in Settings → API Keys to run a diagnosis.');
      e.code = 'MISSING_GEMINI_KEY';
      throw e;
    }
    throw new Error(data?.error || `Backend error ${res.status}`);
  }
  return data;
}

// True when an error means "this user has no Gemini key saved".
export function isMissingKeyError(err) {
  if (!err) return false;
  if (err.code === 'MISSING_GEMINI_KEY') return true;
  const m = typeof err === 'string' ? err : (err.message || '');
  return m.includes('API Keys') || m.includes('missing_gemini_key');
}

// Prompt-based diagnosis (ticket generation, Q&A, code lookup, re-rank).
// The backend's /api/diagnose endpoint runs the prompt through Gemini
// server-side and returns { text }.
async function gen(prompt, json = false) {
  const data = await postJson('/api/diagnose', { prompt, json });
  const text = data?.text || '';
  if (!text) throw new Error('Empty response from the backend.');
  return text;
}

function parseJson(text) {
  let s = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

const jsonTail = (schema) =>
  `\n\nRespond with ONLY a single valid JSON object matching this schema (no markdown fences, no commentary):\n${JSON.stringify(schema)}`;

const OBD_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' }, meaning: { type: 'string' }, system: { type: 'string' }, severity: { type: 'string' },
    common_causes: { type: 'array', items: { type: 'string' } },
    first_test: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, expected_reading: { type: 'string' } } },
  },
};

const RERANK_SCHEMA = {
  type: 'object',
  properties: {
    ranked_causes: { type: 'array', items: { type: 'object', properties: { cause: { type: 'string' }, likelihood: { type: 'string' }, reasoning: { type: 'string' } } } },
    next_step: { type: 'string' },
    diagnosis: { type: 'string' },
  },
};

const handlers = {
  async generateTicket({ vehicle, symptoms, dtcs }) {
    if (!vehicle || !vehicle.make || !symptoms) throw new Error('Vehicle (make) and symptoms are required');
    const text = await gen(buildTicketPrompt(vehicle, symptoms, dtcs || '') + jsonTail(TICKET_SCHEMA), true);
    return { ticket_data: parseJson(text), illustrations: { engine_bay: null } };
  },

  async askMechanic({ vehicle_summary, symptoms, ticket_data, messages, question }) {
    if (!question) throw new Error('A question is required');
    const ctx = JSON.stringify(ticket_data || {}).slice(0, 6000);
    const convo = (messages || []).map((m) => `${m.role === 'user' ? 'Mechanic-in-training' : 'Master Mechanic'}: ${m.content}`).join('\n').slice(0, 4000);
    const prompt = `${MASTER_PROMPT}\n\nYou are answering follow-up questions on an existing Diagnostic Shop Ticket.\nVehicle: ${vehicle_summary || 'unknown'}\nSymptoms: ${symptoms || 'unknown'}\nTicket data (JSON): ${ctx}\nConversation so far:\n${convo}\n\nNew question from the mechanic-in-training:\n${question}\n\nAnswer specifically to this vehicle. Put cheap checks first. Flag any safety concern. If unsure about a spec, say so. Be concise and practical — 2-5 short paragraphs, plain text, no markdown headings.`;
    return { reply: await gen(prompt) };
  },

  async obd2Lookup({ code }) {
    if (!code) throw new Error('A DTC code is required');
    const clean = code.trim().toUpperCase().replace(/\s+/g, '');
    const prompt = `${MASTER_PROMPT}\n\nLook up OBD2 diagnostic trouble code ${clean}. Return its meaning, the system it belongs to, severity (Low/Medium/High), the most common causes ranked cheapest-check-first, and the single first test a mechanic should run (name, description, expected reading). If the code format is invalid or unknown, set meaning to "Unknown code — verify with your scanner" and still return the structure.` + jsonTail(OBD_SCHEMA);
    return parseJson(await gen(prompt, true));
  },

  async rerankCauses({ vehicle_summary, symptoms, root_causes, logged_readings }) {
    if (!root_causes) throw new Error('root_causes required');
    const prompt = `${MASTER_PROMPT}\n\nVehicle: ${vehicle_summary || 'unknown'}\nSymptoms: ${symptoms || 'unknown'}\n\nOriginal ranked root causes:\n${JSON.stringify(root_causes)}\n\nThe mechanic has now logged these measured readings from diagnostic tests:\n${JSON.stringify(logged_readings || [])}\n\nRe-rank the root causes from MOST to LEAST likely given these actual readings, with a one-line reasoning for each. Then state the single next step the mechanic should take, and a short diagnosis summary if the readings point to a clear conclusion. Put cheap/easy confirmations first. If a reading rules a cause out, drop its likelihood to Low and say why.` + jsonTail(RERANK_SCHEMA);
    return parseJson(await gen(prompt, true));
  },
};

export async function invokeFunction(name, payload) {
  if (!handlers[name]) throw new Error(`Unknown function: ${name}`);
  return { data: await handlers[name](payload || {}) };
}

// Live-data diagnosis (used by the Live Scan page): sends the codes and the
// readings from the ELM327 adapter to the backend's /diagnose endpoint,
// which returns { urgency, plain_language_summary, likely_causes,
// estimated_cost_range_usd, recommended_next_step } — the same contract the
// Bluetooth MVP used.
export async function diagnoseLive({ codes, liveData, vehicle }) {
  return postJson('/diagnose', { codes: codes || [], liveData: liveData || {}, vehicle: vehicle || {} });
}
