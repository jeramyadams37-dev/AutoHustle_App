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
