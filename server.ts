// v10 backend — adapted from the AI Studio Auto-Hustle server.ts.
// The Gemini API key lives ONLY here, in the GEMINI_API_KEY env var.
// The app never sees it: the client calls these two endpoints instead.
//   POST /api/diagnose  { prompt, json? } -> { text }
//     Prompt-based diagnosis used by ticket generation, code lookup,
//     re-ranking and the Ask-the-Mechanic chat (same handlers as the app).
//   POST /diagnose  { codes, liveData, vehicle } -> { urgency,
//     plain_language_summary, likely_causes, estimated_cost_range_usd,
//     recommended_next_step }
//     Live-data diagnosis used by the Live Scan page — the same contract
//     the Bluetooth MVP's Cloud Run backend already serves.
// Run locally:  npm run server   (needs GEMINI_API_KEY in .env)
// Deploy: set GEMINI_API_KEY as an env var / secret on Cloud Run.
// No key, no credential and no secret is ever stored in this repo.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';
const PORT = process.env.PORT || 3000;

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const getClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

  const generate = async (prompt, json = false) => {
    const genAI = getClient();
    if (!genAI) throw new Error('Gemini API key is not configured on the server.');
    const response = await genAI.models.generateContent({
      model: MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      ...(json ? { config: { responseMimeType: 'application/json' } } : {}),
    });
    return response.text || '';
  };

  // Prompt-based diagnosis (ticket generation, lookup, chat, re-rank).
  app.post('/api/diagnose', async (req, res) => {
    try {
      const { prompt, json } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required' });
      }
      const text = await generate(prompt, !!json);
      res.json({ text });
    } catch (error) {
      console.error('Diagnosis error:', error.message || error);
      res.status(500).json({ error: error.message || 'Diagnosis failed' });
    }
  });

  // Live-data diagnosis (Live Scan page / Bluetooth MVP contract).
  app.post('/diagnose', async (req, res) => {
    try {
      const { codes, liveData, vehicle } = req.body || {};
      const v = vehicle || {};
      const vehicleLine = [v.year, v.make, v.model, v.engine].filter(Boolean).join(' ') || 'unknown vehicle';
      const prompt = `AuroraOS Master Mechanic. A driver needs to know if their car is safe to drive for work today.\nVehicle: ${vehicleLine}.\nTrouble codes: ${(codes || []).join(', ') || 'none'}.\nLive data from the OBD2 adapter: ${JSON.stringify(liveData || {})}.\n\nReply with ONLY a single valid JSON object (no markdown fences, no commentary) with these fields:\n- urgency: one of "Low", "Medium", "High", "Do not drive"\n- plain_language_summary: 2-3 plain sentences a driver understands\n- likely_causes: array of 2-4 short strings, cheapest check first\n- estimated_cost_range_usd: a short range string like "$80-$250"\n- recommended_next_step: one concrete next action\n\nPut cheap checks first. Flag any safety concern. If a code is a misfire (P0300-P0308) or coolant temp is over 105°C, urgency must be "High" or "Do not drive".`;
      const text = await generate(prompt, true);
      let out;
      try {
        const s = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        out = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
      } catch {
        out = {
          urgency: 'Medium',
          plain_language_summary: text.slice(0, 500),
          likely_causes: [],
          estimated_cost_range_usd: 'Unknown — get a quote',
          recommended_next_step: 'Run a full diagnostic ticket in the app.',
        };
      }
      res.json(out);
    } catch (error) {
      console.error('Live diagnosis error:', error.message || error);
      res.status(500).json({ error: error.message || 'Diagnosis failed' });
    }
  });

  // On-demand parts pricing + nearby stores (Google Places) + labor estimate.
  const findStores = async (zip) => {
    const key = process.env.PLACES_API_KEY;
    if (!key) return { stores: [], note: 'Store lookup is not configured on the server.' };
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.regularOpeningHours.weekdayDescriptions,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: `auto parts store near ${zip}`, includedType: 'auto_parts_store', maxResultCount: 8 }),
    });
    if (!r.ok) {
      console.error('Places error:', r.status, (await r.text()).slice(0, 300));
      return { stores: [], note: `Store lookup failed (HTTP ${r.status}).` };
    }
    const j = await r.json();
    const stores = (j.places || []).map((p) => {
      const nm = p.displayName?.text || '';
      const addr = p.formattedAddress || '';
      return {
        name: nm,
        address: addr,
        phone: p.nationalPhoneNumber || '',
        hours: p.regularOpeningHours?.weekdayDescriptions || [],
        maps_url: p.googleMapsUri || '',
        directions_url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${nm} ${addr}`)}`,
      };
    });
    return { stores, note: stores.length ? '' : 'No auto parts stores found for that ZIP.' };
  };

  app.post('/api/parts', async (req, res) => {
    try {
      const { vehicle, repair, items, zip } = req.body || {};
      if (!/^\d{5}$/.test(String(zip || ''))) return res.status(400).json({ error: 'A 5-digit ZIP code is required.' });
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array is required.' });
      const list = items.slice(0, 40)
        .map((i) => `${i.is_tool ? 'TOOL' : 'PART'}: ${String(i.name).slice(0, 100)}${i.quantity ? ` x${i.quantity}` : ''}`)
        .join('\n');
      const prompt = `Use Google Search. Vehicle: ${String(vehicle || 'unknown').slice(0, 120)}. Repair: ${String(repair || 'unknown').slice(0, 200)}. Location ZIP: ${zip}.
Find current typical US retail prices (USD) for each item below, and the typical hourly labor rate for an independent auto repair shop near ZIP ${zip}, plus a realistic labor-hours range for this repair.
Return ONLY a JSON object, no markdown:
{"items":[{"name":"","low":0,"high":0,"source":"","url":""}],"labor":{"hours_low":0,"hours_high":0,"rate_low":0,"rate_high":0,"rate_source":""}}
Rules: use null for any number you could not find, never guess. Only give a url that appeared in your search results. Keep item names exactly as given.
${list}`;
      const genAI = getClient();
      if (!genAI) throw new Error('Gemini API key is not configured on the server.');
      const [storeRes, aiRes] = await Promise.allSettled([
        findStores(zip),
        genAI.models.generateContent({ model: MODEL, contents: [{ parts: [{ text: prompt }] }], config: { tools: [{ googleSearch: {} }] } }),
      ]);
      const st = storeRes.status === 'fulfilled' ? storeRes.value : { stores: [], note: 'Store lookup failed.' };
      let prices = { items: [], labor: null };
      let sources = [];
      let price_note = '';
      if (aiRes.status === 'fulfilled') {
        try {
          const t = (aiRes.value.text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
          prices = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
        } catch { price_note = 'Could not read the price results. Try again.'; }
        const chunks = aiRes.value.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        sources = chunks.map((c) => ({ title: c.web?.title || '', url: c.web?.uri || '' })).filter((c) => c.url).slice(0, 10);
      } else {
        console.error('Parts pricing error:', aiRes.reason?.message || aiRes.reason);
        price_note = 'Price lookup failed. Try again in a minute.';
      }
      res.json({ ...prices, stores: st.stores, store_note: st.note, price_note, sources, disclaimer: 'Prices and labor are estimates from web search, not quotes. Call the store to confirm.' });
    } catch (error) {
      console.error('Parts error:', error.message || error);
      res.status(500).json({ error: error.message || 'Parts lookup failed' });
    }
  });

  app.get('/health', (_req, res) => res.json({ ok: true, model: MODEL }));

  // Serve the built app in production.
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AutoHustle backend on port ${PORT} (model ${MODEL})`);
  });
}

startServer();
