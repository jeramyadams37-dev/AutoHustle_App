import { MASTER_PROMPT, TICKET_SCHEMA, buildTicketPrompt } from './ticketSchema.js';

const getModel = () => localStorage.getItem('gemini_model') || 'gemini-3.6-flash';

function getKey() {
  let k = localStorage.getItem('gemini_key');
  if (!k) {
    k = (window.prompt('Paste your Gemini API key (saved on this device only):') || '').trim();
    if (k) localStorage.setItem('gemini_key', k);
  }
  if (!k) throw new Error('A Gemini API key is required.');
  return k;
}

async function gen(prompt, json = false) {
  const key = getKey();
  const models = [...new Set([getModel(), 'gemini-3.5-flash', 'gemini-3.5-flash-lite'])];
  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res, data;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: json ? { responseMimeType: 'application/json' } : {},
            }),
          }
        );
        data = await res.json().catch(() => ({}));
      } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (res.ok) {
        const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        if (text) return text;
        lastErr = new Error('Empty response from Gemini.');
        continue;
      }
      const msg = data?.error?.message || `Gemini error ${res.status}`;
      if (/api key/i.test(msg) || res.status === 401 || res.status === 403) {
        localStorage.removeItem('gemini_key');
        throw new Error(msg);
      }
      lastErr = new Error(msg);
      if ([429, 500, 503, 504].includes(res.status)) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (res.status === 404) break;
      throw lastErr;
    }
  }
  throw lastErr || new Error('Gemini request failed.');
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
