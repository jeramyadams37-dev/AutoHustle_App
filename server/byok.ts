// AutoHustle BYOK — per-request Gemini key resolution (server side).
// The backend NEVER silently uses Jeramy's key for a user's request.
// A request must carry the user's own key (X-Gemini-Key header or a
// geminiKey field in the JSON body). Without one, the endpoint answers
// 401 { error: 'missing_gemini_key' } and the app shows the user how to
// add their free key in Settings → API Keys.
// The server env key (GEMINI_API_KEY) is used ONLY when the operator
// explicitly opts in with ALLOW_SERVER_KEY_FALLBACK=true (default OFF).
// The resolved key is used for one call only and is never logged or stored.
import { GoogleGenAI } from '@google/genai';

export const MODEL = 'gemini-3-flash-preview';
const FALLBACK_ALLOWED = process.env.ALLOW_SERVER_KEY_FALLBACK === 'true';

// Resolve the Gemini key for this request. Returns { key, source } or null.
export function resolveGeminiKey(req: any): { key: string; source: string } | null {
  const headerKey = (req.headers['x-gemini-key'] || '').toString().trim();
  if (headerKey) return { key: headerKey, source: 'request-header' };
  const bodyKey = req.body && req.body.geminiKey ? String(req.body.geminiKey).trim() : '';
  if (bodyKey) return { key: bodyKey, source: 'request-body' };
  if (FALLBACK_ALLOWED && process.env.GEMINI_API_KEY) {
    return { key: process.env.GEMINI_API_KEY, source: 'server-fallback' };
  }
  return null;
}

// Send the standard missing-key answer. Returns the key string when one
// was supplied; returns null (after sending the 401) when it was not,
// so the handler should `return` after calling this.
export function requireGeminiKey(req: any, res: any): string | null {
  const resolved = resolveGeminiKey(req);
  if (resolved) return resolved.key;
  res.status(401).json({
    error: 'missing_gemini_key',
    message: 'Add your free Gemini key in Settings → API Keys, then try again. The key is free from Google AI Studio and stays on your phone.',
  });
  return null;
}

export function makeGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}
